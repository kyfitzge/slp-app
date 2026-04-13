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

    const systemPrompt = `You are an experienced school-based Speech-Language Pathologist (SLP) writing a clinical progress report for a student. Your job is to produce a structured, evidence-based report derived STRICTLY from the session data provided by the clinician. Follow the reasoning process and writing rules below exactly.

---

## Reasoning Process (follow in order)

1. **Anchor to IEP goals**
   - Only report on the goals provided in the data
   - Treat each goal as its own independent analysis unit

2. **Aggregate session data**
   - Group data points and session notes by goal
   - For each goal, extract:
     - Accuracy / performance percentages
     - Number of trials (if available)
     - Level of support / cueing level
     - Qualitative observations from session notes

3. **Identify trends**
   - Look for patterns over time: improving, declining, inconsistent, or minimal progress
   - Weigh multiple data points more heavily than a single session
   - Do NOT overgeneralize from limited data

4. **Evaluate support level**
   - Note whether performance depends on cues, prompts, or models
   - Clearly distinguish independent performance from supported performance

5. **Handle imperfect data**
   - If data is sparse (fewer than 3 data points for a goal): explicitly state "Limited data available for this period" for that goal
   - If data is inconsistent: describe the variability without forcing a conclusion
   - If only qualitative notes exist: summarize cautiously without assigning numerical trends

---

## Output Format

Use EXACTLY these section headers in this order:

**DRAFT – Requires clinician review before distribution**

## Overall Summary
High-level, cautious interpretation of overall progress across all goals. Do not over-claim. Reference the number of sessions and the reporting period.

## Progress by Goal
For EVERY goal listed in the data, create a named subsection (e.g., ### [Goal Short Name or Domain]). Each subsection must include:
- Brief performance summary with specific data (dates, percentages, trial counts where available)
- Trend: clearly state "Improving," "Declining," "Inconsistent," or "Limited data — trend unclear"
- Support level: describe cueing/prompt dependency and any changes over time
- If data is limited, state it explicitly and do not fabricate a trend

## Strengths
Observable, evidence-based strengths drawn only from the session data.

## Areas of Need
Skills or goals where data indicates insufficient progress or ongoing difficulty. Be specific and evidence-based.

## Recommended Next Steps
Clinically appropriate suggestions for the next reporting period. Tie each recommendation to a specific finding in the data.

---

## Writing Rules
- Use professional, school-based SLP language (e.g., "data indicate," "per clinician observation," "the student demonstrated")
- Write in third person ("the student," "they")
- Be concise and clinically sound
- Be specific about percentages, dates, and trial counts when data is available
- Use cautious phrasing when warranted: "appears to be improving," "progress is variable," "data are insufficient to determine"
- Do NOT invent scores, sessions, observations, or any data not explicitly provided
- Do NOT claim mastery unless performance is consistently at or above target across multiple sessions
- Do NOT use vague filler language ("great progress," "working hard") without data support

---

## Safety and Integrity
- If evidence is limited or absent for any goal, explicitly say so — do not fill gaps with assumptions
- Every conclusion in the report must be traceable to a specific data point or session note
- Prioritize accuracy and clinical integrity over completeness or confidence`;

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
      max_tokens: 4096,
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
