/**
 * POST /api/progress-reports/chat
 *
 * AI chat assistant for progress report authoring.
 * Fetches full session notes, goal data points, and IEP details from the DB
 * so the assistant has complete clinical context to answer questions and
 * draft content intelligently.
 *
 * Structured output protocols (in addition to plain conversation):
 *   REPORT_UPDATE: <full report text>
 *   FIELD_UPDATE: <JSON: { title?, startDate?, endDate? }>
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getSessionsForReport } from "@/lib/queries/sessions";
import { getIEPsByStudentId } from "@/lib/queries/ieps";
import Anthropic from "@anthropic-ai/sdk";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ReportContext {
  studentId: string;
  studentName: string;
  gradeLevel?: string | null;
  schoolName?: string | null;
  title: string;
  startDate: string;   // "yyyy-MM-dd" or ""
  endDate: string;     // "yyyy-MM-dd" or ""
  currentDraft: string;
  goals: Array<{ name: string; domain: string; targetAccuracy: number; status: string }>;
  sessionCount: number;
}

interface ChatBody {
  messages: ChatMessage[];
  context: ReportContext;
}

const CUEING_LABELS: Record<string, string> = {
  INDEPENDENT:      "independent",
  GESTURAL:         "gestural cues",
  INDIRECT_VERBAL:  "indirect verbal cues",
  DIRECT_VERBAL:    "direct verbal cues",
  MODELING:         "modeling",
  PHYSICAL:         "physical guidance",
  MAXIMUM_ASSISTANCE: "maximum support",
};

function buildSystemPrompt(
  ctx: ReportContext,
  sessionData: Awaited<ReturnType<typeof getSessionsForReport>>,
  ieps: Awaited<ReturnType<typeof getIEPsByStudentId>>,
): string {
  const { student, sessions } = sessionData;
  const firstName = ctx.studentName.split(" ")[0];

  // ── Setup status ──────────────────────────────────────────────────────────
  const titleStatus     = ctx.title     ? `"${ctx.title}"`   : "NOT SET";
  const startStatus     = ctx.startDate ? ctx.startDate       : "NOT SET";
  const endStatus       = ctx.endDate   ? ctx.endDate         : "NOT SET";
  const setupComplete   = !!(ctx.title && ctx.startDate && ctx.endDate);

  // ── IEP section ───────────────────────────────────────────────────────────
  const activeIep = ieps.find(i => i.status === "ACTIVE") ?? ieps[0];
  const iepSection = activeIep ? [
    `IEP status: ${activeIep.status}`,
    `Effective: ${activeIep.effectiveDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    `Review date: ${activeIep.reviewDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    activeIep.minutesPerWeek ? `Service: ${activeIep.minutesPerWeek} min/week` : "",
    activeIep.presentLevels ? `\nPresent levels: ${activeIep.presentLevels}` : "",
  ].filter(Boolean).join(" | ") : "No IEP on file.";

  // ── Goals with data points ────────────────────────────────────────────────
  const goals = student?.goals ?? [];
  const goalsSection = goals.length === 0
    ? "No goals on file."
    : goals.map(g => {
        const name = g.shortName ?? g.goalText.slice(0, 80);
        const target = Math.round(g.targetAccuracy * 100);
        const baseline = g.baselineScore != null ? ` | Baseline: ${Math.round(g.baselineScore * 100)}%` : "";
        const mastered = g.masteryDate ? ` | Mastered: ${new Date(g.masteryDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : "";
        const dpLines = g.dataPoints.length === 0
          ? "    No data collected in this period."
          : g.dataPoints.map(dp => {
              const date = new Date(dp.collectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              const pct  = Math.round(dp.accuracy * 100);
              const cue  = dp.cueingLevel ? `, ${CUEING_LABELS[dp.cueingLevel] ?? dp.cueingLevel}` : "";
              const trials = dp.trialsCorrect != null && dp.trialsTotal != null
                ? `, ${dp.trialsCorrect}/${dp.trialsTotal} trials` : "";
              return `    • ${date}: ${pct}%${trials}${cue}`;
            }).join("\n");

        return [
          `Goal: ${name}`,
          `  Domain: ${g.domain} | Target: ${target}%${baseline} | Status: ${g.status}${mastered}`,
          `  Full text: ${g.goalText}`,
          `  Data points (${g.dataPoints.length} in period):`,
          dpLines,
        ].join("\n");
      }).join("\n\n");

  // ── Session notes ─────────────────────────────────────────────────────────
  const sessionsSection = sessions.length === 0
    ? "No sessions found in this period."
    : sessions.map(s => {
        const date = new Date(s.sessionDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
        const type = s.sessionType.replace(/_/g, " ");
        const dur  = s.durationMins ? `, ${s.durationMins} min` : "";
        const att  = s.sessionStudents[0]?.attendance ?? "unknown";
        const noteText = s.notes.map(n => n.noteText).filter(Boolean).join(" ").trim();
        const notes = noteText ? `\n  Notes: ${noteText}` : "\n  Notes: (none)";

        const dpSummary = s.dataPoints.length > 0
          ? "\n  Data: " + s.dataPoints.map(dp => {
              const goalName = dp.goal.shortName ?? dp.goal.goalText.slice(0, 40);
              const pct = Math.round(dp.accuracy * 100);
              const cue = dp.cueingLevel ? ` (${CUEING_LABELS[dp.cueingLevel] ?? dp.cueingLevel})` : "";
              const trials = dp.trialsCorrect != null && dp.trialsTotal != null
                ? ` ${dp.trialsCorrect}/${dp.trialsTotal}` : "";
              return `${goalName}: ${pct}%${trials}${cue}`;
            }).join("; ")
          : "";

        return `[${date}] ${type}${dur} | Attendance: ${att}${notes}${dpSummary}`;
      }).join("\n\n");

  // ── Draft section ─────────────────────────────────────────────────────────
  const draftSection = ctx.currentDraft.trim()
    ? `CURRENT REPORT DRAFT:\n"""\n${ctx.currentDraft.trim()}\n"""`
    : "No draft written yet.";

  return `You are an experienced school-based Speech-Language Pathologist helping to author a formal progress report. You have full access to the student's clinical data below — use it to answer questions accurately and draft clinically grounded content.

═══ STUDENT ═══
Name: ${ctx.studentName}${ctx.gradeLevel ? ` | Grade: ${ctx.gradeLevel}` : ""}${ctx.schoolName ? ` | School: ${ctx.schoolName}` : ""}

═══ REPORT SETUP STATUS ═══
Title:      ${titleStatus}
Start date: ${startStatus}
End date:   ${endStatus}
Sessions in period: ${sessions.length}

═══ ACTIVE IEP ═══
${iepSection}

═══ IEP GOALS & PERFORMANCE DATA ═══
${goalsSection}

═══ SESSION NOTES (${sessions.length} sessions) ═══
${sessionsSection}

═══ ${draftSection} ═══

═══ YOUR WORKFLOW ═══
${setupComplete ? `
Report setup is complete. Use the clinical data above to help the SLP build or refine the draft.
When the SLP asks about the student's performance, answer directly from the session notes and data points above — cite specific dates, percentages, and cueing levels.
` : `
The report has not been fully set up yet. YOUR FIRST PRIORITY is to collect any missing setup info — ask one item at a time:
  1. Report title (e.g. "Q1 2026", "Fall Semester", "Annual Progress")
  2. Reporting period start date
  3. Reporting period end date
Once you have all three, confirm and move on to building the report.
`}

You can help the SLP with any of:
— Answering questions about ${firstName}'s performance using the session data above
— Drafting the full report from the clinical data and/or additional notes the SLP shares
— Refining or improving existing sections
— Adjusting tone (e.g. "make this more parent-friendly")
— Suggesting stronger clinical language
— Reviewing a draft for completeness and accuracy

═══ WRITING RULES (for report text) ═══
— Write in the SLP's voice, addressed to the reader (parent/administrator/IEP team)
— Third person: use "${firstName}" or "the student"
— Past tense, professional, parent-readable prose
— No headers, bullets, or markdown structure in report text — flowing paragraphs only
— Base all claims on the data provided — never fabricate numbers or observations

═══ SOURCE ATTRIBUTION MARKERS (required in all REPORT_UPDATE drafts) ═══

Every substantive phrase in report text must carry exactly one marker. Use square-bracket tags only — never curly braces.

[IEP]...[/IEP] — content whose sole source is the IEP record: goal names, target accuracy percentages, goal domains, baseline scores, IEP status, service dates, present levels text.
Example: [IEP]${firstName}'s articulation goal targets 80% accuracy[/IEP]

[NOTE]...[/NOTE]** — content traceable to session notes or recorded data points. Be generous — if a fact came from the session data, tag it. Includes: observed accuracy percentages, trial counts, cueing levels, activities, behavioral observations, date-specific performance, rephrased note content.
Example: [NOTE]${firstName} produced the target correctly on 6 of 10 trials with direct verbal cues[/NOTE]
Also: if a note says "needed lots of help" and you write "required significant cueing support," that still goes in [NOTE].
When in doubt between [NOTE] and **: factual descriptions of what happened in sessions → [NOTE]. Interpretation layered on top → **.

**...** — content YOU inferred, synthesized, or concluded that was not explicitly stated in the IEP or notes.
ALWAYS mark with **: trend interpretations ("accuracy appears to be improving"), progress conclusions ("suggests the skill has not yet generalized"), recommendations and next steps, clinical elaborations beyond what the notes literally say, any sentence you constructed to connect or summarize data, anything described as "suggests," "indicates," or "appears."
NEVER mark with **: specific numbers from data (use [NOTE]), goal names/targets from IEP (use [IEP]), activities named in notes (use [NOTE]).

Span size: mark the smallest meaningful phrase — not entire sentences. One sentence may contain [NOTE], [IEP], and ** spans side by side.

Syntax: ONLY [IEP][/IEP], [NOTE][/NOTE], and **double asterisks**. Never { }, [[ ]], or {{ }}. Never nest markers.
Transitional words with no clinical meaning ("During this period,") may be left untagged.

═══ OUTPUT PROTOCOLS ═══

FIELD_UPDATE — when you learn the title or dates:
Output a line starting with EXACTLY:
FIELD_UPDATE:
then a single JSON object, e.g.: {"title":"Q1 2026","startDate":"2026-01-01","endDate":"2026-03-31"}

REPORT_UPDATE — when you produce a full or substantially revised draft:
Output a line starting with EXACTLY:
REPORT_UPDATE:
then the full report text WITH source attribution markers applied as described above.

Rules:
— Always output a conversational reply as well — never output only a protocol block
— Keep conversational replies short: 1–3 sentences, plain text only
— Never use ** or __ formatting in conversational replies — the ** marker is for report text only`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 503 });
    }

    const body: ChatBody = await req.json();
    const { messages, context } = body;

    if (!context?.studentId) {
      return NextResponse.json({ error: "Missing studentId in context" }, { status: 400 });
    }

    // Fetch clinical data — use the date range if provided, else the current month as a fallback
    const startDate = context.startDate
      ? new Date(context.startDate + "T00:00:00")
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = context.endDate
      ? new Date(context.endDate + "T23:59:59")
      : new Date();

    const [sessionData, ieps] = await Promise.all([
      getSessionsForReport(user!.id, {
        studentId: context.studentId,
        startDate,
        endDate,
      }),
      getIEPsByStudentId(context.studentId),
    ]);

    const client = new Anthropic({ apiKey });

    const anthropicMessages: Anthropic.MessageParam[] =
      messages.length === 0
        ? [{
            role: "user",
            content: "Start the progress report assistant. Check the setup status and guide me through the first missing step.",
          }]
        : messages.map(m => ({ role: m.role, content: m.content }));

    const response = await client.messages.create({
      model: process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5",
      max_tokens: 2000,
      system: buildSystemPrompt(context, sessionData, ieps),
      messages: anthropicMessages,
    });

    const fullText =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    // Parse FIELD_UPDATE block
    const fieldMarker = "FIELD_UPDATE:";
    const fieldIdx = fullText.indexOf(fieldMarker);
    let fieldUpdate: Record<string, string> | null = null;
    let textAfterField = fullText;

    if (fieldIdx !== -1) {
      const afterMarker = fullText.slice(fieldIdx + fieldMarker.length).trim();
      const jsonEnd = afterMarker.indexOf("\n", afterMarker.indexOf("}"));
      const jsonStr = jsonEnd !== -1 ? afterMarker.slice(0, jsonEnd + 1) : afterMarker.split("\n")[0];
      try { fieldUpdate = JSON.parse(jsonStr.trim()); } catch { /* ignore */ }
      textAfterField = (
        fullText.slice(0, fieldIdx) + "\n" +
        fullText.slice(fieldIdx + fieldMarker.length + (jsonEnd !== -1 ? jsonEnd + 1 : jsonStr.length))
      ).trim();
    }

    // Parse REPORT_UPDATE block
    const reportMarker = "REPORT_UPDATE:";
    const reportIdx = textAfterField.indexOf(reportMarker);
    let reportUpdate: string | null = null;
    let reply = textAfterField;

    if (reportIdx !== -1) {
      reportUpdate = textAfterField.slice(reportIdx + reportMarker.length).trim();
      reply = textAfterField.slice(0, reportIdx).trim();
      if (!reply) reply = "Here's a draft based on what you've shared:";
    }

    return NextResponse.json({ reply, reportUpdate, fieldUpdate });
  } catch (err) {
    console.error("[progress-reports/chat]", err);
    const msg = err instanceof Error ? err.message : "Failed to get AI response";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
