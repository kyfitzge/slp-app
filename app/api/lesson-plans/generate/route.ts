import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getDataForLessonPlan } from "@/lib/queries/lesson-plans";
import Anthropic from "@anthropic-ai/sdk";
import { format } from "date-fns";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SESSION_TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: "Individual", GROUP: "Group",
  EVALUATION: "Evaluation", RE_EVALUATION: "Re-Evaluation", CONSULTATION: "Consultation",
};

type StudentData = Awaited<ReturnType<typeof getDataForLessonPlan>>["student"];
type SessionData = Awaited<ReturnType<typeof getDataForLessonPlan>>["sessions"];

function buildGoalsSection(student: StudentData): string {
  if (!student) return "No student data found.";
  if (student.goals.length === 0) return "No active goals on file.";
  return student.goals.map(g => {
    const name = g.shortName ?? g.goalText.slice(0, 80);
    const target = g.targetAccuracy != null ? `${Math.round(g.targetAccuracy)}%` : "N/A";
    const baseline = g.baselineScore != null ? `Baseline: ${g.baselineScore}%` : "";
    const recentPoints = g.dataPoints.slice(-6);
    const dataStr = recentPoints.length === 0 ? "No recent data." : recentPoints.map(dp => {
      const date = format(new Date(dp.collectedAt), "MMM d");
      const pct = dp.accuracy != null ? `${Math.round(dp.accuracy)}%` : "—";
      const trials = dp.trialsCorrect != null && dp.trialsTotal != null ? ` (${dp.trialsCorrect}/${dp.trialsTotal})` : "";
      const cue = dp.cueingLevel ? `, ${dp.cueingLevel}` : "";
      return `  ${date}: ${pct}${trials}${cue}`;
    }).join("\n");
    return [`Goal: ${name}`, `Domain: ${g.domain}`, `Target: ${target}`, baseline, `Recent data:\n${dataStr}`].filter(Boolean).join("\n");
  }).join("\n\n---\n\n");
}

