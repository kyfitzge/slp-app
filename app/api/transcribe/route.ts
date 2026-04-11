/**
 * POST /api/transcribe
 *
 * Generic, stateless transcription endpoint — no DB writes, no sessionId required.
 * Accepts a multipart/form-data body with:
 *   - audio: audio Blob/File
 *
 * Returns { transcript: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { transcribeAudio } from "@/lib/services/transcription";

export async function POST(req: NextRequest) {
  try {
    await requireUser();

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "audio is required" }, { status: 400 });
    }

    if (audioFile.size === 0) {
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
    }

    // 25 MB guard — Whisper max is 25 MB
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio file exceeds the 25 MB limit. Please record a shorter clip." },
        { status: 413 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await transcribeAudio(buffer, audioFile.type || "audio/webm");

    if (!result.text.trim()) {
      return NextResponse.json(
        { error: "No speech detected in the recording." },
        { status: 422 }
      );
    }

    return NextResponse.json({ transcript: result.text });
  } catch (err) {
    console.error("[transcribe]", err);
    const msg = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
