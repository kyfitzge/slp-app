/**
 * POST /api/voice-notes/[id]/clean
 *
 * Sends the stored raw transcript to Claude for note-cleaning.
 * Accepts optional session context in the JSON body to improve accuracy.
 *
 * Body (JSON):
 *   context?: { studentFirstName, gradeLevel, sessionType, sessionDate, activeGoals }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { cleanTranscript, type SessionContext } from "@/lib/services/llm-notes";
import {
  getVoiceNoteById,
  updateVoiceNoteCleaned,
  setVoiceNoteError,
} from "@/lib/queries/voice-notes";

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
    if (!voiceNote.rawTranscript) {
      return NextResponse.json(
        { error: "No transcript found. Transcribe first." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const context: SessionContext = body.context ?? {};

    let result: Awaited<ReturnType<typeof cleanTranscript>>;
    try {
      result = await cleanTranscript(voiceNote.rawTranscript, context);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "LLM cleaning failed";
      await setVoiceNoteError(id, msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const updated = await updateVoiceNoteCleaned(
      id,
      result.structuredData.cleanedNote,
      result.structuredData
    );

    return NextResponse.json({
      id: updated.id,
      cleanedNote: updated.cleanedNote,
      structuredData: updated.structuredData,
    });
  } catch (err) {
    console.error("[voice-notes/clean]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
