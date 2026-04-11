/**
 * POST /api/sessions/[sessionId]/edit-note
 *
 * Conversational note editor. The SLP describes changes they want made
 * to the current draft; Claude applies them and returns the full edited note.
 *
 * Body:
 *   existingNote : string   — current draft (updated on every turn)
 *   messages     : { role: "user" | "assistant", content: string }[]
 *
 * Response:
 *   reply      : string        — brief confirmation message to display in chat
 *   editedNote : string | null — full edited note, or null if clarifying
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import Anthropic from "@anthropic-ai/sdk";

interface EditMessage {
  role: "user" | "assistant";
  content: string;
}

interface EditNoteBody {
  existingNote: string;
  messages: EditMessage[];
}

function buildSystemPrompt(existingNote: string): string {
  return `You are a clinical note editor for a school-based Speech-Language Pathologist (SLP).
The SLP has written a session note draft and wants to refine it through specific editing instructions.

═══ CURRENT NOTE DRAFT ═══
"${existingNote.trim()}"

═══ YOUR JOB ═══
Apply the SLP's instruction to the note and return the full edited version.

═══ RULES ═══
1. Apply the instruction faithfully — shorten if asked, expand if asked, adjust wording if asked.
2. Preserve clinical past-tense prose, professional tone, and accurate clinical content unless told otherwise.
3. Do NOT fabricate new clinical data (numbers, dates, names) that isn't already in the note.
4. When you have an edited note ready, output it using EXACTLY this format — two parts separated by a newline:
   First: one sentence describing what you changed (plain language, no preamble).
   Then on a new line starting with EXACTLY the text "EDIT_RESULT:" followed immediately by the full edited note.
5. If the instruction is ambiguous or could go multiple ways, ask ONE clarifying question instead of guessing.
6. Tone: collegial and direct — like a documentation assistant, not a formal system.`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireUser();
    await params;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 503 });
    }

    const body: EditNoteBody = await req.json();
    const { existingNote, messages } = body;

    if (!existingNote?.trim()) {
      return NextResponse.json({ error: "existingNote is required" }, { status: 400 });
    }
    if (!messages?.length) {
      return NextResponse.json({ error: "messages are required" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5",
      max_tokens: 1200,
      system: buildSystemPrompt(existingNote),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const fullText =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    const EDIT_MARKER = "EDIT_RESULT:";
    const editIdx = fullText.indexOf(EDIT_MARKER);

    let reply = fullText;
    let editedNote: string | null = null;

    if (editIdx !== -1) {
      editedNote = fullText.slice(editIdx + EDIT_MARKER.length).trim();
      reply = fullText.slice(0, editIdx).trim();
      if (!reply) reply = "Here's the updated note:";
    }

    return NextResponse.json({ reply, editedNote });
  } catch (err) {
    console.error("[edit-note]", err);
    const msg = err instanceof Error ? err.message : "Failed to edit note";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
