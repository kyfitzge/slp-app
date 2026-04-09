"use client";

/**
 * VoiceNotePanel
 *
 * Orchestrates the full voice-note workflow:
 *   1. Record or upload audio
 *   2. Transcribe with Whisper  (POST /api/voice-notes/transcribe)
 *   3. Clean with Claude        (POST /api/voice-notes/[id]/clean)
 *   4. Review & edit
 *   5. Save to session          (POST /api/voice-notes/[id]/save)
 */

import { useState } from "react";
import { CheckCircle, FileText } from "lucide-react";
import { VoiceRecorder } from "./voice-recorder";
import { TranscriptReview } from "./transcript-review";
import type { StructuredNote } from "@/lib/validations/voice-note";

type Step = "record" | "transcribing" | "cleaning" | "review" | "saved";

interface ProcessingState {
  voiceNoteId: string;
  rawTranscript: string;
  cleanedNote: string;
  structuredData: StructuredNote;
}

interface VoiceNotePanelProps {
  sessionId: string;
  studentId?: string;
  /** Passed to the LLM for more accurate goal extraction */
  sessionContext?: {
    studentFirstName?: string;
    gradeLevel?: string;
    sessionType?: string;
    sessionDate?: string;
    activeGoals?: string[];
  };
}

export function VoiceNotePanel({
  sessionId,
  studentId,
  sessionContext,
}: VoiceNotePanelProps) {
  const [step, setStep] = useState<Step>("record");
  const [processingState, setProcessingState] = useState<ProcessingState | null>(null);
  const [error, setError] = useState<string>("");
  const [savedNoteId, setSavedNoteId] = useState<string>("");

  // ── Step 1 → 2 → 3: audio → transcript → cleaned note ────────────────────
  async function handleAudioReady(blob: Blob, mimeType: string) {
    setError("");

    // ── Transcribe ──────────────────────────────────────────────────────────
    setStep("transcribing");

    const formData = new FormData();
    formData.append("audio", blob, `recording.${mimeType.split("/")[1]?.split(";")[0] ?? "webm"}`);
    formData.append("sessionId", sessionId);

    let transcribeResult: { id: string; rawTranscript: string };
    try {
      const res = await fetch("/api/voice-notes/transcribe", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Transcription failed");
      transcribeResult = json;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
      setStep("record");
      return;
    }

    // ── Clean with LLM ──────────────────────────────────────────────────────
    setStep("cleaning");

    try {
      const res = await fetch(`/api/voice-notes/${transcribeResult.id}/clean`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: sessionContext ?? {} }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Note cleaning failed");

      setProcessingState({
        voiceNoteId: transcribeResult.id,
        rawTranscript: transcribeResult.rawTranscript,
        cleanedNote: json.cleanedNote,
        structuredData: json.structuredData,
      });
      setStep("review");
    } catch (err) {
      // Graceful degradation: show raw transcript even if LLM fails
      setError(
        `AI cleaning failed: ${err instanceof Error ? err.message : "Unknown error"}. ` +
        "The raw transcript is shown below for manual documentation."
      );
      setProcessingState({
        voiceNoteId: transcribeResult.id,
        rawTranscript: transcribeResult.rawTranscript,
        cleanedNote: transcribeResult.rawTranscript, // fallback
        structuredData: {
          cleanedNote: transcribeResult.rawTranscript,
          goalsAddressed: [],
          participation: null,
          sessionDurationMins: null,
          materials: null,
          nextStepPlan: null,
          uncertaintyFlags: ["AI cleaning failed — please review and edit manually"],
        },
      });
      setStep("review");
    }
  }

  // ── Step 5: saved ─────────────────────────────────────────────────────────
  function handleSaved(noteId: string) {
    setSavedNoteId(noteId);
    setStep("saved");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === "saved") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle className="h-10 w-10 text-green-500" />
        <p className="font-medium">Note saved to session</p>
        <p className="text-sm text-muted-foreground">
          The AI-generated note has been added to this session record.
        </p>
      </div>
    );
  }

  if (step === "transcribing" || step === "cleaning") {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <div className="relative">
          <FileText className="h-10 w-10 text-primary animate-pulse" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-medium">
            {step === "transcribing" ? "Transcribing audio…" : "Drafting note with AI…"}
          </p>
          <p className="text-sm text-muted-foreground">
            {step === "transcribing"
              ? "Sending to Whisper — this usually takes a few seconds."
              : "Claude is reviewing the transcript and extracting clinical data."}
          </p>
        </div>
        {/* Simple indeterminate progress bar */}
        <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-[shimmer_1.5s_ease-in-out_infinite] w-1/2" />
        </div>
      </div>
    );
  }

  if (step === "review" && processingState) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="text-sm text-yellow-700 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        <TranscriptReview
          voiceNoteId={processingState.voiceNoteId}
          sessionId={sessionId}
          studentId={studentId}
          rawTranscript={processingState.rawTranscript}
          cleanedNote={processingState.cleanedNote}
          structuredData={processingState.structuredData}
          onSaved={handleSaved}
        />
      </div>
    );
  }

  // Default: record step
  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}
      <VoiceRecorder onAudioReady={handleAudioReady} />
    </div>
  );
}
