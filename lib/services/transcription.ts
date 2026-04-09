/**
 * Transcription service abstraction.
 *
 * Default implementation uses AssemblyAI (free tier: 5 hrs/month).
 * Swap the implementation by changing TRANSCRIPTION_PROVIDER in .env.local.
 * Supported: "assemblyai" (default), "groq", "openai"
 */

import OpenAI from "openai";

export interface TranscriptionResult {
  text: string;
  durationSecs?: number;
  language?: string;
}

// ── MIME type → file extension map ────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  "audio/ogg": "ogg",
  "audio/ogg;codecs=opus": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

function mimeToExt(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return MIME_TO_EXT[base] ?? MIME_TO_EXT[mimeType.toLowerCase()] ?? "webm";
}

// ── AssemblyAI implementation (free tier: 5 hrs/month) ───────────────────────

async function transcribeWithAssemblyAI(
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not configured. Add it to .env.local. Get a free key at https://www.assemblyai.com"
    );
  }

  const { AssemblyAI } = await import("assemblyai");
  const client = new AssemblyAI({ apiKey });

  // Step 1: upload the buffer to AssemblyAI's file storage
  const uploadUrl = await client.files.upload(audioBuffer as any);

  // Step 2: transcribe from the uploaded URL
  const transcript = await client.transcripts.transcribe({
    audio_url: uploadUrl,
    speech_models: ["universal-2"] as any,
  });

  if (transcript.status === "error") {
    throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
  }

  const text = transcript.text ?? "";
  const durationSecs = transcript.audio_duration ?? undefined;

  return { text, durationSecs };
}

// ── Groq Whisper implementation (free, rate-limited) ─────────────────────────

async function transcribeWithGroq(
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not configured. Add it to .env.local. Get a free key at https://console.groq.com"
    );
  }

  const groq = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const ext = mimeToExt(mimeType);
  const blob = new Blob([audioBuffer], { type: mimeType });
  const file = new File([blob], `recording.${ext}`, { type: mimeType });

  const response = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
  });

  return {
    text: response.text,
    durationSecs: (response as any).duration ?? undefined,
    language: (response as any).language ?? undefined,
  };
}

// ── OpenAI Whisper implementation ────────────────────────────────────────────

async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Add it to .env.local."
    );
  }

  const openai = new OpenAI({ apiKey });
  const ext = mimeToExt(mimeType);
  const blob = new Blob([audioBuffer], { type: mimeType });
  const file = new File([blob], `recording.${ext}`, { type: mimeType });

  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
  });

  return {
    text: response.text,
    durationSecs: (response as any).duration ?? undefined,
    language: (response as any).language ?? undefined,
  };
}

// ── Public entrypoint ─────────────────────────────────────────────────────────

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscriptionResult> {
  const provider = process.env.TRANSCRIPTION_PROVIDER ?? "assemblyai";

  if (provider === "assemblyai") return transcribeWithAssemblyAI(audioBuffer, mimeType);
  if (provider === "groq") return transcribeWithGroq(audioBuffer, mimeType);
  if (provider === "openai") return transcribeWithOpenAI(audioBuffer, mimeType);

  throw new Error(
    `Unknown transcription provider: "${provider}". Supported: "assemblyai", "groq", "openai"`
  );
}
