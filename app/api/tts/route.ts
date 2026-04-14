/**
 * POST /api/tts
 *
 * Converts text to speech using OpenAI TTS.
 * Returns audio/mpeg stream that the client plays directly.
 * Falls back gracefully if OPENAI_API_KEY is not set.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    await requireUser();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 503 }
      );
    }

    const { text } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: "No text provided." }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    const mp3 = await client.audio.speech.create({
      model: "tts-1",
      voice: "nova", // warm, natural-sounding voice
      input: text.slice(0, 4096), // API limit
      speed: 1.25,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[tts]", err);
    const msg = err instanceof Error ? err.message : "TTS failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
