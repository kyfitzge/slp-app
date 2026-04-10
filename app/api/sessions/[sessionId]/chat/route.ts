/**
 * POST /api/sessions/[sessionId]/chat
 *
 * Conversational AI documentation assistant for the session note workflow.
 * Receives the existing session context + chat history from the client
 * and returns a focused follow-up question or note suggestion.
 *
 * All session context is provided by the client (no DB reads needed here).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import Anthropic from "@anthropic-ai/sdk";

interface ChatGoal {
  id: string;
  name: string;
  accuracy?: number | null;
  trials?: string | null;
  cueing?: string | null;
}

interface ChatContext {
  sessionDate: string;
  sessionType: string;
  durationMins?: number | null;
  students: string[];
  goals: ChatGoal[];
  missingLabels: string[];
  currentNote: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  messages: ChatMessage[];
  context: ChatContext;
}

function buildSystemPrompt(ctx: ChatContext): string {
  const goalLines =
    ctx.goals.length > 0
      ? ctx.goals
          .map((g) => {
            const parts = [`- ${g.name}`];
            if (g.accuracy != null) parts.push(`${g.accuracy}% accuracy`);
            if (g.trials) parts.push(`${g.trials} trials`);
            if (g.cueing) parts.push(`${g.cueing.replace(/_/g, " ").toLowerCase()} support`);
            if (g.accuracy == null && !g.trials) parts.push("(no data captured yet)");
            return parts.join(", ");
          })
          .join("\n")
      : "(none captured yet)";

  const noteSection = ctx.currentNote.trim()
    ? `CURRENT NOTE DRAFT:\n"${ctx.currentNote.trim()}"\n`
    : "No note draft yet.\n";

  const missingSection =
    ctx.missingLabels.length > 0
      ? `FIELDS STILL MISSING: ${ctx.missingLabels.join(", ")}`
      : "All required fields have been captured.";

  return `You are a clinical documentation assistant for a school-based Speech-Language Pathologist (SLP).
Your job is to help the SLP fill in missing session documentation through a brief, focused conversation.

SESSION CONTEXT (already known — do NOT ask about these):
- Date: ${ctx.sessionDate}
- Type: ${ctx.sessionType}
- Duration: ${ctx.durationMins ? `${ctx.durationMins} min` : "not recorded"}
- Students: ${ctx.students.join(", ")}

GOALS ADDRESSED:
${goalLines}

${noteSection}
${missingSection}

RULES:
1. Ask ONLY ONE focused question per response — the most important missing piece
2. Prioritize in this order: goals targeted → accuracy/trials → cueing level → engagement/participation → plan for next session
3. Skip anything already captured above
4. Be concise and clinical — you're talking to a busy SLP, not a patient
5. Use plain prose, no markdown bullets or headers
6. When the SLP gives you enough data to meaningfully improve the note draft, include a suggested update on a NEW LINE starting with exactly "NOTE_UPDATE:" followed immediately by the improved note text. Only do this when you have concrete new information to add.
7. Do not fabricate or assume clinical data — only use what the SLP tells you
8. If all fields are already captured, say so briefly and ask if there's anything else to add`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireUser();
    await params; // validate route param exists

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured." },
        { status: 503 }
      );
    }

    const body: ChatBody = await req.json();
    const { messages, context } = body;

    if (!context) {
      return NextResponse.json({ error: "Missing session context" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    // Convert to Anthropic message format
    // If there are no messages yet, send an init prompt
    const anthropicMessages: Anthropic.MessageParam[] =
      messages.length === 0
        ? [
            {
              role: "user",
              content:
                "Please start by asking me the most important question to help complete this session note.",
            },
          ]
        : messages.map((m) => ({ role: m.role, content: m.content }));

    const response = await client.messages.create({
      model: process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5",
      max_tokens: 400,
      system: buildSystemPrompt(context),
      messages: anthropicMessages,
    });

    const fullText =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    // Parse out optional NOTE_UPDATE suggestion
    const noteUpdateMarker = "NOTE_UPDATE:";
    const noteUpdateIdx = fullText.indexOf(noteUpdateMarker);

    let reply = fullText;
    let noteUpdate: string | null = null;

    if (noteUpdateIdx !== -1) {
      noteUpdate = fullText.slice(noteUpdateIdx + noteUpdateMarker.length).trim();
      reply = fullText.slice(0, noteUpdateIdx).trim();
      // If reply is empty after stripping the note update, provide a brief intro
      if (!reply) {
        reply = "Here's a suggested update to your note draft:";
      }
    }

    return NextResponse.json({ reply, noteUpdate });
  } catch (err) {
    console.error("[chat]", err);
    const msg = err instanceof Error ? err.message : "Failed to get AI response";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
