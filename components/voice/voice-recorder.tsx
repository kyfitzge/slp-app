"use client";

/**
 * VoiceRecorder
 *
 * Mobile-friendly audio capture component using the MediaRecorder API.
 * Falls back to a file-upload input when MediaRecorder is unavailable
 * (e.g., insecure context, older iOS WebKit).
 *
 * Props:
 *   onAudioReady(blob, mimeType) — called when the user finalises audio
 *   disabled — disables all controls
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { Mic, Square, Upload, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onAudioReady: (blob: Blob, mimeType: string) => void;
  disabled?: boolean;
}

type RecorderState = "idle" | "requesting" | "recording" | "done" | "error";

function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/mpeg",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function VoiceRecorder({ onAudioReady, disabled }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [amplitude, setAmplitude] = useState(0); // 0–1 for VU meter

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mediaRecorderAvailable =
    typeof window !== "undefined" && "MediaRecorder" in window;

  // ── Amplitude polling for VU meter ─────────────────────────────────────────
  const pollAmplitude = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += Math.abs(v - 128);
    setAmplitude(Math.min(1, (sum / data.length) * 0.08));
    animFrameRef.current = requestAnimationFrame(pollAmplitude);
  }, []);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Start recording ─────────────────────────────────────────────────────────
  async function startRecording() {
    setErrorMsg("");
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Wire up Web Audio analyser for the VU meter
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        onAudioReady(blob, type);
        stream.getTracks().forEach((t) => t.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setAmplitude(0);
        setState("done");
      };

      recorder.start(250); // collect data every 250 ms
      setState("recording");
      setElapsed(0);

      timerRef.current = setInterval(
        () => setElapsed((s) => s + 1),
        1000
      );
      pollAmplitude();
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow access and try again."
          : "Could not access the microphone.";
      setErrorMsg(msg);
      setState("error");
    }
  }

  // ── Stop recording ──────────────────────────────────────────────────────────
  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }

  // ── File upload fallback ────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    onAudioReady(file, file.type || "audio/webm");
    setState("done");
  }

  function reset() {
    setElapsed(0);
    setAmplitude(0);
    setErrorMsg("");
    setState("idle");
    chunksRef.current = [];
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!mediaRecorderAvailable) {
    // Full fallback: file upload only
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground text-center">
          Audio recording is not supported in this browser. Upload an audio file instead.
        </p>
        <label className="cursor-pointer">
          <Button asChild variant="outline" disabled={disabled}>
            <span>
              <Upload className="h-4 w-4 mr-2" />
              Upload audio
            </span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={handleFileChange}
            disabled={disabled}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* VU meter ring */}
      {state === "recording" && (
        <div className="relative flex items-center justify-center">
          <div
            className="absolute rounded-full bg-red-500/20 transition-all duration-100"
            style={{
              width: `${80 + amplitude * 60}px`,
              height: `${80 + amplitude * 60}px`,
            }}
          />
          <div className="relative z-10 w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
            <Mic className="h-8 w-8 text-white" />
          </div>
        </div>
      )}

      {/* Idle mic icon */}
      {state === "idle" && (
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Mic className="h-8 w-8 text-primary" />
        </div>
      )}

      {/* Done check */}
      {state === "done" && (
        <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
          <Mic className="h-8 w-8 text-green-600" />
        </div>
      )}

      {/* Timer */}
      {state === "recording" && (
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="font-mono text-lg tabular-nums">
            {formatDuration(elapsed)}
          </span>
        </div>
      )}

      {/* Status text */}
      <p className="text-sm text-muted-foreground text-center">
        {state === "idle" && "Tap to start recording your session notes"}
        {state === "requesting" && "Requesting microphone access…"}
        {state === "recording" && "Recording — tap Stop when done"}
        {state === "done" && "Audio ready — processing below"}
        {state === "error" && ""}
      </p>

      {/* Error */}
      {state === "error" && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 max-w-sm text-center">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {(state === "idle" || state === "error") && (
          <>
            <Button
              size="lg"
              onClick={startRecording}
              disabled={disabled}
              className="rounded-full px-8"
            >
              <Mic className="h-4 w-4 mr-2" />
              Record
            </Button>
            <label className="cursor-pointer">
              <Button
                asChild
                size="lg"
                variant="outline"
                disabled={disabled}
                className="rounded-full px-6"
              >
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="sr-only"
                onChange={handleFileChange}
                disabled={disabled}
              />
            </label>
          </>
        )}

        {state === "recording" && (
          <Button
            size="lg"
            variant="destructive"
            onClick={stopRecording}
            className="rounded-full px-8"
          >
            <Square className="h-4 w-4 mr-2 fill-current" />
            Stop
          </Button>
        )}

        {state === "done" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={reset}
            disabled={disabled}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Re-record
          </Button>
        )}
      </div>
    </div>
  );
}
