import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getDataForLessonPlan } from "@/lib/queries/lesson-plans";
import Anthropic from "@anthropic-ai/sdk";
import { format } from "date-fns";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json() as {
      studentId: string;
      sessionDate: string;
      sessionType: string;
      durationMins?: number;
      slpNotes?: string;
    };

    const { studentId, sessionDate, sessionType, durationMins = 30, slpNotes } = body;

    if (!studentId || !sessionDate || !sessionType) {
      return NextResponse.json({ error: "studentId, sessionDate, and sessionType are required" }, { status: 400 });
    }

    const { student, sessions } = await getDataForLessonPlan(user.id, studentId);

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const firstName = student.firstName;
    const gradeInfo = student.gradeLevel ? `Grade: ${student.gradeLevel}` : "";
    const schoolInfo = student.schoolName ? `School: ${student.schoolName}` : "";

    const sessionTypeLabel: Record<string, string> = {
      INDIVIDUAL: "Individual",
      GROUP: "Group",
      EVALUATION: "Evaluation",
      RE_EVALUATION: "Re-Evaluation",
      CONSULTATION: "Consultation",
    };

    // ── Build goals section ──────────────────────────────────────────────────────
    const goalsSection = student.goals.length === 0
      ? "No active goals on file."
      : student.goals.map(g => {
          const name = g.shortName ?? g.goalText.slice(0, 80);
          const target = g.targetAccuracy != null ? `${Math.round(g.targetAccuracy)}%` : "N/A";
          const baseline = g.baselineScore != null ? `Baseline: ${g.baselineScore}%` : "";

          const recentPoints = g.dataPoints.slice(-6);
          const dataStr = recentPoints.length === 0
            ? "No recent data."
            : recentPoints.map(dp => {
                const date = format(new Date(dp.collectedAt), "MMM d");
                const pct = dp.accuracy != null ? `${Math.round(dp.accuracy)}%` : "—";
                const trials = dp.trialsCorrect != null && dp.trialsTotal != null
                  ? ` (${dp.trialsCorrect}/${dp.trialsTotal} trials)` : "";
                const cue = dp.cueingLevel ? `, ${dp.cueingLevel}` : "";
                return `  ${date}: ${pct}${trials}${cue}`;
              }).join("\n");

          return [
            `Goal: ${name}`,
            `Domain: ${g.domain}`,
            `Target: ${target}`,
            baseline,
            `Recent data:\n${dataStr}`,
          ].filter(Boolean).join("\n");
        }).join("\n\n---\n\n");

    // ── Build session notes section ──────────────────────────────────────────────
    const sessionsSection = sessions.length === 0
      ? "No recent sessions on file."
      : sessions.map(s => {
          const date = format(new Date(s.sessionDate), "MMM d, yyyy");
          const type = sessionTypeLabel[s.sessionType] ?? s.sessionType;
          const dur = s.durationMins ? ` (${s.durationMins} min)` : "";
          const noteTexts = s.notes.map(n => n.noteText).filter(Boolean);
          const note = noteTexts.length > 0 ? noteTexts.join(" ") : "(no notes)";
          const dataStr = s.dataPoints.length > 0
            ? s.dataPoints.map(dp => {
                const goalLabel = dp.goal?.shortName ?? dp.goal?.domain ?? "Goal";
                const pct = dp.accuracy != null ? `${Math.round(dp.accuracy)}%` : "—";
                const cue = dp.cueingLevel ? ` (${dp.cueingLevel})` : "";
                return `  ${goalLabel}: ${pct}${cue}`;
              }).join("\n")
            : "";

          return [
            `${date} — ${type}${dur}`,
            `Notes: ${note}`,
            dataStr ? `Data:\n${dataStr}` : "",
          ].filter(Boolean).join("\n");
        }).join("\n\n");

    // ── Build IEP section ─────────────────────────────────────────────────────────
    const iep = student.ieps[0];
    const iepSection = iep
      ? [
          `Status: ${iep.status}`,
          iep.minutesPerWeek ? `Minutes/week: ${iep.minutesPerWeek}` : "",
          iep.serviceLocation ? `Setting: ${iep.serviceLocation}` : "",
          iep.presentLevels ? `Present Levels: ${iep.presentLevels}` : "",
        ].filter(Boolean).join("\n")
      : "No active IEP on file.";

    // ── System prompt ─────────────────────────────────────────────────────────────
    const systemPrompt = `You are an experienced school-based Speech-Language Pathologist creating a practical, ready-to-use session lesson plan. Write as a clinical colleague — concise, specific, and immediately actionable.

Use the student's recent performance data to:
- Prioritize goals with lower or inconsistent accuracy
- Match cueing levels to where the student is currently performing
- Select activities evidence-based and appropriate to the domain and age
- Build natural data collection moments into each activity

OUTPUT FORMAT — use these exact section headers (keep them clean, no extra punctuation):

## LEARNING OBJECTIVES
List 2–4 bullets. Each starts with "${firstName} will..." and ties to a specific goal.

## WARM-UP (5 min)
One short paragraph. A brief, low-stakes activity to focus the student and activate prior knowledge.

## ACTIVITY 1: [DESCRIPTIVE TITLE] ([X] min)
**Target:** [goal name / domain]
**Description:** [step-by-step procedure, 2–4 sentences]
**Materials:** [comma-separated list]
**Cueing:** [describe the hierarchy — where to start, when to scaffold up]
**Data:** [how to record — trial-by-trial, probe, naturalistic sample, etc.]

## ACTIVITY 2: [DESCRIPTIVE TITLE] ([X] min)
[same format as Activity 1]

(Add Activity 3 only if time allows given the session length)

## CLOSING (3–5 min)
Brief self-monitoring check-in, preview of next session, or reinforcement activity.

## HOME PRACTICE
1–2 specific, parent-friendly carryover activities. Concrete and easy to describe over the phone.

## MATERIALS NEEDED
Bullet list of everything required for the session.

Keep it tight. No padding, no meta-commentary about the plan itself. Write as if handing this to a colleague 10 minutes before the session.`;

    const userMessage = `Generate a lesson plan for the following session.

STUDENT: ${firstName} ${student.lastName}
${gradeInfo}
${schoolInfo}
SESSION DATE: ${sessionDate}
SESSION TYPE: ${sessionTypeLabel[sessionType] ?? sessionType}
DURATION: ${durationMins} minutes
${slpNotes ? `\nSLP NOTES / FOCUS:\n${slpNotes}` : ""}

---

ACTIVE IEP:
${iepSection}

---

ACTIVE GOALS AND RECENT DATA:
${goalsSection}

---

RECENT SESSIONS:
${sessionsSection}`;

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
