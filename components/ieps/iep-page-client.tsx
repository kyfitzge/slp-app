"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IEPStatusBadge, GoalDomainBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils/format-date";
import {
  IEPForm,
  parsePLAAFPForForm,
  type PLAAFPState,
  type PLAAFPKey,
} from "@/components/ieps/iep-form";
import {
  Mic, MessageSquare, Bot, X, Send, Loader2, Sparkles, Check,
  Volume2, Square, Plus, AlertTriangle, CheckCircle2, Target,
  ChevronRight, Pencil, ArrowLeft,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IEPGoal {
  id: string;
  shortName: string | null;
  goalText: string;
  domain: string;
  status: string;
  targetAccuracy: number;
  dataPoints: Array<{ accuracy: number }>;
}

export interface IEPPageClientProps {
  studentId: string;
  iepId: string;
  studentName: string;
  iep: {
    status: string;
    effectiveDate: string;
    reviewDate: string;
    expirationDate: string;
    meetingDate?: string;
    nextEvalDate?: string;
    minutesPerWeek?: number;
    groupMinutes?: number;
    individualMinutes?: number;
    serviceLocation?: string;
    presentLevels?: string;
    parentConcerns?: string;
    transitionNotes?: string;
    goals: IEPGoal[];
  };
  urgency: string;
}

type RightPanel = "goals" | "text-chat" | "voice-chat";

// ─── Field labels for Apply card ─────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  strengths: "Strengths",
  areasOfNeed: "Areas of Need",
  functionalImpact: "Functional Impact",
  baselinePerformance: "Baseline Performance",
  communicationProfile: "Communication Profile",
  parentConcerns: "Parent Concerns",
};

// ─── Chat message type ────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── IEPTextChatPanel ─────────────────────────────────────────────────────────

