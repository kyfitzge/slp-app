import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getSessionsForReport } from "@/lib/queries/sessions";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();

    const { studentId, startDate, endDate, goalIds } = body as {
      studentId: string;
      startDate: string;
      endDate: string;
      goalIds?: string[];
    };

    if (!studentId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "studentId, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    const { student, sessions } = await getSessionsForReport(user.id, {
      studentId,
      startDate: new Date(startDate + "T00:00:00"),
      endDate: new Date(endDate + "T23:59:59"),
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Filter goals to goalIds if provided
    const goals =
      goalIds && goalIds.length > 0
        ? student.goals.filter((g) => goalIds.includes(g.id))
        : student.goals;

    // Collect warnings
    const dataWarnings: string[] = [];

    for (const goal of goals) {
      if (goal.dataPoints.length === 0) {
        dataWarnings.push(`No data available for goal: ${goal.shortName ?? goal.goalText.slice(0, 50)}`);
      } else if (goal.dataPoints.length < 3) {
        dataWarnings.push(`Limited data available for goal: ${goal.shortName ?? goal.goalText.slice(0, 50)}`);
      }
    }

    const allSessionNotes = sessions.flatMap((s) => s.notes);
    if (allSessionNotes.length === 0) {
      dataWarnings.push("No session notes available for this period");
    }

    const hasLimitedData =
      goals.every((g) => g.dataPoints.length < 3) || sessions.length < 2;

    // Build prompt
    const studentName = `${student.firstName} ${student.lastName}`;
    const gradeInfo = student.gradeLevel ? `Grade: ${student.gradeLevel}` : "";
    const schoolInfo = student.schoolName ? `School: ${student.schoolName}` : "";

    const goalsSection = goals
      .map((goal) => {
        const goalName = goal.shortName ?? goal.goalText.slice(0, 60);
        const targetPct = Math.round(goal.targetAccuracy * 100);
        const dataPointsText =
          goal.dataPoints.length === 0
            ? "  No data points collected in this period."
            : goal.dataPoints
                .map((dp) => {
                  const date = new Date(dp.collectedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  });
                  const pct = Math.round(dp.accuracy * 100);
                  const cueing = dp.cueingLevel ? `, cueing: ${dp.cueingLevel}` : "";
                  const trials =
                    dp.trialsCorrect != null && dp.trialsTotal != null
                      ? `, trials: ${dp.trialsCorrect}/${dp.trialsTotal}`
                      : "";
                  return `  - ${date}: ${pct}%${cueing}${trials}`;
                })
                .join("\n");

        return [
          `Goal: ${goalName}`,
          `Domain: ${goal.domain}`,
          `Target accuracy: ${targetPct}%`,
          `Status: ${goal.status}`,
          `Data points (${goal.dataPoints.length}):`,
          dataPointsText,
        ].join("\n");
      })
      .join("\n\n");

    const notesSection =
      allSessionNotes.length === 0
        ? "No session notes available for this period."
        : sessions
            .filter((s) => s.notes.length > 0)
            .map((s) => {
              const date = new Date(s.sessionDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              });
              const notesText = s.notes.map((n) => n.noteText).join(" ");
              return `[${date}] ${notesText}`;
            })
            .join("\n");

    const periodStart = new Date(startDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const periodEnd = new Date(endDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const systemPrompt = `You are a school-based Speech-Language Pathologist authoring a formal progress report. This report is a completed clinical document written by the SLP and addressed to an outside reader — a parent, guardian, administrator, or IEP team member. It must read as though the SLP wrote and signed it.

Before writing, reason through the data:
- For each goal, review the accuracy scores, cueing levels, and session notes over time
- Identify whether performance is trending up, down, inconsistent, or has too little data to judge
- Note whether gains are independent or still require support
- If data is sparse (fewer than 3 points), say so plainly — don't stretch it

---

## Output Format

Write continuous, flowing prose — no headers, no bullet points, no labels. The report should read exactly as a finished SLP progress report that would be sent home or filed in a student's record.

Start with a short opening paragraph (2–4 sentences) that identifies the student, the reporting period, and gives a plain-language summary of overall progress this period — what areas are developing well and what is still emerging.

Then address each goal in its own short paragraph. Name the skill naturally in the prose — no subsection titles. Each paragraph should cover: what was worked on, specific performance data where meaningful (percentages, cueing level, trial counts), and what that data indicates about the student's progress. Keep each paragraph to 3–5 sentences.

Close with a brief paragraph (2–4 sentences) on next steps and recommendations. Ground suggestions in what the data showed.

---

## Writing Rules
- Write in the voice of the SLP as the author: "During this reporting period, [student] received speech-language services…" or "Progress data indicate…"
- Refer to the student in the third person — use their first name naturally, or "the student" when varied phrasing is needed
- Professional, clear, and readable — suitable for a parent or administrator unfamiliar with clinical jargon; define or rephrase technical terms when used
- Include specific data (dates, percentages, cueing levels) only where they add meaning
- Use appropriately cautious language: "data suggest," "appears to be," "progress is variable"
- Never invent data, scores, or observations not in the provided material
- Do not claim mastery unless performance is consistently at or above target across multiple sessions
- If data is limited for a goal, acknowledge it in one direct sentence and move on — do not pad
- No introductory meta-commentary, no "this report covers," no self-referential framing — open with the student
- Keep the whole report tight: quality over length

---

## Source Attribution Markers — REQUIRED

Tag every substantive phrase with exactly one marker. Use square-bracket tags ONLY — never use curly braces { } for tagging.

**[IEP]...[/IEP]** — content drawn directly from the IEP: goal names, target accuracy percentages, IEP status, goal domains, baseline scores, service dates.
Example: [IEP]Ethan's /r/ articulation goal targets 80% accuracy[/IEP]

**[NOTE]...[/NOTE]** — content drawn directly from session notes or recorded data points: observed accuracy percentages, trial counts, cueing levels, activities, behavioral observations.
Example: [NOTE]Ethan produced /r/ correctly on 6 of 10 trials with direct verbal cues[/NOTE]

**\*\*...\*\*** — content you inferred, synthesized, or added: trend interpretations, clinical conclusions, normalized phrasing, recommended next steps, transitional sentences.
Example: \*\*progress appears to be emerging, with accuracy improving across sessions\*\*

Rules:
- Use ONLY these three marker styles — [IEP][/IEP], [NOTE][/NOTE], and **
- NEVER use { or } — curly braces are forbidden
- NEVER use [[ or ]] or {{ or }} — double brackets of any kind are forbidden
- A single sentence may contain multiple spans of different types
- Transitional words ("During this period," "Overall,") with no clinical content may be left untagged
- Do NOT nest one marker inside another`;

    const userMessage = `Write the progress report using the student and session data below.

STUDENT INFORMATION:
Name: ${studentName}
${gradeInfo}
${schoolInfo}
Report Period: ${periodStart} – ${periodEnd}
Total Sessions in Period: ${sessions.length}
Session Notes Available: ${allSessionNotes.length}

---

GOALS AND DATA:
${goalsSection}

---

SESSION NOTES:
${notesSection}`;

    const model = process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5";

    const message = await anthropic.messages.create({
      model,
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const reportText =
      message.content[0].type === "text" ? message.content[0].text : "";

    return NextResponse.json({
      reportText,
      metadata: {
        goalsUsed: goals.map((g) => ({
          id: g.id,
          name: g.shortName ?? g.goalText.slice(0, 60),
          dataPointCount: g.dataPoints.length,
        })),
        sessionCount: sessions.length,
        sessionNoteCount: allSessionNotes.length,
        dataWarnings,
        hasLimitedData,
      },
    });
  } catch (err) {
    console.error("[POST /api/progress-reports/generate]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