function buildSessionsSection(sessions: SessionData): string {
  if (sessions.length === 0) return "No recent sessions on file.";
  return sessions.map(s => {
    const date = format(new Date(s.sessionDate), "MMM d, yyyy");
    const type = SESSION_TYPE_LABEL[s.sessionType] ?? s.sessionType;
    const dur = s.durationMins ? ` (${s.durationMins} min)` : "";
    const note = s.notes.map(n => n.noteText).filter(Boolean).join(" ") || "(no notes)";
    const dataStr = s.dataPoints.length > 0
      ? s.dataPoints.map(dp => `  ${dp.goal?.shortName ?? dp.goal?.domain ?? "Goal"}: ${dp.accuracy != null ? `${Math.round(dp.accuracy)}%` : "—"}${dp.cueingLevel ? ` (${dp.cueingLevel})` : ""}`).join("\n")
      : "";
    return [`${date} — ${type}${dur}`, `Notes: ${note}`, dataStr ? `Data:\n${dataStr}` : ""].filter(Boolean).join("\n");
  }).join("\n\n");
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json() as {
      studentId: string;
      studentId2?: string | null;
      sessionDate: string;
      sessionType: string;
      durationMins?: number;
      slpNotes?: string;
    };

    const { studentId, studentId2, sessionDate, sessionType, durationMins = 30, slpNotes } = body;
    if (!studentId || !sessionDate || !sessionType) {
      return NextResponse.json({ error: "studentId, sessionDate, and sessionType are required" }, { status: 400 });
    }

    const { student, sessions, student2, sessions2 } = await getDataForLessonPlan(user.id, studentId, studentId2 ?? null);
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    const isGroup = !!student2;
    const sessionLabel = SESSION_TYPE_LABEL[sessionType] ?? sessionType;

    // ── IEP sections ─────────────────────────────────────────────────────────
    const buildIepSection = (s: StudentData) => {
      if (!s) return "No active IEP.";
      const iep = s.ieps[0];
      return iep ? [
        `Status: ${iep.status}`,
        iep.minutesPerWeek ? `Minutes/week: ${iep.minutesPerWeek}` : "",
        iep.serviceLocation ? `Setting: ${iep.serviceLocation}` : "",
        iep.presentLevels ? `Present Levels: ${iep.presentLevels}` : "",
      ].filter(Boolean).join("\n") : "No active IEP.";
    };

    // ── System prompt ─────────────────────────────────────────────────────────
    const systemPrompt = `You are an experienced school-based Speech-Language Pathologist creating a practical, ready-to-use session lesson plan${isGroup ? " for a group session with two students" : ""}. Write as a clinical colleague — concise, specific, and immediately actionable.

${isGroup ? `This is a GROUP SESSION. Both students are present. Design activities that:
- Can be delivered to both students simultaneously
- Allow independent skill targets for each student within shared activities
- Specify clearly which cueing or target applies to which student (use first names)
- Balance time and attention fairly between both students
` : ""}
Use each student's recent performance data to prioritize goals with lower or inconsistent accuracy, match cueing to current skill level, and build in natural data collection moments.

OUTPUT FORMAT — use these exact section headers:

## LEARNING OBJECTIVES
${isGroup ? `List 2–3 bullets per student, labeled "${student.firstName}:" and "${student2!.firstName}:". Each starts with the student's name and "will..."` : `List 2–4 bullets starting with "${student.firstName} will..."`}

## WARM-UP (5 min)
${isGroup ? "A shared activity that engages both students." : "A brief, low-stakes activity to focus the student."}

## ACTIVITY 1: [DESCRIPTIVE TITLE] ([X] min)
**Target:** [goal / domain${isGroup ? " — specify student if different" : ""}]
**Description:** [step-by-step procedure]
**Materials:** [comma-separated list]
**Cueing:** [hierarchy — start independent, scaffold up${isGroup ? "; note per-student cueing if different" : ""}]
**Data:** [how to record]

## ACTIVITY 2: [DESCRIPTIVE TITLE] ([X] min)
[same format]

(Add Activity 3 only if time allows)

## CLOSING (3–5 min)
Brief review or self-monitoring check-in.

## HOME PRACTICE
1–2 parent-friendly carryover activities.${isGroup ? " Can address both students or be student-specific." : ""}

## MATERIALS NEEDED
Bullet list of everything required.

Keep it tight. No padding. Write as if handing this to a colleague 10 minutes before the session.`;

    // ── User message ──────────────────────────────────────────────────────────
    let userMessage = `Generate a lesson plan for the following session.\n\n`;
    userMessage += `SESSION DATE: ${sessionDate}\nSESSION TYPE: ${sessionLabel}\nDURATION: ${durationMins} minutes\n`;
    if (slpNotes) userMessage += `\nSLP NOTES / FOCUS:\n${slpNotes}\n`;

    if (isGroup) {
      userMessage += `\n${"─".repeat(60)}\nSTUDENT 1: ${student.firstName} ${student.lastName}`;
      if (student.gradeLevel) userMessage += `\nGrade: ${student.gradeLevel}`;
      userMessage += `\n\nACTIVE IEP:\n${buildIepSection(student)}\n\nACTIVE GOALS AND RECENT DATA:\n${buildGoalsSection(student)}\n\nRECENT SESSIONS:\n${buildSessionsSection(sessions)}`;
      userMessage += `\n\n${"─".repeat(60)}\nSTUDENT 2: ${student2!.firstName} ${student2!.lastName}`;
      if (student2!.gradeLevel) userMessage += `\nGrade: ${student2!.gradeLevel}`;
      userMessage += `\n\nACTIVE IEP:\n${buildIepSection(student2)}\n\nACTIVE GOALS AND RECENT DATA:\n${buildGoalsSection(student2)}\n\nRECENT SESSIONS:\n${buildSessionsSection(sessions2)}`;
    } else {
      userMessage += `\nSTUDENT: ${student.firstName} ${student.lastName}`;
      if (student.gradeLevel) userMessage += `\nGrade: ${student.gradeLevel}`;
      if (student.schoolName) userMessage += `\nSchool: ${student.schoolName}`;
      userMessage += `\n\nACTIVE IEP:\n${buildIepSection(student)}\n\nACTIVE GOALS AND RECENT DATA:\n${buildGoalsSection(student)}\n\nRECENT SESSIONS:\n${buildSessionsSection(sessions)}`;
    }

    const model = process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5";
    const message = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const planText = message.content[0]?.type === "text" ? message.content[0].text : "";
    return NextResponse.json({ planText });
  } catch (err) {
    console.error("[POST /api/lesson-plans/generate]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
