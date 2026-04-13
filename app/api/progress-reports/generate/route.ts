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

    const prompt = `You are an experienced Speech-Language Pathologist (SLP) writing a clinical progress report for a student. Generate a structured progress report based STRICTLY on the data provided below. Do NOT invent or assume any data not explicitly given.

IMPORTANT RULES:
- Base the report STRICTLY on provided data only — do NOT invent scores, sessions, or observations
- Use cautious, professional clinical SLP language (e.g., "per session data", "per clinician observation", "data indicate")
- If fewer than 3 data points exist for a goal, state "Limited data available for this period" for that goal
- If no session notes are available, note "No session notes available for this period"
- Label the entire output as a DRAFT requiring clinician review before distribution
- For each goal in "Progress by Goal", describe the accuracy trend over time and note any cueing level progression
- Write in third person (e.g., "the student", "they")
- Be specific about percentages and dates when data is available

STUDENT INFORMATION:
Name: ${studentName}
${gradeInfo}
${schoolInfo}
Report Period: ${periodStart} – ${periodEnd}
Total Sessions in Period: ${sessions.length}
Session Notes Available: ${allSessionNotes.length}

GOALS AND DATA:
${goalsSection}

SESSION NOTES:
${notesSection}

Generate a progress report using EXACTLY these section headers in this order:

## Overall Summary

## Progress by Goal

## Strengths

## Areas of Need

## Recommended Next Steps

Begin the report with: "**DRAFT – Requires clinician review before distribution**"

Write a thorough, clinically appropriate report. Each section should be substantive. For Progress by Goal, address every goal listed above individually with its own subsection.`;

    const model = process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5";

    const message = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
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
