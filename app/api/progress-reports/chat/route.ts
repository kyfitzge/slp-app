/**
 * POST /api/progress-reports/chat
 *
 * AI chat assistant for progress report authoring.
 * Guides the SLP from the very start — collecting the report title, date range,
 * and clinical notes — through to a finished draft.
 *
 * Supports two structured output blocks in addition to plain conversational replies:
 *   REPORT_UPDATE: <full report text>
 *   FIELD_UPDATE: <JSON: { title?, startDate?, endDate? }>
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import Anthropic from "@anthropic-ai/sdk";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ReportContext {
  studentName: string;
  gradeLevel?: string | null;
  schoolName?: string | null;
  /** Empty string when not yet set */
  title: string;
  /** "yyyy-MM-dd" or empty string */
  startDate: string;
  /** "yyyy-MM-dd" or empty string */
  endDate: string;
  currentDraft: string;
  goals: Array<{ name: string; domain: string; targetAccuracy: number; status: string }>;
  sessionCount: number;
}

interface ChatBody {
  messages: ChatMessage[];
  context: ReportContext;
}

function buildSystemPrompt(ctx: ReportContext): string {
  const goalLines = ctx.goals.length > 0
    ? ctx.goals.map(g =>
        `• ${g.name} (${g.domain}) — target ${Math.round(g.targetAccuracy * 100)}%, status: ${g.status}`
      ).join("\n")
    : "No goals on file.";

  const titleStatus   = ctx.title     ? `"${ctx.title}"`     : "NOT SET";
  const startStatus   = ctx.startDate ? ctx.startDate         : "NOT SET";
  const endStatus     = ctx.endDate   ? ctx.endDate           : "NOT SET";
  const draftStatus   = ctx.currentDraft.trim()
    ? `CURRENT DRAFT:\n"""\n${ctx.currentDraft.trim()}\n"""`
    : "No draft written yet.";

  const setupComplete = !!(ctx.title && ctx.startDate && ctx.endDate);

  return `You are an experienced school-based Speech-Language Pathologist helping to author a formal progress report for a student on the SLP's caseload. You guide the SLP from the very beginning — collecting the report details and clinical observations — through to a finished, polished draft ready to send to parents or the IEP team.

═══ STUDENT ═══
Name: ${ctx.studentName}${ctx.gradeLevel ? ` | Grade: ${ctx.gradeLevel}` : ""}${ctx.schoolName ? ` | School: ${ctx.schoolName}` : ""}

═══ REPORT SETUP STATUS ═══
Title:       ${titleStatus}
Start date:  ${startStatus}
End date:    ${endStatus}
Sessions loaded: ${ctx.sessionCount}

═══ IEP GOALS ═══
${goalLines}

═══ ${draftStatus} ═══

═══ YOUR WORKFLOW ═══
${setupComplete ? `
Report setup is complete. Focus on helping the SLP build or refine the draft.
` : `
The report has not been fully set up yet (title or date range is missing).
YOUR FIRST PRIORITY is to collect any missing setup information — ask for it directly, one item at a time:
  1. Report title (e.g. "Q1 2026", "Fall Semester 2025–2026", "Annual Progress")
  2. Reporting period start date (ask in plain English — e.g. "What date does this reporting period start?")
  3. Reporting period end date

Once you have all three, confirm them and move on to collecting clinical information to write the report.
`}

After setup is complete, help the SLP with any of:
— Drafting the full report from clinical notes they share
— Refining or improving existing sections
— Adjusting tone or clarity (e.g. "make this more parent-friendly")
— Suggesting stronger clinical language
— Reviewing a draft for completeness and accuracy

═══ WRITING RULES (when producing report text) ═══
— Write in the SLP's voice, addressed to the reader (parent/administrator/IEP team)
— Third person for the student (use first name or "the student")
— Past tense, professional, parent-readable prose
— No headers, bullets, or markdown in report text — flowing paragraphs only
— Base all clinical claims strictly on what the SLP tells you — never fabricate data

═══ OUTPUT PROTOCOLS ═══

FIELD_UPDATE protocol — use this when the SLP gives you the title or dates:
Output a line starting with EXACTLY:
FIELD_UPDATE:
followed immediately by a single JSON object with any combination of: title, startDate (yyyy-MM-dd), endDate (yyyy-MM-dd).
Example:
FIELD_UPDATE:
{"title":"Q1 2026","startDate":"2026-01-01","endDate":"2026-03-31"}

REPORT_UPDATE protocol — use this when you produce a full or substantially revised draft:
Output a line starting with EXACTLY:
REPORT_UPDATE:
followed immediately by the full clean report text (no markers, no JSON, no commentary).

Rules:
— You may output FIELD_UPDATE and REPORT_UPDATE in the same response if both apply
— Always output a plain conversational reply as well — do not output ONLY a protocol block with no message
— Keep conversational replies short: 1–3 sentences, no markdown bold/italic, no bullet points
— Never output ** or __ formatting in your conversational message — plain text only`;
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 503 });
    }

    const body: ChatBody = await req.json();
    const { messages, context } = body;

    if (!context) {
      return NextResponse.json({ error: "Missing report context" }, { status: 400 });
    }

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
      system: buildSystemPrompt(context),
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
      // JSON ends at the first newline after the closing brace
      const jsonEnd = afterMarker.indexOf("\n", afterMarker.indexOf("}"));
      const jsonStr = jsonEnd !== -1 ? afterMarker.slice(0, jsonEnd + 1) : afterMarker.split("\n")[0];
      try {
        fieldUpdate = JSON.parse(jsonStr.trim());
      } catch { /* ignore malformed JSON */ }
      // Remove FIELD_UPDATE block from text before looking for REPORT_UPDATE
      textAfterField = (fullText.slice(0, fieldIdx) + "\n" + fullText.slice(fieldIdx + fieldMarker.length + (jsonEnd !== -1 ? jsonEnd + 1 : jsonStr.length))).trim();
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
