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

    const systemPrompt = `You are an experienced school-based SLP writing a progress report. Write naturally — like a thoughtful clinician wrote this, not a template. Your report must be accurate, readable, and concise.

Before writing, reason through the data:
- For each goal, review the accuracy scores, cueing levels, and session notes over time
- Identify whether performance is trending up, down, inconsistent, or has too little data to judge
- Note whether gains are independent or still require support
- If data is sparse (fewer than 3 points), say so plainly — don't stretch it

---

## Output Format

**DRAFT – Requires clinician review before distribution**

Start with a short opening paragraph (2–4 sentences) that gives a plain-language summary of the student's overall progress this period — what's going well, what's still developing. Be honest and brief.

Then, address each goal in its own short paragraph. No subsection headers needed — just name the skill naturally in the prose. Each paragraph should cover: what was observed, specific data where relevant (percentages, cueing level), and whether the student is making progress. Keep each paragraph to 3–5 sentences.

Close with a brief paragraph (2–4 sentences) on recommended next steps. Tie suggestions to what the data actually showed.

---

## Writing Rules
- Third person ("the student," "they," first name is fine after first mention)
- Professional but readable — avoid bureaucratic filler
- Include specific data (dates, percentages, cueing levels) only where they add meaning
- Use appropriately cautious language: "appears to be," "data suggest," "progress is variable"
- Never invent data, scores, or observations not in the provided material
- Don't claim mastery unless performance is consistently at or above target across multiple sessions
- If data is limited for a goal, say so in one clear sentence and move on — don't pad it
- Keep the whole report tight: quality over length

---

## Source Attribution Markers — REQUIRED

Every phrase in the report must be tagged with exactly one of three markers based on its origin. No untagged prose.

**{IEP}...{/IEP}** — wrap any content drawn directly from the IEP data: goal names, target accuracy percentages, baseline scores, service minutes, IEP status, goal domains, baseline dates.
Example: {IEP}Ethan's /r/ articulation goal targets 80% accuracy{/IEP}

**{NOTE}...{/NOTE}** — wrap any content drawn directly from session notes or recorded data points: observed accuracy percentages, trial counts, cueing levels used, specific activities, behavioral observations reported by the clinician.
Example: {NOTE}Ethan produced /r/ correctly on 6 of 10 trials with direct verbal cues{/NOTE}

**\*\*...\*\*** — wrap any content you inferred, synthesized, or added that was not explicitly stated in either the IEP data or session notes: trend interpretations, clinical conclusions, normalized language, recommended next steps, transitional prose.
Example: \*\*progress appears to be emerging, with data suggesting improving accuracy over time\*\*

Rules:
- Tag every substantive phrase — do not leave clinical claims untagged
- A single sentence may contain multiple tagged spans of different types
- Transitional words ("During this period," "Overall,") that carry no clinical meaning may be left untagged
- Do NOT nest markers inside each other`;

    const userMessage = `Generate a progress report for the following student and session data.

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