function IEPTextChatPanel({
  iepId,
  studentName,
  plaafp,
  parentConcerns,
  goals,
  onClose,
  onApplyFields,
  serviceMinutesPerWeek,
  individualMinutes,
  groupMinutes,
  serviceLocation,
}: {
  iepId: string;
  studentName: string;
  plaafp: PLAAFPState;
  parentConcerns: string;
  goals: IEPGoal[];
  onClose: () => void;
  onApplyFields: (fields: Record<string, string>) => void;
  serviceMinutesPerWeek?: number;
  individualMinutes?: number;
  groupMinutes?: number;
  serviceLocation?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isThinking, setIsThinking] = useState(true);
  const [pendingIepUpdate, setPendingIepUpdate] = useState<Partial<Record<PLAAFPKey | "parentConcerns", string>> | null>(null);

  const initRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, isThinking]);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      sendToAI([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fieldQuality(content?: string): "empty" | "partial" | "complete" {
    if (!content?.trim()) return "empty";
    return content.trim().length < 60 ? "partial" : "complete";
  }

  function buildContext() {
    const makeField = (label: string, key: string, value?: string) => ({
      label,
      key,
      quality: fieldQuality(value),
      preview: value?.trim().slice(0, 120) || undefined,
    });

    return {
      studentName,
      serviceMinutesPerWeek,
      individualMinutes,
      groupMinutes,
      serviceLocation,
      fieldStatus: [
        makeField("Strengths",            "strengths",            plaafp.strengths),
        makeField("Areas of Need",        "areasOfNeed",          plaafp.areasOfNeed),
        makeField("Functional Impact",    "functionalImpact",     plaafp.functionalImpact),
        makeField("Baseline Performance", "baselinePerformance",  plaafp.baselinePerformance),
        makeField("Communication Profile","communicationProfile", plaafp.communicationProfile),
        makeField("Parent Concerns",      "parentConcerns",       parentConcerns),
      ],
      goals: goals.map((g) => ({
        name: g.shortName ?? g.goalText.slice(0, 60),
        domain: g.domain,
        targetAccuracy: g.targetAccuracy,
        hasDataPoints: g.dataPoints.length > 0,
      })),
    };
  }

  async function sendToAI(history: ChatMessage[]) {
    setIsThinking(true);
    try {
      const res = await fetch(`/api/ieps/${iepId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context: buildContext() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI error");

      const aiMsg: ChatMessage = { role: "assistant", content: json.reply };
      setMessages((prev) => [...prev, aiMsg]);
      if (json.iepUpdate) setPendingIepUpdate(json.iepUpdate);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I had trouble connecting. Please try again." },
      ]);
    } finally {
      setIsThinking(false);
      setTimeout(() => textInputRef.current?.focus({ preventScroll: true }), 50);
    }
  }

  function submitMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setTextInput("");
    setPendingIepUpdate(null);
    sendToAI(newHistory);
  }

  function applyFields() {
    if (!pendingIepUpdate) return;
    onApplyFields(pendingIepUpdate as Record<string, string>);
    setPendingIepUpdate(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "IEP fields updated. Is there anything else to add?" },
    ]);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-violet-100/60 border-b border-violet-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-5 w-5 rounded bg-violet-600/10">
            <Bot className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <span className="text-xs font-semibold text-violet-800">AI IEP Assistant</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-violet-400 hover:text-violet-700 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3.5 py-3 space-y-2.5">
        {messages.length === 0 && isThinking && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
            Starting your IEP interview…
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="shrink-0 h-5 w-5 rounded bg-violet-100 flex items-center justify-center mt-0.5">
                <Bot className="h-3 w-3 text-violet-600" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-white border border-violet-100 text-foreground rounded-bl-sm shadow-sm"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isThinking && messages.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-violet-100 flex items-center justify-center">
              <Bot className="h-3 w-3 text-violet-600" />
            </div>
            <div className="bg-white border border-violet-100 rounded-xl rounded-bl-sm px-3 py-2 shadow-sm">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* IEP update card */}
      {pendingIepUpdate && (
        <div className="mx-3.5 mb-3 rounded-lg border border-violet-200 bg-white p-3 space-y-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
            <Sparkles className="h-3.5 w-3.5" />
            Apply to IEP
          </div>
          <div className="space-y-1">
            {Object.entries(pendingIepUpdate).map(([key, value]) => (
              <div key={key} className="text-xs">
                <span className="font-medium text-foreground">{FIELD_LABELS[key] ?? key}: </span>
                <span className="text-muted-foreground line-clamp-1">{value}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700"
              onClick={applyFields}
            >
              <Check className="h-3 w-3" /> Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setPendingIepUpdate(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Text input */}
      <div className="border-t border-violet-200 bg-white px-3.5 py-3 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textInputRef}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitMessage(textInput);
              }
            }}
            placeholder="Type your answer… (Enter to send)"
            rows={2}
            disabled={isThinking}
            className="flex-1 resize-none text-xs rounded-md border border-input bg-background px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-40"
          />
          <Button
            type="button"
            size="icon"
            disabled={isThinking || !textInput.trim()}
            onClick={() => submitMessage(textInput)}
            className="h-8 w-8 shrink-0 bg-violet-600 hover:bg-violet-700"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── IEPVoiceChatPanel ────────────────────────────────────────────────────────

type AiVoiceState =
  | "idle"
  | "recording"
  | "transcribing"
  | "ai_thinking"
  | "speaking";

function IEPVoiceChatPanel({
  iepId,
  studentName,
  plaafp,
  parentConcerns,
  goals,
  onClose,
  onApplyFields,
  serviceMinutesPerWeek,
  individualMinutes,
  groupMinutes,
  serviceLocation,
}: {
  iepId: string;
  studentName: string;
  plaafp: PLAAFPState;
  parentConcerns: string;
  goals: IEPGoal[];
  onClose: () => void;
  onApplyFields: (fields: Record<string, string>) => void;
  serviceMinutesPerWeek?: number;
  individualMinutes?: number;
  groupMinutes?: number;
  serviceLocation?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [voiceState, setVoiceState] = useState<AiVoiceState>("ai_thinking");
  const [pendingIepUpdate, setPendingIepUpdate] = useState<Partial<Record<PLAAFPKey | "parentConcerns", string>> | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [ttsAvailable, setTtsAvailable] = useState(true);

  const initRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoRecordRef = useRef(false);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, voiceState]);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      sendToAI([], true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    };
  }, []);

  function fieldQuality(content?: string): "empty" | "partial" | "complete" {
    if (!content?.trim()) return "empty";
    return content.trim().length < 60 ? "partial" : "complete";
  }

  function buildContext() {
    const makeField = (label: string, key: string, value?: string) => ({
      label,
      key,
      quality: fieldQuality(value),
      preview: value?.trim().slice(0, 120) || undefined,
    });

    return {
      studentName,
      serviceMinutesPerWeek,
      individualMinutes,
      groupMinutes,
      serviceLocation,
      fieldStatus: [
        makeField("Strengths",            "strengths",            plaafp.strengths),
        makeField("Areas of Need",        "areasOfNeed",          plaafp.areasOfNeed),
        makeField("Functional Impact",    "functionalImpact",     plaafp.functionalImpact),
        makeField("Baseline Performance", "baselinePerformance",  plaafp.baselinePerformance),
        makeField("Communication Profile","communicationProfile", plaafp.communicationProfile),
        makeField("Parent Concerns",      "parentConcerns",       parentConcerns),
      ],
      goals: goals.map((g) => ({
        name: g.shortName ?? g.goalText.slice(0, 60),
        domain: g.domain,
        targetAccuracy: g.targetAccuracy,
        hasDataPoints: g.dataPoints.length > 0,
      })),
    };
  }

  async function playTTS(text: string, { thenRecord = false } = {}) {
    autoRecordRef.current = thenRecord;
    setVoiceState("speaking");

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        setTtsAvailable(false);
        setVoiceState("idle");
        if (thenRecord) setTimeout(startRecording, 300);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        if (autoRecordRef.current) {
          setTimeout(startRecording, 600);
        } else {
          setVoiceState("idle");
        }
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setVoiceState("idle");
      };

      await audio.play();
    } catch {
      setVoiceState("idle");
    }
  }

  function interruptAndRecord() {
    autoRecordRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    startRecording();
  }

  async function startRecording() {
    setStatusMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        await transcribeAndSend(blob);
      };

      recorder.start(250);
      setVoiceState("recording");
    } catch {
      setStatusMsg("Microphone access denied. Please enable microphone permissions.");
      setVoiceState("idle");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setVoiceState("transcribing");
    }
  }

  async function transcribeAndSend(blob: Blob) {
    setVoiceState("transcribing");
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Transcription failed");

      const transcript: string = (json.transcript ?? "").trim();
      if (!transcript) {
        setStatusMsg("Didn't catch that — tap the mic and try again.");
        setVoiceState("idle");
        return;
      }

      submitMessage(transcript, true);
    } catch {
      setStatusMsg("Transcription failed. Try again.");
      setVoiceState("idle");
    }
  }

  async function sendToAI(history: ChatMessage[], speakResponse: boolean) {
    setVoiceState("ai_thinking");
    try {
      const res = await fetch(`/api/ieps/${iepId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context: buildContext() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI error");

      const aiMsg: ChatMessage = { role: "assistant", content: json.reply };
      setMessages((prev) => [...prev, aiMsg]);

      if (json.iepUpdate) setPendingIepUpdate(json.iepUpdate);

      if (speakResponse && json.reply) {
        await playTTS(json.reply, { thenRecord: ttsAvailable });
        if (!ttsAvailable) setVoiceState("idle");
      } else {
        setVoiceState("idle");
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I had trouble connecting. Please try again." },
      ]);
      setVoiceState("idle");
    }
  }

  function submitMessage(text: string, speakResponse = false) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setPendingIepUpdate(null);
    setStatusMsg(null);
    sendToAI(newHistory, speakResponse);
  }

  function applyFields() {
    if (!pendingIepUpdate) return;
    onApplyFields(pendingIepUpdate as Record<string, string>);
    setPendingIepUpdate(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "IEP fields updated. Is there anything else to add?" },
    ]);
  }

  const isProcessing = voiceState === "transcribing" || voiceState === "ai_thinking";
  const isSpeaking = voiceState === "speaking";

  const micLabel = {
    idle: "Tap to speak",
    recording: "Listening… tap to stop",
    transcribing: "Transcribing…",
    ai_thinking: "Thinking…",
    speaking: "Tap to interrupt",
  }[voiceState];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-violet-100/60 border-b border-violet-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-5 w-5 rounded bg-violet-600/10">
            <Bot className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <span className="text-xs font-semibold text-violet-800">AI Voice Assistant</span>
          {!ttsAvailable && (
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              voice off — add OPENAI_API_KEY
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            audioRef.current?.pause();
            onClose();
          }}
          className="text-violet-400 hover:text-violet-700 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3.5 py-3 space-y-2.5">
        {messages.length === 0 && voiceState === "ai_thinking" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
            Starting your IEP interview…
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="shrink-0 h-5 w-5 rounded bg-violet-100 flex items-center justify-center mt-0.5">
                <Bot className="h-3 w-3 text-violet-600" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-white border border-violet-100 text-foreground rounded-bl-sm shadow-sm"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {voiceState === "ai_thinking" && messages.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-violet-100 flex items-center justify-center">
              <Bot className="h-3 w-3 text-violet-600" />
            </div>
            <div className="bg-white border border-violet-100 rounded-xl rounded-bl-sm px-3 py-2 shadow-sm">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* IEP update card */}
      {pendingIepUpdate && (
        <div className="mx-3.5 mb-3 rounded-lg border border-violet-200 bg-white p-3 space-y-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
            <Sparkles className="h-3.5 w-3.5" />
            Apply to IEP
          </div>
          <div className="space-y-1">
            {Object.entries(pendingIepUpdate).map(([key, value]) => (
              <div key={key} className="text-xs">
                <span className="font-medium text-foreground">{FIELD_LABELS[key] ?? key}: </span>
                <span className="text-muted-foreground line-clamp-1">{value}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700"
              onClick={applyFields}
            >
              <Check className="h-3 w-3" /> Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setPendingIepUpdate(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Voice control */}
      <div className="border-t border-violet-200 bg-white px-3.5 py-4 flex flex-col items-center gap-3 shrink-0">
        {statusMsg && <p className="text-xs text-destructive text-center">{statusMsg}</p>}

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={isProcessing}
            onClick={
              isSpeaking
                ? interruptAndRecord
                : voiceState === "recording"
                ? stopRecording
                : startRecording
            }
            aria-label={micLabel}
            className={cn(
              "relative flex items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
              voiceState === "recording"
                ? "h-20 w-20 bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200"
                : isSpeaking
                ? "h-20 w-20 bg-violet-500 hover:bg-violet-600 shadow-lg shadow-violet-200 cursor-pointer"
                : isProcessing
                ? "h-20 w-20 bg-violet-100 cursor-wait"
                : "h-20 w-20 bg-violet-600 hover:bg-violet-700 shadow-md shadow-violet-200"
            )}
          >
            {/* Pulse rings */}
            {voiceState === "recording" && (
              <>
                <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
                <span className="absolute -inset-2 rounded-full border-2 border-red-300 animate-ping opacity-20 [animation-delay:0.3s]" />
              </>
            )}
            {isSpeaking && (
              <span className="absolute inset-0 rounded-full bg-violet-400 animate-ping opacity-25" />
            )}

            {isProcessing ? (
              <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
            ) : isSpeaking ? (
              <Volume2 className="h-8 w-8 text-white" />
            ) : voiceState === "recording" ? (
              <Square className="h-7 w-7 text-white fill-white" />
            ) : (
              <Mic className="h-8 w-8 text-white" />
            )}
          </button>

          <span className="text-xs text-muted-foreground font-medium tracking-wide">{micLabel}</span>

          {isSpeaking && (
            <span className="text-[11px] text-violet-500">tap to interrupt</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── IEPPageClient ────────────────────────────────────────────────────────────

export function IEPPageClient({
  studentId,
  iepId,
  studentName,
  iep,
  urgency,
}: IEPPageClientProps) {
  const [plaafp, setPlaafp] = useState<PLAAFPState>(() =>
    parsePLAAFPForForm(iep.presentLevels)
  );
  const [parentConcerns, setParentConcerns] = useState(iep.parentConcerns ?? "");
  const [rightPanel, setRightPanel] = useState<RightPanel>("goals");

  const activeGoals = iep.goals.filter((g) => g.status === "ACTIVE");
  const masteredGoals = iep.goals.filter((g) => g.status === "MASTERED");

  const defaultValues = {
    studentId,
    status: iep.status as never,
    effectiveDate: iep.effectiveDate,
    reviewDate: iep.reviewDate,
    expirationDate: iep.expirationDate,
    meetingDate: iep.meetingDate,
    nextEvalDate: iep.nextEvalDate,
    minutesPerWeek: iep.minutesPerWeek,
    groupMinutes: iep.groupMinutes,
    individualMinutes: iep.individualMinutes,
    serviceLocation: iep.serviceLocation,
    presentLevels: iep.presentLevels,
    parentConcerns: iep.parentConcerns,
    transitionNotes: iep.transitionNotes,
  };

  function onApplyFields(fields: Record<string, string>) {
    const newPlaafp = { ...plaafp };
    const plaafpKeyMap: Record<string, PLAAFPKey> = {
      strengths: "strengths",
      areasOfNeed: "areasOfNeed",
      functionalImpact: "functionalImpact",
      baselinePerformance: "baselinePerformance",
      communicationProfile: "communicationProfile",
    };
    for (const [key, value] of Object.entries(fields)) {
      if (plaafpKeyMap[key]) newPlaafp[plaafpKeyMap[key]] = value;
      if (key === "parentConcerns") setParentConcerns(value);
    }
    setPlaafp(newPlaafp);
  }

  return (
    <div className="space-y-5 pb-12">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="h-8 -ml-2 text-muted-foreground hover:text-foreground">
            <Link href={`/students/${studentId}/ieps`}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              All IEPs
            </Link>
          </Button>
          <div className="h-4 w-px bg-border" />
          <IEPStatusBadge status={iep.status as never} />
          <span className="text-sm text-muted-foreground">
            Effective {formatDate(iep.effectiveDate)}
          </span>
          {(urgency === "overdue" || urgency === "urgent") && (
            <span className={cn(
              "inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1",
              urgency === "overdue"
                ? "bg-rose-50 text-rose-700 border border-rose-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            )}>
              <AlertTriangle className="h-3 w-3" />
              {urgency === "overdue" ? "Review overdue" : "Review due soon"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setRightPanel("text-chat")}
            size="sm"
            variant="outline"
            className="text-violet-700 border-violet-300 hover:bg-violet-50 h-8 text-xs"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />Chat with AI
          </Button>
          <Button
            onClick={() => setRightPanel("voice-chat")}
            size="sm"
            variant="outline"
            className="text-violet-700 border-violet-300 hover:bg-violet-50 h-8 text-xs"
          >
            <Mic className="h-3.5 w-3.5 mr-1.5" />Talk to AI
          </Button>
        </div>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">

        {/* LEFT: IEP form */}
        <IEPForm
          studentId={studentId}
          iepId={iepId}
          defaultValues={defaultValues}
          plaafp={plaafp}
          onPlaafpChange={setPlaafp}
          parentConcerns={parentConcerns}
          onParentConcernsChange={setParentConcerns}
        />

        {/* RIGHT: panel (sticky) */}
        <div className="xl:sticky xl:top-6 rounded-xl border bg-card shadow-sm overflow-hidden max-h-[calc(100vh-8rem)] flex flex-col">

          {rightPanel === "goals" && (
            <>
              {/* Goals panel header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/20 shrink-0">
                <h3 className="text-sm font-semibold">Goals</h3>
                <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs">
                  <Link href={`/students/${studentId}/goals/new?iepId=${iepId}`}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Link>
                </Button>
              </div>

              {/* Goals list */}
              <div className="p-3 overflow-y-auto flex-1">
                {iep.goals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                    <Target className="h-8 w-8 text-muted-foreground/20 mb-2.5" />
                    <p className="text-sm font-medium text-muted-foreground">No goals yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1 mb-4">
                      Add measurable annual goals tied to this IEP.
                    </p>
                    <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                      <Link href={`/students/${studentId}/goals/new?iepId=${iepId}`}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add First Goal
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">

                    {/* Active goals */}
                    {activeGoals.map((goal) => {
                      const latest = goal.dataPoints[0];
                      const latestPct = latest ? Math.round(latest.accuracy * 100) : null;
                      const targetPct = Math.round(goal.targetAccuracy * 100);
                      const atTarget = latestPct != null && latestPct >= targetPct;

                      return (
                        <div
                          key={goal.id}
                          className="flex items-start gap-2.5 rounded-lg border bg-background p-3 hover:border-primary/30 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <GoalDomainBadge domain={goal.domain} />
                            </div>
                            {goal.shortName && (
                              <p className="text-xs font-medium text-foreground truncate">
                                {goal.shortName}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {goal.goalText}
                            </p>
                            <div className="flex items-center gap-2.5 mt-1.5">
                              <span className="text-[11px] text-muted-foreground">
                                Target <span className="font-semibold text-foreground">{targetPct}%</span>
                              </span>
                              {latestPct != null && (
                                <span className="text-[11px] text-muted-foreground">
                                  Latest{" "}
                                  <span className={cn("font-semibold", atTarget ? "text-emerald-600" : "text-foreground")}>
                                    {latestPct}%
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <Button asChild variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <Link href={`/students/${studentId}/goals/${goal.id}/edit`}>
                                <Pencil className="h-3 w-3" />
                              </Link>
                            </Button>
                            <Button asChild variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <Link href={`/students/${studentId}/goals/${goal.id}`}>
                                <ChevronRight className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Mastered goals */}
                    {masteredGoals.length > 0 && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 mt-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <p className="text-xs font-semibold text-emerald-700">
                            {masteredGoals.length} mastered
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {masteredGoals.map((g) => (
                            <Link
                              key={g.id}
                              href={`/students/${studentId}/goals/${g.id}`}
                              className="text-xs text-emerald-700 hover:underline"
                            >
                              {g.shortName ?? g.goalText.slice(0, 40)}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {rightPanel === "text-chat" && (
            <IEPTextChatPanel
              iepId={iepId}
              studentName={studentName}
              plaafp={plaafp}
              parentConcerns={parentConcerns}
              goals={iep.goals}
              onClose={() => setRightPanel("goals")}
              onApplyFields={onApplyFields}
              serviceMinutesPerWeek={iep.minutesPerWeek}
              individualMinutes={iep.individualMinutes}
              groupMinutes={iep.groupMinutes}
              serviceLocation={iep.serviceLocation}
            />
          )}

          {rightPanel === "voice-chat" && (
            <IEPVoiceChatPanel
              iepId={iepId}
              studentName={studentName}
              plaafp={plaafp}
              parentConcerns={parentConcerns}
              goals={iep.goals}
              onClose={() => setRightPanel("goals")}
              onApplyFields={onApplyFields}
              serviceMinutesPerWeek={iep.minutesPerWeek}
              individualMinutes={iep.individualMinutes}
              groupMinutes={iep.groupMinutes}
              serviceLocation={iep.serviceLocation}
            />
          )}

        </div>
      </div>
    </div>
  );
}
