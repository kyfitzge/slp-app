/**
 * POST /api/voice-notes/transcribe
 *
 * Accepts a multipart/form-data body with:
 *   - audio   : audio Blob/File
 *   - sessionId: string
 *
 * Transcribes with Whisper, persists the VoiceNote, and returns the result.
 * Audio is processed in memory and never written to disk.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { transcribeAudio } from "@/lib/services/transcription";
import {
  createVoiceNote,
  updateVoiceNoteTranscript,
  setVoiceNoteError,
} from "@/lib/queries/voice-notes";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const sessionId = formData.get("sessionId") as string | null;

    if (!audioFile || !sessionId) {
      return NextResponse.json(
        { error: "audio and sessionId are required" },
        { status: 400 }
      );
    }

    if (audioFile.size === 0) {
      return NextResponse.json(
        { error: "Audio file is empty" },
        { status: 400 }
      );
    }

    // 25 MB guard — Whisper max is 25 MB
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio file exceeds the 25 MB limit. Please record a shorter clip." },
        { status: 413 }
      );
    }

    // Create the VoiceNote record immediately so the client has an ID
    const voiceNote = await createVoiceNote(sessionId, user.id);

    // Convert File → Buffer for Whisper
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let transcript: Awaited<ReturnType<typeof transcribeAudio>>;
    try {
      transcript = await transcribeAudio(buffer, audioFile.type || "audio/webm");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transcription failed";
      await setVoiceNoteError(voiceNote.id, msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    if (!transcript.text.trim()) {
      const msg = "No speech detected in the recording.";
      await setVoiceNoteError(voiceNote.id, msg);
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    const updated = await updateVoiceNoteTranscript(voiceNote.id, transcript.text);

    return NextResponse.json({
      id: updated.id,
      rawTranscript: updated.rawTranscript,
      durationSecs: transcript.durationSecs,
      language: transcript.language,
    });
  } catch (err) {
    console.error("[voice-notes/transcribe]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
