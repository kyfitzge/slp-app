/**
 * POST /api/progress-reports/chat
 *
 * AI chat assistant for progress report authoring.
 * Helps the SLP draft, refine, and improve a progress report through
 * conversational back-and-forth. Returns a reply and an optional
 * REPORT_UPDATE block with a revised/updated report draft.
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
  reportPeriod: string;
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
    : "No goals provided.";

  const draftSection = ctx.currentDraft.trim()
    ? `CURRENT REPORT DRAFT:\n"""\n${ctx.currentDraft.trim()}\n"""`
    : "No draft written yet.";

  return `You are an experienced school-based Speech-Language Pathologist helping to author a formal progress report. You are assisting the SLP who is writing the report — acting as a knowledgeable collaborator, not as the author yourself.

═══ STUDENT & REPORT CONTEXT ═══
Student: ${ctx.studentName}${ctx.gradeLevel ? ` | Grade: ${ctx.gradeLevel}` : ""}${ctx.schoolName ? ` | School: ${ctx.schoolName}` : ""}
Reporting period: ${ctx.reportPeriod}
Sessions in period: ${ctx.sessionCount}

═══ IEP GOALS ═══
${goalLines}

═══ ${draftSection} ═══

═══ YOUR ROLE ═══
You can help the SLP with any of the following:
1. Drafting or refining the report from scratch or from notes they share
2. Improving specific sections — opening paragraph, goal paragraphs, recommendations
3. Adjusting tone, clarity, or reading level (e.g. "make this more parent-friendly")
4. Asking clarifying questions to fill in missing clinical detail
5. Suggesting more precise clinical language for vague descriptions
6. Reviewing and critiquing a draft for completeness, accuracy, or professional tone

When the SLP provides information or asks you to write/revise something:
— Write in the SLP's voice, addressed to the reader (parent/administrator/IEP team)
— Third person for the student ("${ctx.studentName.split(" ")[0]}," "the student")
— Past tense, professional, parent-readable prose
— No headers, bullets, or markdown in report text — flowing paragraphs only
— Base all clinical claims strictly on what the SLP tells you — never fabricate data

REPORT_UPDATE protocol:
When you produce a revised or new version of the full report (or a substantial new section), output it on a new line starting with EXACTLY:
REPORT_UPDATE:
(followed immediately by the full updated report text — clean prose, no markers, no commentary)

Only output REPORT_UPDATE when you have a genuine full draft or revised section to offer. For clarifying questions, short suggestions, or commentary, reply as plain conversation — no REPORT_UPDATE.

Tone: collegial, direct, expert. One or two paragraphs max per conversational reply. Do not over-explain.`;
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
            content: "I need help with this progress report. Start by briefly introducing what you can help with and ask me what I'd like to work on first.",
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

    // Parse REPORT_UPDATE block
    const marker = "REPORT_UPDATE:";
    const markerIdx = fullText.indexOf(marker);

    let reply = fullText;
    let reportUpdate: string | null = null;

    if (markerIdx !== -1) {
      reportUpdate = fullText.slice(markerIdx + marker.length).trim();
      reply = fullText.slice(0, markerIdx).trim();
      if (!reply) {
        reply = "Here's an updated draft based on what you've shared:";
      }
    }

    return NextResponse.json({ reply, reportUpdate });
  } catch (err) {
    console.error("[progress-reports/chat]", err);
    const msg = err instanceof Error ? err.message : "Failed to get AI response";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
