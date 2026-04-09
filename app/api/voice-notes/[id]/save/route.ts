/**
 * POST /api/voice-notes/[id]/save
 *
 * Saves the (optionally edited) note as an AI-generated SessionNote.
 * Requires user review — the client must POST the final text explicitly.
 *
 * Body (JSON):
 *   sessionId    : string
 *   studentId?   : string
 *   editedNote   : string   (the final text after user review/edit)
 *   structuredData?: object (the validated structured fields)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { saveVoiceNoteSchema } from "@/lib/validations/voice-note";
import {
  getVoiceNoteById,
  saveVoiceNoteToSession,
} from "@/lib/queries/voice-notes";
import { z } from "zod";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const voiceNote = await getVoiceNoteById(id);
    if (!voiceNote) {
      return NextResponse.json({ error: "Voice note not found" }, { status: 404 });
    }
    if (voiceNote.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (voiceNote.status === "SAVED") {
      return NextResponse.json(
        { error: "This voice note has already been saved." },
        { status: 409 }
      );
    }

    const body = await req.json();
    const data = saveVoiceNoteSchema.parse(body);

    const savedNote = await saveVoiceNoteToSession({
      voiceNoteId: id,
      sessionId: data.sessionId,
      studentId: data.studentId,
      editedNote: data.editedNote,
      structuredData: data.structuredData,
      aiModel: process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5",
    });

    return NextResponse.json({ note: savedNote }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
    }
    console.error("[voice-notes/save]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
