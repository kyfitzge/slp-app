"use client";

/**
 * SessionNotePage — two-column documentation layout (v2)
 *
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  Session Header Bar (full width)                              │
 *  ├─────────────────────────┬────────────────────────────────────┤
 *  │  LEFT  ~40%             │  RIGHT  ~60%                       │
 *  │  1. Session Note Draft  │  3. Structured Session Data        │
 *  │     (voice → note)      │  4. Goals & Performance            │
 *  │  2. Plan for Next       │                                    │
 *  │     Session             │                                    │
 *  └─────────────────────────┴────────────────────────────────────┘
 *  [Action Bar]
 *
 *  Voice flow:
 *    Record → transcribe → auto-generate note + extract plan
 *    "Re-record"  replaces all context and regenerates
 *    "Add more"   appends new recording, regenerates
 *    Raw transcript is never displayed to the user
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Mic, Square, Loader2, RefreshCw, Check, Ban,
  Clock, MapPin, Users, CalendarDays, Bot, AlertTriangle,
  Target, CircleCheck, CircleDot,
  CircleAlert, Info, PlusCircle, RotateCcw, Pencil,
  MessageSquare, X, Send, Sparkles, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/utils/format-date";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus =
  | "PRESENT" | "ABSENT_EXCUSED" | "ABSENT_UNEXCUSED"
  | "CANCELLED_SLP" | "CANCELLED_SCHOOL" | "MAKEUP";

type DocStatus = "needs_note" | "in_progress" | "complete";

/** "replace" = new recording replaces all context; "append" = adds to existing */
type TranscriptMode = "replace" | "append";

interface Goal {
  id: string;
  shortName: string | null;
  goalText: string;
  domain: string;
}

interface StudentData {
  id: string;
  firstName: string;
  lastName: string;
  attendance: AttendanceStatus;
  goals: Goal[];
}

interface ExtractedData {
  accuracy?: number | null;
  trialsCorrect?: number | null;
  trialsTotal?: number | null;
  cueingLevel?: string | null;
  durationMins?: number | null;
  participation?: string | null;
  setting?: string | null;
}

interface MatchedGoalData {
  goal: Goal;
  /** Data extracted from the sentences in the transcript mentioning this goal. */
  extracted: ExtractedData;
  /** Previously saved DB data point for this goal (from initialGoalData). */
  saved?: { accuracy: number; trialsCorrect?: number; trialsTotal?: number; cueingLevel?: string };
}

export interface SessionNotePageProps {
  sessionId: string;
  sessionDate: Date | string;
  startTime?: string | null;
  sessionType: string;
  durationMins?: number | null;
  location?: string | null;
  students: StudentData[];
  initialNote: string;
  /** Per-student notes keyed by studentId — used for group sessions. */
  initialNotes?: Record<string, string>;
  initialGoalData: Record<
    string,
    { accuracy: number; trialsCorrect?: number; trialsTotal?: number; cueingLevel?: string }
  >;
  /** Concatenated raw transcripts from previous voice recordings on this session. */
  initialSummaryContext?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT_EXCUSED", label: "Excused" },
  { value: "ABSENT_UNEXCUSED", label: "Absent" },
  { value: "CANCELLED_SLP", label: "Cancelled" },
];


const CUEING_LABELS: Record<string, string> = {
  INDEPENDENT: "Independent",
  GESTURAL: "Gestural",
  INDIRECT_VERBAL: "Min. cues",
  DIRECT_VERBAL: "Mod. cues",
  MODELING: "Modeling",
  PHYSICAL: "Physical",
  MAXIMUM_ASSISTANCE: "Max support",
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  GROUP: "Group",
  EVALUATION: "Evaluation",
  RE_EVALUATION: "Re-Evaluation",
  CONSULTATION: "Consultation",
  PARENT_CONFERENCE: "Parent Conf.",
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function extractFromText(text: string): ExtractedData {
  if (!text.trim()) return {};
  const result: ExtractedData = {};

  // Handle "18/27", "18 out of 27", "18 correct responses out of 27", etc.
  const trialMatch =
    text.match(/\b(\d+)\b(?:\s+\w+){0,4}\s+out\s+of\s+(\d+)/i) ||
    text.match(/(\d+)\s*\/\s*(\d+)/);
  if (trialMatch) {
    result.trialsCorrect = parseInt(trialMatch[1]);
    result.trialsTotal = parseInt(trialMatch[2]);
    result.accuracy = Math.round((result.trialsCorrect / result.trialsTotal) * 100);
  }
  if (result.accuracy == null) {
    const pct = text.match(/(\d{1,3})\s*%/);
    if (pct) result.accuracy = parseInt(pct[1]);
  }

  if (/\bindependen/i.test(text)) result.cueingLevel = "INDEPENDENT";
  else if (/min(?:imal)?\s*(?:verbal\s*)?cue|indirect\s*verbal/i.test(text))
    result.cueingLevel = "INDIRECT_VERBAL";
  else if (/mod(?:erate)?\s*(?:verbal\s*)?cue|direct\s*verbal/i.test(text))
    result.cueingLevel = "DIRECT_VERBAL";
  else if (/max(?:imum)?\s*(?:support|assist)|physical\s*(?:guidance|cue|prompt)/i.test(text))
    result.cueingLevel = "MAXIMUM_ASSISTANCE";
  else if (/gestural\s*cue/i.test(text)) result.cueingLevel = "GESTURAL";

  const dur = text.match(/(\d+)\s*-?\s*min(?:ute)?s?\b/i);
  if (dur) result.durationMins = parseInt(dur[1]);

  if (/excellent\s*(?:participation|engagement)/i.test(text)) result.participation = "excellent";
  else if (/good\s*(?:participation|engagement|effort)/i.test(text)) result.participation = "good";
  else if (/fair\s*(?:participation|engagement)/i.test(text)) result.participation = "fair";
  else if (/poor\s*(?:participation|engagement)|refused/i.test(text)) result.participation = "poor";

  // Setting / location extraction
  if (/pull[- ]?out|resource\s*room|separate\s*room/i.test(text)) result.setting = "Pull-out Room";
  else if (/speech\s*room|therapy\s*room|speech[- ]language\s*room/i.test(text)) result.setting = "Speech Room";
  else if (/general\s*ed(?:ucation)?|inclusion|classroom/i.test(text)) result.setting = "Classroom";
  else if (/hallway/i.test(text)) result.setting = "Hallway";
  else if (/telehealth|virtual|remote\s*session|online\s*session/i.test(text)) result.setting = "Telehealth";
  else if (/library/i.test(text)) result.setting = "Library";
  else if (/cafeteria/i.test(text)) result.setting = "Cafeteria";
  else if (/gym|gymnasium/i.test(text)) result.setting = "Gymnasium";

  return result;
}

/**
 * Extract clinical data from sentences in the transcript that mention a
 * specific goal by name / domain keyword.  Falls back to empty if nothing
 * relevant is found so we don't bleed one goal's numbers onto another.
 */
function extractDataForGoal(transcript: string, goal: Goal): ExtractedData {
  if (!transcript.trim()) return {};
  const name = (goal.shortName ?? goal.goalText).toLowerCase();
  const domain = goal.domain.toLowerCase().replace(/_/g, " ");
  const keywords = [...name.split(/\s+/).filter((w) => w.length > 2), domain];
  // Split on sentence boundaries
  const sentences = transcript.split(/(?<=[.!?])\s+/);

  // Find indices of keyword-matching sentences, then include the next 2 sentences
  // as context — clinical notes often state the goal first, then performance data.
  const matchedIndices = new Set<number>();
  sentences.forEach((s, i) => {
    if (keywords.some((kw) => s.toLowerCase().includes(kw))) {
      matchedIndices.add(i);
      if (i + 1 < sentences.length) matchedIndices.add(i + 1);
      if (i + 2 < sentences.length) matchedIndices.add(i + 2);
    }
  });

  const relevant = sentences.filter((_, i) => matchedIndices.has(i));
  return relevant.length > 0 ? extractFromText(relevant.join(" ")) : {};
}

type GoalAIExt = { accuracy?: number | null; trialsCorrect?: number | null; trialsTotal?: number | null; cueingLevel?: string | null } | null | undefined;
type GoalOverride = { accuracy?: number | null; trialsCorrect?: number | null; trialsTotal?: number | null; cueingLevel?: string | null } | null | undefined;

/**
 * Priority: user override → LLM extraction → saved DB → regex extraction
 */
function goalEffectiveAccuracy(mg: MatchedGoalData, aiExt?: GoalAIExt, override?: GoalOverride): number | null {
  if (override?.trialsCorrect != null && override.trialsTotal != null && override.trialsTotal > 0)
    return Math.round((override.trialsCorrect / override.trialsTotal) * 100);
  if (override?.accuracy != null) return override.accuracy;
  if (aiExt?.trialsCorrect != null && aiExt.trialsTotal != null && aiExt.trialsTotal > 0)
    return Math.round((aiExt.trialsCorrect / aiExt.trialsTotal) * 100);
  if (aiExt?.accuracy != null) return aiExt.accuracy;
  if (mg.saved?.trialsCorrect != null && mg.saved.trialsTotal != null && mg.saved.trialsTotal > 0)
    return Math.round((mg.saved.trialsCorrect / mg.saved.trialsTotal) * 100);
  if (mg.saved?.accuracy != null) return Math.round(mg.saved.accuracy);
  if (mg.extracted.trialsCorrect != null && mg.extracted.trialsTotal != null && mg.extracted.trialsTotal > 0)
    return Math.round((mg.extracted.trialsCorrect / mg.extracted.trialsTotal) * 100);
  return mg.extracted.accuracy ?? null;
}

function goalEffectiveTrials(mg: MatchedGoalData, aiExt?: GoalAIExt, override?: GoalOverride): string | null {
  if (override?.trialsCorrect != null && override.trialsTotal != null)
    return `${override.trialsCorrect}/${override.trialsTotal}`;
  if (aiExt?.trialsCorrect != null && aiExt.trialsTotal != null)
    return `${aiExt.trialsCorrect}/${aiExt.trialsTotal}`;
  if (mg.saved?.trialsCorrect != null && mg.saved.trialsTotal != null)
    return `${mg.saved.trialsCorrect}/${mg.saved.trialsTotal}`;
  if (mg.extracted.trialsCorrect != null && mg.extracted.trialsTotal != null)
    return `${mg.extracted.trialsCorrect}/${mg.extracted.trialsTotal}`;
  return null;
}

function goalEffectiveCueing(mg: MatchedGoalData, aiExt?: GoalAIExt, override?: GoalOverride): string | null {
  if (override?.cueingLevel !== undefined) return override.cueingLevel ?? null;
  return aiExt?.cueingLevel ?? mg.saved?.cueingLevel ?? mg.extracted.cueingLevel ?? null;
}

/**
 * Match goals from a voice transcript against the student's IEP goals.
 * Returns goals whose short name words or domain keyword appear in the transcript.
 */
function matchGoalsFromTranscript(transcript: string, goals: Goal[]): Goal[] {
  if (!transcript.trim() || goals.length === 0) return [];
  const lower = transcript.toLowerCase();
  return goals.filter((g) => {
    const name = (g.shortName ?? g.goalText).toLowerCase();
    const words = name.split(/\s+/).filter((w) => w.length > 2);
    const domainKeyword = g.domain.toLowerCase().replace(/_/g, " ");
    const domainMatch = lower.includes(domainKeyword);
    const nameMatch = words.some((w) => lower.includes(w));
    return domainMatch || nameMatch;
  });
}

function getDocStatus(noteDraft: string, completed: boolean): DocStatus {
  if (completed) return "complete";
  if (noteDraft.trim().length >= 30) return "in_progress";
  return "needs_note";
}

// ─── Doc status badge ─────────────────────────────────────────────────────────

function DocStatusBadge({ status }: { status: DocStatus }) {
  if (status === "complete")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 border border-green-200">
        <CircleCheck className="h-3.5 w-3.5" /> Complete
      </span>
    );
  if (status === "in_progress")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-700 border border-yellow-200">
        <CircleDot className="h-3.5 w-3.5" /> In Progress
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 border border-orange-200">
      <CircleAlert className="h-3.5 w-3.5" /> Needs Note
    </span>
  );
}

// ─── VoiceCapture ─────────────────────────────────────────────────────────────
// Handles recording state machine:
//   idle → recording | appending → processing → done
// Calls onTranscript(text, mode) when audio is processed.
// Does NOT display raw transcript — caller uses it silently.

type VoiceState = "idle" | "recording" | "appending" | "processing" | "done" | "error";

function VoiceCapture({
  sessionId,
  hasExistingContent,
  onTranscript,
  onTalkToAI,
  onTextChat,
  onSuggestEdits,
  onRegenerate,
  onClearNote,
}: {
  sessionId: string;
  hasExistingContent: boolean;
  onTranscript: (text: string, mode: TranscriptMode) => void;
  onTalkToAI?: () => void;
  onTextChat?: () => void;
  onSuggestEdits?: () => void;
  onRegenerate?: () => void;
  onClearNote?: () => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeRef = useRef<TranscriptMode>("replace");

  const stopAndProcess = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    recorder.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState("processing");

    recorder.onstop = async () => {
      const mimeType = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const ext = mimeType.split("/")[1]?.split(";")[0] ?? "webm";
      try {
        const fd = new FormData();
        fd.append("audio", blob, `voice.${ext}`);
        fd.append("sessionId", sessionId);
        const res = await fetch("/api/voice-notes/transcribe", {
          method: "POST",
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Transcription failed");
        onTranscript(json.rawTranscript ?? "", modeRef.current);
        setState("done");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Transcription failed");
        setState("error");
      }
    };
  }, [sessionId, onTranscript]);

  async function startRecording(mode: TranscriptMode) {
    setErrorMsg("");
    setElapsed(0);
    chunksRef.current = [];
    modeRef.current = mode;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(250);
      setState(mode === "append" ? "appending" : "recording");
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setErrorMsg("Microphone access denied");
      setState("error");
    }
  }

  const mm = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const ss = (elapsed % 60).toString().padStart(2, "0");

  const isRecordingAny = state === "recording" || state === "appending";

  // Helper: tooltip wrapper
  function Tip({ tip, children }: { tip: string; children: React.ReactNode }) {
    return (
      <div className="relative group">
        {children}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-md bg-popover border shadow-md px-3 py-2 text-[11px] text-muted-foreground leading-snug text-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
          {tip}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── EMPTY STATE: no note yet — Record Summary + Talk to AI ── */}
      {!hasExistingContent && !isRecordingAny && state !== "processing" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tip tip="Speak a recap and your note will be auto-generated.">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => startRecording("replace")}
              className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              <Mic className="h-3.5 w-3.5" />
              Record summary
            </Button>
          </Tip>

          {onTalkToAI && (
            <Tip tip="AI interviews you with guided questions to fill in your note.">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onTalkToAI}
                className="gap-1.5 h-8 text-xs text-violet-500 hover:text-violet-700 hover:bg-violet-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Talk to AI
              </Button>
            </Tip>
          )}

          {onTextChat && (
            <Tip tip="Chat with AI by typing — ask questions or describe what happened.">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onTextChat}
                className="gap-1.5 h-8 text-xs text-violet-500 hover:text-violet-700 hover:bg-violet-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Chat with AI
              </Button>
            </Tip>
          )}
        </div>
      )}

      {/* ── HAS CONTENT: Re-record + Add information + Regenerate with AI ── */}
      {hasExistingContent && !isRecordingAny && state !== "processing" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tip tip="Replace the current note with a new recording.">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { onClearNote?.(); startRecording("replace"); }}
              className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Re-record
            </Button>
          </Tip>

          <Tip tip="Record additional context to expand the existing note.">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => startRecording("append")}
              className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Add information
            </Button>
          </Tip>

          {onTalkToAI && (
            <Tip tip="AI interviews you with guided questions to fill in your note.">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onTalkToAI}
                className="gap-1.5 h-8 text-xs text-violet-500 hover:text-violet-700 hover:bg-violet-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Talk to AI
              </Button>
            </Tip>
          )}

          {onTextChat && (
            <Tip tip="Chat with AI by typing — ask questions or describe what happened.">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onTextChat}
                className="gap-1.5 h-8 text-xs text-violet-500 hover:text-violet-700 hover:bg-violet-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Chat with AI
              </Button>
            </Tip>
          )}

          {onSuggestEdits && (
            <Tip tip="Describe changes and AI will edit the draft for you.">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onSuggestEdits}
                className="gap-1.5 h-8 text-xs text-violet-500 hover:text-violet-700 hover:bg-violet-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Suggest edits
              </Button>
            </Tip>
          )}

        </div>
      )}

      {state === "error" && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}

      {/* ── ACTIVE RECORDING ── */}
      {isRecordingAny && (
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={stopAndProcess}
            className="gap-2"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-white animate-pulse" />
              {state === "appending" ? "Stop adding" : "Stop"} — {mm}:{ss}
            </span>
          </Button>
          <p className="text-xs text-muted-foreground">
            {state === "appending"
              ? "Recording additional context — it will be merged with your previous note."
              : "Speak your session recap, accuracy data, and next-session plan…"}
          </p>
        </div>
      )}

      {/* ── PROCESSING ── */}
      {state === "processing" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Transcribing and generating your note…
        </div>
      )}
    </div>
  );
}

// ─── FieldRow (Structured Data card) ─────────────────────────────────────────

function FieldRow({
  icon: Icon,
  label,
  value,
  missing,
}: {
  icon?: React.ElementType;
  label: string;
  value: React.ReactNode;
  missing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b last:border-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-[130px]">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        {label}
      </div>
      <div className="text-right flex-1 min-w-0 pl-4">
        {missing ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
            <AlertTriangle className="h-3 w-3" /> Missing
          </span>
        ) : (
          <span className="text-xs font-medium text-foreground break-words">{value}</span>
        )}
      </div>
    </div>
  );
}

// ─── EditableFieldRow ─────────────────────────────────────────────────────────
// Like FieldRow but the value area is clickable — clicking opens an inline input
// or select. Calls onSave(rawString) when the user confirms an edit.

interface EditableFieldRowProps {
  label: string;
  icon?: React.ElementType;
  /** Raw string value for the input (e.g. "80" for accuracy, "8/10" for trials). */
  rawValue: string;
  /** Formatted display value shown when not editing. */
  displayValue?: React.ReactNode;
  missing?: boolean;
  editType?: "text" | "select";
  editOptions?: { value: string; label: string }[];
  placeholder?: string;
  onSave: (raw: string) => void;
}

function EditableFieldRow({
  label,
  icon: Icon,
  rawValue,
  displayValue,
  missing,
  editType = "text",
  editOptions,
  placeholder,
  onSave,
}: EditableFieldRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rawValue);

  // Keep draft in sync if the parent updates rawValue externally (e.g. after AI extraction)
  useEffect(() => {
    if (!editing) setDraft(rawValue);
  }, [rawValue, editing]);

  function commit() {
    setEditing(false);
    if (draft !== rawValue) onSave(draft);
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b last:border-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-[130px]">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        {label}
      </div>
      <div className="text-right flex-1 min-w-0 pl-4">
        {editing ? (
          editType === "select" ? (
            <select
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              autoFocus
              className="text-sm border border-input rounded px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— None —</option>
              {editOptions?.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(rawValue); setEditing(false); } }}
              autoFocus
              placeholder={placeholder}
              className="text-sm border border-input rounded px-2 py-0.5 w-28 bg-background text-right focus:outline-none focus:ring-1 focus:ring-ring"
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => { setDraft(rawValue); setEditing(true); }}
            className="group/edit inline-flex items-center gap-1.5 hover:text-primary transition-colors"
            title="Click to edit"
          >
            {missing ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                <AlertTriangle className="h-3 w-3" /> Missing
              </span>
            ) : (
              <span className="text-xs font-medium text-foreground">{displayValue ?? rawValue}</span>
            )}
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/edit:opacity-60 transition-opacity shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── AiChatPanel ─────────────────────────────────────────────────────────────
// Conversational voice assistant — like talking to ChatGPT.
// Flow: AI speaks question (OpenAI TTS) → auto-starts listening → SLP speaks
//       → transcribe → send to Claude → AI speaks next question → repeat.
// Text input available as fallback at any time.

interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiChatGoal {
  id: string;
  name: string;
  accuracy?: number | null;
  trials?: string | null;
  cueing?: string | null;
}

interface AiChatStudentContext {
  studentId: string;
  studentName: string;
  goals: AiChatGoal[];
  currentNote: string;
}

interface AiChatContext {
  sessionDate: string;
  sessionType: string;
  durationMins?: number | null;
  students: string[];
  goals: AiChatGoal[];
  missingLabels: string[];
  currentNote: string;
  transcript?: string;
  /** Per-student breakdown — present for group sessions. */
  studentContexts?: AiChatStudentContext[];
}

type AiVoiceState =
  | "idle"          // waiting for tap
  | "recording"     // mic is live
  | "transcribing"  // sending audio to AssemblyAI
  | "ai_thinking"   // waiting for Claude response
  | "speaking";     // OpenAI TTS audio is playing

function AiChatPanel({
  sessionId,
  context,
  onClose,
  onApplyNote,
}: {
  sessionId: string;
  context: AiChatContext;
  onClose: () => void;
  onApplyNote: (note: string) => void;
}) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const messagesRef = useRef<AiChatMessage[]>([]); // always-current mirror for async closures
  const [voiceState, setVoiceState] = useState<AiVoiceState>("ai_thinking");
  const [pendingNoteUpdate, setPendingNoteUpdate] = useState<string | null>(null);
  /** Latest accumulated note context — persists throughout the interview so the SLP can apply at any point */
  const [latestNoteUpdate, setLatestNoteUpdate] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [ttsAvailable, setTtsAvailable] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);       // 0–1, for live ring
  const [silenceProgress, setSilenceProgress] = useState(0); // 0–1, countdown

  const initRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoRecordRef = useRef(false);

  // VAD refs
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const rafRef         = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const recordStartRef  = useRef<number>(0);

  // VAD constants
  const SILENCE_THRESHOLD  = 0.015; // RMS below this = silence
  const SILENCE_DURATION   = 1800;  // ms of silence before auto-stop
  const MIN_RECORD_MS      = 700;   // don't auto-stop within first 700 ms

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, voiceState]);

  // Kick off the first AI question on mount
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      sendToAI([], true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── TTS via OpenAI ──────────────────────────────────────────────────────────
  async function playTTS(text: string, { thenRecord = false } = {}) {
    autoRecordRef.current = thenRecord;
    setVoiceState("speaking");

    // Stop any in-progress audio
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
        // TTS not configured — fall back to silent mode
        setTtsAvailable(false);
        setVoiceState("idle");
        if (thenRecord) {
          setTimeout(startRecording, 300);
        }
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
          // Small gap so the mic doesn't catch audio bleed
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

  // ── Interrupt AI speech and start recording immediately ─────────────────────
  function interruptAndRecord() {
    autoRecordRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    startRecording();
  }

  // ── VAD helpers ─────────────────────────────────────────────────────────────
  function stopVAD() {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    silenceStartRef.current = null;
    setAudioLevel(0);
    setSilenceProgress(0);
  }

  // ── Recording ───────────────────────────────────────────────────────────────
  async function startRecording() {
    setStatusMsg(null);
    setAudioLevel(0);
    setSilenceProgress(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      recordStartRef.current = Date.now();

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
        stopVAD();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        await transcribeAndSend(blob);
      };

      recorder.start(250);
      setVoiceState("recording");

      // ── Wire up VAD ──
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.fftSize);

      function poll() {
        if (!analyserRef.current || mediaRecorderRef.current?.state !== "recording") return;
        analyserRef.current.getByteTimeDomainData(dataArray);

        // Calculate RMS amplitude (0–1)
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const norm = (dataArray[i] - 128) / 128;
          sum += norm * norm;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setAudioLevel(Math.min(1, rms * 6)); // amplify for display

        const now = Date.now();
        const elapsed = now - recordStartRef.current;

        if (rms > SILENCE_THRESHOLD) {
          // Speech detected — reset silence window
          silenceStartRef.current = null;
          setSilenceProgress(0);
        } else if (elapsed > MIN_RECORD_MS) {
          // Silence — start or continue countdown
          if (silenceStartRef.current == null) silenceStartRef.current = now;
          const silenceElapsed = now - silenceStartRef.current;
          setSilenceProgress(Math.min(1, silenceElapsed / SILENCE_DURATION));
          if (silenceElapsed >= SILENCE_DURATION) {
            // Auto-stop
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop();
              setVoiceState("transcribing");
            }
            return; // stop polling
          }
        }

        rafRef.current = requestAnimationFrame(poll);
      }

      rafRef.current = requestAnimationFrame(poll);
    } catch {
      setStatusMsg("Microphone access denied. Use the text box below.");
      setVoiceState("idle");
    }
  }

  function stopRecording() {
    stopVAD();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setVoiceState("transcribing");
    }
  }

  // ── Transcription → AI ──────────────────────────────────────────────────────
  async function transcribeAndSend(blob: Blob) {
    setVoiceState("transcribing");
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      form.append("sessionId", sessionId);

      const res = await fetch("/api/voice-notes/transcribe", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Transcription failed");

      const transcript: string = (json.rawTranscript ?? json.transcript ?? json.text ?? "").trim();
      if (!transcript) {
        setStatusMsg("Didn't catch that — tap the mic and try again.");
        setVoiceState("idle");
        return;
      }

      submitMessage(transcript, true);
    } catch {
      setStatusMsg("Transcription failed. Try again or use the text box.");
      setVoiceState("idle");
    }
  }

  // Keep ref and state in sync — use this everywhere instead of setMessages directly
  function setMsgs(next: AiChatMessage[]) {
    messagesRef.current = next;
    setMessages(next);
  }

  // ── Send message to Claude ───────────────────────────────────────────────────
  async function sendToAI(history: AiChatMessage[], speakResponse: boolean) {
    setVoiceState("ai_thinking");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI error");

      const aiMsg: AiChatMessage = { role: "assistant", content: json.reply };
      setMsgs([...messagesRef.current, aiMsg]);

      if (json.noteUpdate) {
        setPendingNoteUpdate(json.noteUpdate);
        setLatestNoteUpdate(json.noteUpdate); // persists so button stays available
      }

      if (speakResponse && json.reply) {
        // After AI speaks, auto-start listening for the SLP's next answer
        await playTTS(json.reply, { thenRecord: ttsAvailable });
        if (!ttsAvailable) setVoiceState("idle");
      } else {
        setVoiceState("idle");
      }
    } catch {
      setMsgs([
        ...messagesRef.current,
        { role: "assistant", content: "Sorry, I had trouble connecting. Please try again." },
      ]);
      setVoiceState("idle");
    }
  }

  function submitMessage(text: string, speakResponse = false) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: AiChatMessage = { role: "user", content: trimmed };
    const newHistory = [...messagesRef.current, userMsg];
    setMsgs(newHistory);
    setPendingNoteUpdate(null); // hide the card when user continues chatting
    setStatusMsg(null);
    sendToAI(newHistory, speakResponse);
  }

  function applyNote(source?: string | null) {
    // Use provided source, fall back to latest accumulated update, or build from raw user answers
    const effective = source ?? latestNoteUpdate ?? pendingNoteUpdate
      ?? messagesRef.current.filter(m => m.role === "user").map(m => m.content).join(". ");
    if (!effective.trim()) return;
    onApplyNote(effective);
    setPendingNoteUpdate(null);
    setLatestNoteUpdate(null);
    setMsgs([
      ...messagesRef.current,
      { role: "assistant", content: "Note updated. Is there anything else to add?" },
    ]);
  }

  // ── Derived UI state ────────────────────────────────────────────────────────
  const isProcessing = voiceState === "transcribing" || voiceState === "ai_thinking";
  const isSpeaking = voiceState === "speaking";

  const micLabel =
    voiceState === "recording"
      ? silenceProgress > 0 ? "Almost done…" : "Listening…"
      : voiceState === "transcribing" ? "Transcribing…"
      : voiceState === "ai_thinking"  ? "Thinking…"
      : voiceState === "speaking"     ? "Tap to interrupt"
      : "Tap to speak";

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 overflow-hidden flex flex-col">
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
      <div className="flex-1 overflow-y-auto min-h-[160px] max-h-[340px] px-3.5 py-3 space-y-2.5">
        {messages.length === 0 && voiceState === "ai_thinking" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
            Starting your interview…
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

      {/* Note update prompt — just the two action buttons */}
      {pendingNoteUpdate && (
        <div className="mx-3.5 mb-3 flex gap-2 shrink-0">
          <Button type="button" size="sm" className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={() => applyNote()}>
            <Check className="h-3 w-3" /> Apply to note
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setPendingNoteUpdate(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Voice control */}
      <div className="border-t border-violet-200 bg-white px-3.5 py-4 flex flex-col items-center gap-3 shrink-0">
        {statusMsg && <p className="text-xs text-destructive text-center">{statusMsg}</p>}

        {/* Central mic / state button */}
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
            {/* Live audio-level ring — scales with voice amplitude */}
            {voiceState === "recording" && (
              <span
                className="absolute inset-0 rounded-full bg-red-400 transition-transform duration-75 pointer-events-none"
                style={{
                  opacity: 0.15 + audioLevel * 0.35,
                  transform: `scale(${1 + audioLevel * 0.45})`,
                }}
              />
            )}
            {/* Silence countdown arc — SVG circle that drains as silence grows */}
            {voiceState === "recording" && silenceProgress > 0 && (
              <svg className="absolute -inset-1.5 w-[calc(100%+12px)] h-[calc(100%+12px)] -rotate-90 pointer-events-none" viewBox="0 0 96 96">
                <circle
                  cx="48" cy="48" r="44"
                  fill="none"
                  stroke="rgba(239,68,68,0.5)"
                  strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 44}`}
                  strokeDashoffset={`${2 * Math.PI * 44 * (1 - silenceProgress)}`}
                  strokeLinecap="round"
                  className="transition-all duration-75"
                />
              </svg>
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

          {voiceState === "recording" && silenceProgress === 0 && (
            <span className="text-[11px] text-muted-foreground/60">stops automatically when you pause</span>
          )}
          {isSpeaking && (
            <span className="text-[11px] text-violet-500">tap to interrupt</span>
          )}
        </div>

        {/* Persistent apply-to-note button — enabled once the SLP has said anything */}
        <button
          type="button"
          disabled={messages.filter(m => m.role === "user").length === 0}
          onClick={() => applyNote()}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check className="h-3 w-3" />
          Apply to note
        </button>

      </div>
    </div>
  );
}

// ─── TextChatPanel ────────────────────────────────────────────────────────────
// Text-only version of AiChatPanel — same interview logic, no voice/TTS.

function TextChatPanel({
  sessionId,
  context,
  onClose,
  onApplyNote,
}: {
  sessionId: string;
  context: AiChatContext;
  onClose: () => void;
  onApplyNote: (note: string) => void;
}) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isThinking, setIsThinking] = useState(true);
  const [pendingNoteUpdate, setPendingNoteUpdate] = useState<string | null>(null);
  const [latestNoteUpdate, setLatestNoteUpdate] = useState<string | null>(null);

  const initRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, isThinking]);

  // Kick off the first AI question on mount
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      sendToAI([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendToAI(history: AiChatMessage[]) {
    setIsThinking(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI error");

      const aiMsg: AiChatMessage = { role: "assistant", content: json.reply };
      setMessages((prev) => [...prev, aiMsg]);
      if (json.noteUpdate) {
        setPendingNoteUpdate(json.noteUpdate);
        setLatestNoteUpdate(json.noteUpdate);
      }
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
    const userMsg: AiChatMessage = { role: "user", content: trimmed };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setTextInput("");
    setPendingNoteUpdate(null); // hide the card, but latestNoteUpdate persists
    sendToAI(newHistory);
  }

  function applyNote(source?: string | null) {
    const effective = source ?? latestNoteUpdate ?? pendingNoteUpdate
      ?? messages.filter(m => m.role === "user").map(m => m.content).join(". ");
    if (!effective.trim()) return;
    onApplyNote(effective);
    setPendingNoteUpdate(null);
    setLatestNoteUpdate(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Note updated. Is there anything else to add?" },
    ]);
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-violet-100/60 border-b border-violet-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-5 w-5 rounded bg-violet-600/10">
            <Bot className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <span className="text-xs font-semibold text-violet-800">AI Text Chat</span>
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
      <div className="flex-1 overflow-y-auto min-h-[160px] max-h-[340px] px-3.5 py-3 space-y-2.5">
        {messages.length === 0 && isThinking && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
            Starting your chat…
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

      {/* Note update prompt — just the two action buttons */}
      {pendingNoteUpdate && (
        <div className="mx-3.5 mb-3 flex gap-2 shrink-0">
          <Button type="button" size="sm" className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={() => applyNote()}>
            <Check className="h-3 w-3" /> Apply to note
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setPendingNoteUpdate(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Text input + persistent apply button */}
      <div className="border-t border-violet-200 bg-white px-3.5 py-3 shrink-0 space-y-2">
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
        <button
          type="button"
          disabled={messages.filter(m => m.role === "user").length === 0}
          onClick={() => applyNote()}
          className="w-full flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check className="h-3 w-3" />
          Apply to note
        </button>
      </div>
    </div>
  );
}

// ─── SuggestEditsPanel ───────────────────────────────────────────────────────
// Lets the SLP type editing instructions; AI returns the full edited note.

interface EditMessage {
  role: "user" | "assistant";
  content: string;
}

function SuggestEditsPanel({
  sessionId,
  currentNote,
  onClose,
  onApplyNote,
}: {
  sessionId: string;
  /** Live note draft — updated in parent when user applies an edit. */
  currentNote: string;
  onClose: () => void;
  onApplyNote: (note: string) => void;
}) {
  const [messages, setMessages] = useState<EditMessage[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<string | null>(null);
  // Track the note state inside the panel so multi-turn edits build on each other
  const [workingNote, setWorkingNote] = useState(currentNote);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, isThinking]);

  async function sendInstruction(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: EditMessage = { role: "user", content: trimmed };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setTextInput("");
    setPendingEdit(null);
    setIsThinking(true);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/edit-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingNote: workingNote, messages: newHistory }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Edit failed");

      const aiMsg: EditMessage = { role: "assistant", content: json.reply };
      setMessages((prev) => [...prev, aiMsg]);
      if (json.editedNote) setPendingEdit(json.editedNote);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I had trouble applying that edit. Please try again." },
      ]);
    } finally {
      setIsThinking(false);
      setTimeout(() => textInputRef.current?.focus({ preventScroll: true }), 50);
    }
  }

  function applyEdit() {
    if (!pendingEdit) return;
    onApplyNote(pendingEdit);
    setWorkingNote(pendingEdit);
    setPendingEdit(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Applied. Want to make any other changes?" },
    ]);
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-violet-100/60 border-b border-violet-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-5 w-5 rounded bg-violet-600/10">
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <span className="text-xs font-semibold text-violet-800">Suggest Edits</span>
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
      <div className="flex-1 overflow-y-auto min-h-[160px] max-h-[340px] px-3.5 py-3 space-y-2.5">
        {messages.length === 0 && !isThinking && (
          <p className="text-xs text-muted-foreground italic">
            Describe the changes you'd like — e.g. "Make it more concise", "Add that she needed extra prompting on the /r/ goal", or "Remove the participation paragraph."
          </p>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="shrink-0 h-5 w-5 rounded bg-violet-100 flex items-center justify-center mt-0.5">
                <Sparkles className="h-3 w-3 text-violet-600" />
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

        {isThinking && (
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-violet-100 flex items-center justify-center">
              <Sparkles className="h-3 w-3 text-violet-600" />
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

      {/* Proposed edit card */}
      {pendingEdit && (
        <div className="mx-3.5 mb-3 rounded-lg border border-violet-200 bg-white p-3 space-y-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
            <Sparkles className="h-3.5 w-3.5" />
            Proposed edit
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{pendingEdit}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700"
              onClick={applyEdit}
            >
              <Check className="h-3 w-3" /> Apply to note
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setPendingEdit(null)}
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
                sendInstruction(textInput);
              }
            }}
            placeholder="Describe your edit… (Enter to send)"
            rows={2}
            disabled={isThinking}
            className="flex-1 resize-none text-xs rounded-md border border-input bg-background px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-40"
          />
          <Button
            type="button"
            size="icon"
            disabled={isThinking || !textInput.trim()}
            onClick={() => sendInstruction(textInput)}
            className="h-8 w-8 shrink-0 bg-violet-600 hover:bg-violet-700"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionNotePage({
  sessionId,
  sessionDate,
  startTime,
  sessionType,
  durationMins,
  location,
  students,
  initialNote,
  initialNotes,
  initialGoalData,
  initialSummaryContext = "",
}: SessionNotePageProps) {
  const router = useRouter();

  // ── Attendance ───────────────────────────────────────────────────────────────
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(
    Object.fromEntries(students.map((s) => [s.id, s.attendance]))
  );
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [showAttendanceEdit, setShowAttendanceEdit] = useState(false);

  const isPresent = (id: string) =>
    attendance[id] === "PRESENT" || attendance[id] === "MAKEUP";
  const anyPresent = students.some((s) => isPresent(s.id));
  const presentCount = students.filter((s) => isPresent(s.id)).length;

  async function saveAttendance(studentId: string, status: AttendanceStatus) {
    setAttendance((prev) => ({ ...prev, [studentId]: status }));
    setSavingAttendance(true);
    try {
      await fetch(`/api/sessions/${sessionId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: [{ studentId, attendance: status }] }),
      });
    } catch {
      toast.error("Failed to save attendance");
    } finally {
      setSavingAttendance(false);
    }
  }

  // ── Internal summary context (never shown as raw text to user) ────────────
  // Restored from saved voice-note transcripts so extracted fields survive navigation.
  const [summaryContext, setSummaryContext] = useState(initialSummaryContext);

  // When the user types directly (no voice), use the note text as the extraction source.
  // summaryContext (voice) always takes priority over typed text.
  const [noteExtractionContext, setNoteExtractionContext] = useState(initialNote);

  // ── Per-student note drafts ───────────────────────────────────────────────────
  // For group sessions each student gets their own note saved with their studentId.
  // For single-student sessions we keep the legacy session-wide key ("") so existing
  // saved notes (which have no studentId) are loaded and saved the same way as before.
  const isGroup = students.length > 1;
  const [activeStudentId, setActiveStudentId] = useState(students[0]?.id ?? "");
  const [studentNoteDrafts, setStudentNoteDrafts] = useState<Record<string, string>>(() => {
    if (isGroup && initialNotes) {
      return Object.fromEntries(students.map(s => [s.id, initialNotes[s.id] ?? ""]));
    }
    return { "": initialNote };
  });
  // Derived current note — always reads from the map for the active key
  const noteDraft = studentNoteDrafts[isGroup ? activeStudentId : ""] ?? "";
  function setNoteDraft(text: string) {
    const key = isGroup ? activeStudentId : "";
    setStudentNoteDrafts(prev => ({ ...prev, [key]: text }));
  }

  // ── Location / setting override ──────────────────────────────────────────────
  // Allows editing the session setting directly from the structured data panel.
  const [locationOverride, setLocationOverride] = useState<string | null>(null);
  const [durationOverride, setDurationOverride] = useState<number | null>(null);
  const [sessionTypeOverride, setSessionTypeOverride] = useState<string | null>(null);

  async function saveLocation(value: string) {
    const trimmed = value.trim() || null;
    setLocationOverride(trimmed);
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: trimmed }),
      });
    } catch {
      toast.error("Failed to save setting");
    }
  }

  async function saveDuration(value: string) {
    const mins = parseInt(value) || null;
    setDurationOverride(mins);
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMins: mins }),
      });
    } catch {
      toast.error("Failed to save duration");
    }
  }

  async function saveSessionType(value: string) {
    const trimmed = value.trim() || null;
    setSessionTypeOverride(trimmed);
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionType: trimmed }),
      });
    } catch {
      toast.error("Failed to save session type");
    }
  }
  // For group sessions combine all students' note drafts so goal extraction works
  // for every student's goals, not just whoever's tab is currently active.
  const combinedNoteDrafts = isGroup
    ? Object.values(studentNoteDrafts).filter(Boolean).join("\n\n")
    : noteDraft;
  const activeContext = summaryContext || combinedNoteDrafts || noteExtractionContext;

  const extracted = useMemo<ExtractedData>(() => {
    const fromContext = extractFromText(activeContext);
    // Also scan the note draft — the AI-generated note is often cleaner prose than the
    // raw voice transcript, so fields like "setting" may appear there but not in the transcript.
    const fromNote = noteDraft.trim() ? extractFromText(noteDraft) : {};
    // Merge: context wins for any field it found; note draft fills in gaps.
    return {
      ...fromNote,
      ...Object.fromEntries(
        Object.entries(fromContext).filter(([, v]) => v != null)
      ),
    } as ExtractedData;
  }, [activeContext, noteDraft]);

  // ── All goals across every student in this session ───────────────────────
  const allGoals = useMemo(
    () => students.flatMap((s) => s.goals),
    [students]
  );

  /**
   * Goals to show in the Clinical Data panel:
   * - Voice transcript: keyword-match (existing behavior); fall back to saved data goals if nothing matched.
   * - Typed note (no voice): show ALL goals so the user can see and edit any of them.
   * - No context at all: show goals that already have saved data points.
   */
  const matchedGoals = useMemo<MatchedGoalData[]>(() => {
    // Match goals from ALL available text sources — transcript, note draft, and extraction context
    const fromTranscript = summaryContext.trim()
      ? matchGoalsFromTranscript(summaryContext, allGoals) : [];
    const fromNote = combinedNoteDrafts.trim()
      ? matchGoalsFromTranscript(combinedNoteDrafts, allGoals) : [];
    const fromExtraction = noteExtractionContext.trim()
      ? matchGoalsFromTranscript(noteExtractionContext, allGoals) : [];

    const matchedIds = new Set([
      ...fromTranscript.map((g) => g.id),
      ...fromNote.map((g) => g.id),
      ...fromExtraction.map((g) => g.id),
    ]);
    const allMatched = allGoals.filter((g) => matchedIds.has(g.id));

    let goals: Goal[];
    if (allMatched.length > 0) {
      goals = allMatched;
    } else if (summaryContext.trim() || noteDraft.trim() || noteExtractionContext.trim()) {
      // Content exists but no keyword matches — show all goals so none are missed
      goals = allGoals;
    } else {
      // Nothing entered yet — always show all goals so the SLP has them for reference
      goals = allGoals;
    }

    return goals.map((goal) => {
      const fromContext = extractDataForGoal(activeContext, goal);
      // Also scan the note draft(s) — AI-generated notes often contain data not in the raw transcript
      const fromNote = combinedNoteDrafts.trim() ? extractDataForGoal(combinedNoteDrafts, goal) : {};
      const extracted: ExtractedData = {
        ...fromNote,
        ...Object.fromEntries(Object.entries(fromContext).filter(([, v]) => v != null)),
      };
      return { goal, extracted, saved: initialGoalData[goal.id] };
    });
  }, [summaryContext, noteExtractionContext, activeContext, noteDraft, combinedNoteDrafts, allGoals, initialGoalData]);

  // ── LLM-extracted structured data (keyed by goalId) ────────────────────────
  const [aiExtractions, setAiExtractions] = useState<Record<string, GoalAIExt>>({});
  const [aiSessionData, setAiSessionData] = useState<{ duration?: number | null; participation?: string | null }>({});

  /** Call the LLM extraction endpoint and update aiExtractions state. */
  const extractStructuredData = useCallback(async (context: string) => {
    if (!context.trim() || allGoals.length === 0) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/extract-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: context,
          goals: allGoals.map((g) => ({
            id: g.id,
            name: g.shortName ?? g.goalText,
            domain: g.domain,
          })),
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.extractions) setAiExtractions(data.extractions);
      if (data.duration != null || data.participation != null)
        setAiSessionData({ duration: data.duration, participation: data.participation });
    } catch {
      // Non-critical — UI stays on regex fallback
    }
  }, [sessionId, allGoals]);

  // On load: run AI extraction against the voice transcript and/or saved note draft
  useEffect(() => {
    const transcript = initialSummaryContext.trim();
    const note = initialNote.trim();
    if (transcript || note) {
      // Send both if available so the extractor can pick the richest source
      extractStructuredData(transcript && note ? `${transcript}\n\n${note}` : transcript || note);
    }
    if (note) {
      setNoteExtractionContext(note);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── User overrides for clinical data (per goalId) ───────────────────────────
  const [goalOverrides, setGoalOverrides] = useState<Record<string, GoalOverride>>({});

  /** Save a user-edited field for a goal — updates state and persists to DB. */
  async function saveGoalOverride(goalId: string, field: "accuracy" | "trials" | "cueingLevel", raw: string) {
    const prev = goalOverrides[goalId] ?? {};
    const next = { ...prev };

    if (field === "accuracy") {
      const n = parseFloat(raw);
      next.accuracy = isNaN(n) ? null : Math.min(100, Math.max(0, Math.round(n)));
      next.trialsCorrect = undefined;
      next.trialsTotal = undefined;
    } else if (field === "trials") {
      const m = raw.match(/^(\d+)\s*[\/]\s*(\d+)$/);
      if (m) {
        next.trialsCorrect = parseInt(m[1]);
        next.trialsTotal   = parseInt(m[2]);
        next.accuracy      = next.trialsTotal > 0 ? Math.round((next.trialsCorrect / next.trialsTotal) * 100) : null;
      } else {
        next.trialsCorrect = null;
        next.trialsTotal   = null;
      }
    } else {
      next.cueingLevel = raw || null;
    }

    setGoalOverrides((p) => ({ ...p, [goalId]: next }));

    // Compute final accuracy to send to the data-points endpoint
    const accuracy = (next.trialsCorrect != null && next.trialsTotal != null && next.trialsTotal > 0)
      ? Math.round((next.trialsCorrect / next.trialsTotal) * 100)
      : next.accuracy ?? null;

    if (accuracy == null) return; // nothing meaningful to persist yet

    try {
      await fetch(`/api/goals/${goalId}/data-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId,
          sessionId,
          accuracy,
          trialsCorrect: next.trialsCorrect ?? null,
          trialsTotal:   next.trialsTotal   ?? null,
          cueingLevel:   next.cueingLevel   ?? null,
          collectedAt:   format(new Date(sessionDate), "yyyy-MM-dd"),
        }),
      });
    } catch {
      toast.error("Failed to save goal data");
    }
  }

  // ── AI Chat ───────────────────────────────────────────────────────────────────
  const [showAiChat, setShowAiChat] = useState(false);
  const [showTextChat, setShowTextChat] = useState(false);
  const [showSuggestEdits, setShowSuggestEdits] = useState(false);

  // ── Note draft (continued) ───────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [generatedAt, setGeneratedAt] = useState<Date | null>(
    initialNote ? new Date() : null
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const noteDebouncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** true when the note was just AI-generated and still contains **inference** markers */
  const [notePreviewMode, setNotePreviewMode] = useState(false);
  /** Index of the inference span currently being edited inline (-1 = none) */
  const [editingInferenceIdx, setEditingInferenceIdx] = useState(-1);
  const [editingInferenceValue, setEditingInferenceValue] = useState("");
  const editingSpanRef = useRef<HTMLSpanElement>(null);

  async function generateNote(contextOverride?: string) {
    setGenerating(true);
    try {
      const context = contextOverride ?? summaryContext;

      // Build per-goal data for the LLM prompt
      const currentGoals = context.trim()
        ? matchGoalsFromTranscript(context, allGoals)
        : allGoals.filter((g) => !!initialGoalData[g.id]);

      const currentMatchedGoals: MatchedGoalData[] = currentGoals.map((goal) => ({
        goal,
        extracted: extractDataForGoal(context, goal),
        saved: initialGoalData[goal.id],
      }));

      const goalsForNote = currentMatchedGoals.map((mg) => {
        const aiExt  = aiExtractions[mg.goal.id];
        const ovride = goalOverrides[mg.goal.id];
        const acc    = goalEffectiveAccuracy(mg, aiExt, ovride);
        const trials = goalEffectiveTrials(mg,   aiExt, ovride);
        const cueing = goalEffectiveCueing(mg,   aiExt, ovride);
        const [tc, tt] = trials ? trials.split("/").map(Number) : [null, null];
        return {
          name: mg.goal.shortName ?? mg.goal.goalText.slice(0, 60),
          accuracy: acc,
          trialsCorrect: tc ?? null,
          trialsTotal:   tt ?? null,
          cueingLevel:   cueing,
        };
      });

      const attendanceList = students.map((s) => ({
        name: `${s.firstName} ${s.lastName}`,
        status: attendance[s.id] ?? s.attendance,
      }));

      const res = await fetch(`/api/sessions/${sessionId}/generate-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summaryText: context.trim(),
          goals: goalsForNote,
          attendance: attendanceList,
          sessionDate: format(new Date(sessionDate), "MMM d, yyyy"),
          sessionType: SESSION_TYPE_LABELS[sessionType] ?? sessionType,
          durationMins,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      const draft: string = json.draftNote;
      setNoteDraft(draft);
      // Use marker-stripped text for extraction so ** doesn't confuse the parsers
      const cleanDraft = draft.replace(/\*\*([^*]+)\*\*/g, "$1");
      setNoteExtractionContext(cleanDraft);
      setGeneratedAt(new Date());
      setHasUnsavedChanges(true);
      // Enter preview mode if the AI marked any inferred content
      setNotePreviewMode(/\*\*[^*]+\*\*/.test(draft));
      toast.success("Note generated");
      // Extract structured data from the generated clinical note
      extractStructuredData(cleanDraft);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate note");
    } finally {
      setGenerating(false);
    }
  }

  /** Persist the note draft to the DB. Always strips inference markers before saving. */
  async function persistNote(note: string) {
    if (!note.trim()) return;
    const cleanNote = note.replace(/\*\*([^*]+)\*\*/g, "$1");
    setNoteStatus("saving");
    try {
      const noteBody: { noteText: string; studentId?: string } = { noteText: cleanNote };
      if (isGroup) noteBody.studentId = activeStudentId;
      const res = await fetch(`/api/sessions/${sessionId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noteBody),
      });
      if (!res.ok) throw new Error();
      setNoteStatus("saved");
      setHasUnsavedChanges(false);
      setTimeout(() => setNoteStatus("idle"), 2500);
    } catch {
      setNoteStatus("idle");
    }
  }

  function handleNoteChange(text: string) {
    setNoteDraft(text);
    setNoteStatus("idle");
    setHasUnsavedChanges(true);
    setNotePreviewMode(false);
    setNoteExtractionContext(text.replace(/\*\*([^*]+)\*\*/g, "$1"));

    // If the note is fully cleared, reset all derived/extracted data so the
    // structured session data panel clears out too.
    if (!text.trim()) {
      setSummaryContext("");
      setAiExtractions({});
      setAiSessionData({});
      setGoalOverrides({});
      if (noteDebouncRef.current) clearTimeout(noteDebouncRef.current);
      return;
    }

    // Run AI extraction with debounce — combine voice transcript + note for best coverage
    if (noteDebouncRef.current) clearTimeout(noteDebouncRef.current);
    noteDebouncRef.current = setTimeout(() => {
      if (text.trim().length > 40) {
        const combined = summaryContext.trim()
          ? `${summaryContext}\n\n${text}`
          : text;
        extractStructuredData(combined);
      }
    }, 1500);
  }

  /** Shared helper: after mutating noteDraft, exit preview mode if no markers remain. */
  function afterInferenceChange(newDraft: string) {
    setNoteDraft(newDraft);
    setHasUnsavedChanges(true);
    if (!/\*\*[^*]+\*\*/.test(newDraft)) {
      setNotePreviewMode(false);
      setNoteExtractionContext(newDraft);
    }
  }

  /** Accept a single inferred span — keeps the text, removes markers. */
  function acceptInference(idx: number) {
    let count = 0;
    const newDraft = noteDraft.replace(/\*\*([^*]+)\*\*/g, (match, content) => {
      const result = count === idx ? content : match;
      count++;
      return result;
    });
    afterInferenceChange(newDraft);
  }

  /** Deny a single inferred span — removes the entire sentence containing it. */
  function denyInference(idx: number) {
    const text = noteDraft;

    // Locate the nth **...** marker
    let count = 0;
    let markerStart = -1;
    let markerEnd = -1;
    text.replace(/\*\*([^*]+)\*\*/g, (match, _c, offset) => {
      if (count === idx) { markerStart = offset; markerEnd = offset + match.length; }
      count++;
      return match;
    });
    if (markerStart === -1) return;

    // ── Find sentence start ──────────────────────────────────────────────────
    // Scan backward from markerStart; stop after .!? or \n
    let sentStart = 0;
    for (let i = markerStart - 1; i >= 0; i--) {
      if (/[.!?]/.test(text[i])) {
        // Start of our sentence is right after this punctuation + any spaces
        let j = i + 1;
        while (j < markerStart && text[j] === ' ') j++;
        sentStart = j;
        break;
      }
      if (text[i] === '\n') {
        sentStart = i + 1;
        break;
      }
    }

    // ── Find sentence end ────────────────────────────────────────────────────
    // Scan forward from markerStart (period may be inside the marker)
    let sentEnd = text.length;
    for (let i = markerStart; i < text.length; i++) {
      if (/[.!?]/.test(text[i])) {
        sentEnd = i + 1;
        // Consume trailing spaces (preserve paragraph newlines)
        while (sentEnd < text.length && text[sentEnd] === ' ') sentEnd++;
        // Ensure we've gone past the closing ** of the marker
        if (sentEnd < markerEnd) sentEnd = markerEnd;
        break;
      }
      if (text[i] === '\n' && i >= markerEnd) {
        sentEnd = i + 1;
        break;
      }
    }

    // ── Remove sentence and clean up extra blank lines ────────────────────────
    const newDraft = (text.slice(0, sentStart) + text.slice(sentEnd))
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^ +/gm, (m, offset) => offset === 0 ? '' : m) // trim leading spaces on first line
      .trim();
    afterInferenceChange(newDraft);
  }

  /** Begin inline editing of a single inferred span. */
  function startEditInference(idx: number, currentText: string) {
    setEditingInferenceIdx(idx);
    setEditingInferenceValue(currentText);
  }

  /** Confirm the inline edit — replaces the span with the edited plain text. */
  function confirmEditInference(idx: number, textOverride?: string) {
    const replacement = (textOverride ?? editingSpanRef.current?.textContent ?? editingInferenceValue).trim();
    let count = 0;
    const newDraft = noteDraft.replace(/\*\*([^*]+)\*\*/g, (match) => {
      const result = count === idx ? replacement : match;
      count++;
      return result;
    });
    setEditingInferenceIdx(-1);
    setEditingInferenceValue("");
    afterInferenceChange(newDraft);
  }

  /** Merge new information into the existing note without rewriting it. */
  async function augmentNote(newTranscript: string) {
    if (!newTranscript.trim()) return; // nothing recorded — leave note alone
    if (!noteDraft.trim()) {
      // No existing note — fall back to a full generation
      return generateNote(newTranscript);
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/generate-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summaryText: newTranscript.trim(),
          existingNote: noteDraft.trim(),
          attendance: students.map((s) => ({
            name: `${s.firstName} ${s.lastName}`,
            status: attendance[s.id] ?? s.attendance,
          })),
          sessionDate: format(new Date(sessionDate), "MMM d, yyyy"),
          sessionType: SESSION_TYPE_LABELS[sessionType] ?? sessionType,
          durationMins,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Augmentation failed");
      const draft: string = json.draftNote;
      setNoteDraft(draft);
      setNoteExtractionContext(draft);
      setGeneratedAt(new Date());
      setHasUnsavedChanges(true);
      toast.success("Note updated");
      extractStructuredData(draft);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update note");
    } finally {
      setGenerating(false);
    }
  }

  // ── Voice handler — receives transcript, updates context, auto-generates ────
  async function handleVoiceTranscript(text: string, mode: TranscriptMode) {
    if (mode === "append") {
      // Add information mode — merge new transcript into existing note
      if (!text.trim()) return; // silence recorded, nothing to do
      setSummaryContext(summaryContext ? `${summaryContext} ${text}` : text);
      await Promise.all([
        augmentNote(text),
        extractStructuredData(text),
      ]);
    } else {
      // Replace mode — full regeneration
      setSummaryContext(text);
      await Promise.all([
        generateNote(text),
        extractStructuredData(text),
      ]);
    }
  }

  // ── Complete ─────────────────────────────────────────────────────────────────
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);

  async function markComplete() {
    if (!noteDraft.trim()) {
      toast.error("Please add a session note before completing.");
      return;
    }
    setCompleting(true);
    try {
      const finalNote = noteDraft.trim();
      const completeBody: { noteText: string; studentId?: string } = { noteText: finalNote };
      if (isGroup) completeBody.studentId = activeStudentId;
      const res = await fetch(`/api/sessions/${sessionId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeBody),
      });
      if (!res.ok) throw new Error();
      setCompleted(true);
      toast.success("Documentation complete");
      router.refresh();
    } catch {
      toast.error("Failed to save — please try again");
    } finally {
      setCompleting(false);
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────────
  const docStatus = getDocStatus(noteDraft, completed);

  // Per-goal aggregate checks — used for the top missing-fields banner
  const hasAnyGoalAccuracy = matchedGoals.some((mg) => goalEffectiveAccuracy(mg, aiExtractions[mg.goal.id], goalOverrides[mg.goal.id]) != null);
  const hasAnyGoalTrials   = matchedGoals.some((mg) => goalEffectiveTrials(mg,   aiExtractions[mg.goal.id], goalOverrides[mg.goal.id]) != null);
  const hasAnyGoalCueing   = matchedGoals.some((mg) => goalEffectiveCueing(mg,   aiExtractions[mg.goal.id], goalOverrides[mg.goal.id]) != null);

  const effectiveDuration = durationOverride || durationMins || aiSessionData.duration || extracted.durationMins || null;
  // Use || instead of ?? so empty strings ("") also fall through to the next source
  const effectiveLocation = locationOverride || location || extracted.setting || null;
  const effectiveSessionType = sessionTypeOverride || sessionType;

  const missingLabels: string[] = [];
  if (!effectiveLocation) missingLabels.push("Setting");
  if (!effectiveDuration) missingLabels.push("Duration");
  if (anyPresent && matchedGoals.length === 0) missingLabels.push("Goals");
  if (anyPresent && matchedGoals.length > 0 && !hasAnyGoalAccuracy) missingLabels.push("Accuracy");
  if (anyPresent && matchedGoals.length > 0 && !hasAnyGoalTrials) missingLabels.push("# of Trials");
  if (anyPresent && matchedGoals.length > 0 && !hasAnyGoalCueing) missingLabels.push("Level of Support");

  const allFieldsCaptured = missingLabels.length === 0;

  /** Render an editable data card for a single matched goal. */
  function renderGoalCard(mg: MatchedGoalData) {
    const aiExt  = aiExtractions[mg.goal.id];
    const ovride = goalOverrides[mg.goal.id];
    const acc    = goalEffectiveAccuracy(mg, aiExt, ovride);
    const trials = goalEffectiveTrials(mg,   aiExt, ovride);
    const cueing = goalEffectiveCueing(mg,   aiExt, ovride);
    const goalLabel = mg.goal.shortName ?? mg.goal.goalText.slice(0, 50);
    const rawAcc    = ovride?.accuracy != null ? String(ovride.accuracy)
                    : aiExt?.accuracy != null  ? String(aiExt.accuracy)
                    : acc != null              ? String(acc) : "";
    const rawTrials = ovride?.trialsCorrect != null ? `${ovride.trialsCorrect}/${ovride.trialsTotal}`
                    : aiExt?.trialsCorrect != null  ? `${aiExt.trialsCorrect}/${aiExt.trialsTotal}`
                    : trials ?? "";
    const rawCueing = ovride?.cueingLevel !== undefined ? (ovride.cueingLevel ?? "")
                    : aiExt?.cueingLevel              ?? cueing ?? "";
    return (
      <div key={mg.goal.id}>
        <p className="text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {goalLabel}
        </p>
        <div className="rounded-lg border divide-y">
          <EditableFieldRow
            label="Accuracy"
            rawValue={rawAcc}
            displayValue={acc != null ? `${acc}%` : null}
            missing={acc == null}
            placeholder="e.g. 80"
            onSave={(v) => saveGoalOverride(mg.goal.id, "accuracy", v)}
          />
          <EditableFieldRow
            label="Number of Trials"
            rawValue={rawTrials}
            displayValue={trials}
            missing={!trials}
            placeholder="e.g. 8/10"
            onSave={(v) => saveGoalOverride(mg.goal.id, "trials", v)}
          />
          <EditableFieldRow
            label="Level of Support"
            rawValue={rawCueing}
            displayValue={cueing ? CUEING_LABELS[cueing] ?? cueing : null}
            missing={!cueing}
            editType="select"
            editOptions={Object.entries(CUEING_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            onSave={(v) => saveGoalOverride(mg.goal.id, "cueingLevel", v)}
          />
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-8">

      {/* ══════════════════════════════════════════════════════
          SESSION HEADER BAR
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-xl border bg-card px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-1.5 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-semibold">{formatDate(new Date(sessionDate))}</span>
              {startTime && (
                <span className="text-muted-foreground">· {formatTime(startTime)}</span>
              )}
            </div>
            {effectiveDuration && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {effectiveDuration} min
              </div>
            )}
            <Badge variant="secondary" className="text-xs">
              {SESSION_TYPE_LABELS[sessionType] ?? sessionType.replace(/_/g, " ")}
            </Badge>
            {effectiveLocation && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {effectiveLocation}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span>{students.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}</span>
              {students.length > 1 && (
                <span className="text-xs">({presentCount}/{students.length} present)</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {anyPresent ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
                <Check className="h-3 w-3" />
                {presentCount === 1 ? "Present" : `${presentCount} Present`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
                <Ban className="h-3 w-3" /> Absent
              </span>
            )}
            <DocStatusBadge status={docStatus} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          TWO-COLUMN LAYOUT
      ══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 items-start">

        {/* ── LEFT COLUMN ────────────────────────────────── */}
        <div className="space-y-4">

          {/* Split layout: chat panel slides in to the left of the note card */}
          <div className={cn(
            "grid gap-4 items-start transition-[grid-template-columns] duration-300",
            (showAiChat || showTextChat || showSuggestEdits) ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
          )}>

            {/* ── AI / Text Chat / Suggest Edits Panel (left slot) ── */}
            {(showAiChat || showTextChat || showSuggestEdits) && (
              <div className="animate-in slide-in-from-left-4 duration-300">
                {showAiChat ? (
                  <AiChatPanel
                    sessionId={sessionId}
                    context={{
                      sessionDate: format(new Date(sessionDate), "MMM d, yyyy"),
                      sessionType: SESSION_TYPE_LABELS[sessionType] ?? sessionType,
                      durationMins: effectiveDuration,
                      students: students.map((s) => `${s.firstName} ${s.lastName}`),
                      goals: matchedGoals.map((mg) => {
                        const aiExt  = aiExtractions[mg.goal.id];
                        const ovride = goalOverrides[mg.goal.id];
                        return {
                          id: mg.goal.id,
                          name: mg.goal.shortName ?? mg.goal.goalText.slice(0, 50),
                          accuracy: goalEffectiveAccuracy(mg, aiExt, ovride),
                          trials: goalEffectiveTrials(mg, aiExt, ovride),
                          cueing: goalEffectiveCueing(mg, aiExt, ovride),
                        };
                      }),
                      missingLabels,
                      currentNote: noteDraft,
                      transcript: summaryContext || undefined,
                      ...(isGroup && {
                        studentContexts: students.map((s) => ({
                          studentId: s.id,
                          studentName: `${s.firstName} ${s.lastName}`,
                          goals: matchedGoals
                            .filter((mg) => s.goals.some((g) => g.id === mg.goal.id))
                            .map((mg) => {
                              const aiExt  = aiExtractions[mg.goal.id];
                              const ovride = goalOverrides[mg.goal.id];
                              return {
                                id: mg.goal.id,
                                name: mg.goal.shortName ?? mg.goal.goalText.slice(0, 50),
                                accuracy: goalEffectiveAccuracy(mg, aiExt, ovride),
                                trials: goalEffectiveTrials(mg, aiExt, ovride),
                                cueing: goalEffectiveCueing(mg, aiExt, ovride),
                              };
                            }),
                          currentNote: studentNoteDrafts[s.id] ?? "",
                        })),
                      }),
                    }}
                    onClose={() => setShowAiChat(false)}
                    onApplyNote={(summary) => generateNote(summary)}
                  />
                ) : showSuggestEdits ? (
                  <SuggestEditsPanel
                    sessionId={sessionId}
                    currentNote={noteDraft}
                    onClose={() => setShowSuggestEdits(false)}
                    onApplyNote={(edited) => {
                      setNoteDraft(edited);
                      setNoteExtractionContext(edited);
                      setGeneratedAt(new Date());
                      setHasUnsavedChanges(true);
                      extractStructuredData(edited);
                    }}
                  />
                ) : (
                  <TextChatPanel
                    sessionId={sessionId}
                    context={{
                      sessionDate: format(new Date(sessionDate), "MMM d, yyyy"),
                      sessionType: SESSION_TYPE_LABELS[sessionType] ?? sessionType,
                      durationMins: effectiveDuration,
                      students: students.map((s) => `${s.firstName} ${s.lastName}`),
                      goals: matchedGoals.map((mg) => {
                        const aiExt  = aiExtractions[mg.goal.id];
                        const ovride = goalOverrides[mg.goal.id];
                        return {
                          id: mg.goal.id,
                          name: mg.goal.shortName ?? mg.goal.goalText.slice(0, 50),
                          accuracy: goalEffectiveAccuracy(mg, aiExt, ovride),
                          trials: goalEffectiveTrials(mg, aiExt, ovride),
                          cueing: goalEffectiveCueing(mg, aiExt, ovride),
                        };
                      }),
                      missingLabels,
                      currentNote: noteDraft,
                      transcript: summaryContext || undefined,
                      ...(isGroup && {
                        studentContexts: students.map((s) => ({
                          studentId: s.id,
                          studentName: `${s.firstName} ${s.lastName}`,
                          goals: matchedGoals
                            .filter((mg) => s.goals.some((g) => g.id === mg.goal.id))
                            .map((mg) => {
                              const aiExt  = aiExtractions[mg.goal.id];
                              const ovride = goalOverrides[mg.goal.id];
                              return {
                                id: mg.goal.id,
                                name: mg.goal.shortName ?? mg.goal.goalText.slice(0, 50),
                                accuracy: goalEffectiveAccuracy(mg, aiExt, ovride),
                                trials: goalEffectiveTrials(mg, aiExt, ovride),
                                cueing: goalEffectiveCueing(mg, aiExt, ovride),
                              };
                            }),
                          currentNote: studentNoteDrafts[s.id] ?? "",
                        })),
                      }),
                    }}
                    onClose={() => setShowTextChat(false)}
                    onApplyNote={(summary) => augmentNote(summary)}
                  />
                )}
              </div>
            )}

            {/* ─ CARD 1: Session Note Draft ──────────────────── */}
            <div className="rounded-xl border bg-card overflow-hidden">
              {/* AI header banner */}
              <div className="flex items-center gap-2.5 px-5 py-3.5 bg-primary/5 border-b border-primary/10">
                <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Session Note Draft</p>
                  <p className="text-xs text-muted-foreground">
                    {(showAiChat || showTextChat || showSuggestEdits)
                      ? "Edit directly or apply suggestions from the AI panel"
                      : "Record your session summary or click Generate to draft from goal data"}
                  </p>
                </div>
                {generatedAt && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(generatedAt, "h:mm a")}
                  </span>
                )}
              </div>

              {/* Student tabs — only shown for group sessions */}
              {isGroup && (
                <div className="flex bg-muted/20 border-b">
                  {students.map(s => {
                    const hasNote = (studentNoteDrafts[s.id] ?? "").trim().length > 0;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setActiveStudentId(s.id)}
                        className={cn(
                          "px-5 py-2.5 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5",
                          activeStudentId === s.id
                            ? "bg-card text-foreground border-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border-transparent",
                        )}
                      >
                        {s.firstName} {s.lastName}
                        {hasNote && (
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="p-5 space-y-4">
                {/* Voice recorder + AI buttons */}
                <VoiceCapture
                  sessionId={sessionId}
                  hasExistingContent={!!noteDraft.trim()}
                  onTranscript={handleVoiceTranscript}
                  onTalkToAI={() => { setShowTextChat(false); setShowSuggestEdits(false); setShowAiChat((v) => !v); }}
                  onTextChat={() => { setShowAiChat(false); setShowSuggestEdits(false); setShowTextChat((v) => !v); }}
                  onSuggestEdits={noteDraft.trim() ? () => { setShowAiChat(false); setShowTextChat(false); setShowSuggestEdits((v) => !v); } : undefined}
                  onRegenerate={() => generateNote()}
                  onClearNote={() => {
                    setNoteDraft("");
                    setSummaryContext("");
                    setNoteExtractionContext("");
                    setAiExtractions({});
                    setAiSessionData({});
                    setGoalOverrides({});
                    setHasUnsavedChanges(false);
                  }}
                />

                {/* Note display — preview mode (inference highlights) or plain textarea */}
                <div className="space-y-1.5">
                  {notePreviewMode && noteDraft ? (
                    <>
                      {/* Rendered preview with per-inference hover-accept */}
                      <div
                        className="text-sm leading-relaxed font-sans rounded-md border border-input bg-background px-3 py-2 whitespace-pre-wrap"
                        style={{ minHeight: (showAiChat || showTextChat || showSuggestEdits) ? "18rem" : "14rem" }}
                      >
                        {(() => {
                          const parts = noteDraft.split(/\*\*([^*]+)\*\*/g);
                          let inferIdx = 0;
                          return parts.map((part, i) => {
                            if (i % 2 === 1) {
                              const currentIdx = inferIdx++;
                              const isEditing = editingInferenceIdx === currentIdx;
                              return (
                                <span key={i} className="inline">
                                  {isEditing ? (
                                    /* ── contentEditable span: truly inline, wraps with surrounding text ── */
                                    <>
                                      <span
                                        ref={editingSpanRef}
                                        contentEditable
                                        suppressContentEditableWarning
                                        // dangerouslySetInnerHTML sets initial value; React won't fight contentEditable after mount
                                        dangerouslySetInnerHTML={{ __html: editingInferenceValue }}
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") { e.preventDefault(); confirmEditInference(currentIdx, e.currentTarget.textContent ?? ""); }
                                          if (e.key === "Escape") { setEditingInferenceIdx(-1); setEditingInferenceValue(""); }
                                        }}
                                        className="bg-amber-50 text-amber-900 font-semibold rounded px-0.5 border-b-2 border-amber-400 focus:border-amber-600 focus:outline-none cursor-text"
                                      />
                                      <span className="inline-flex items-center gap-0.5 ml-0.5 align-middle">
                                        <button
                                          title="Confirm"
                                          onClick={(e) => { e.stopPropagation(); confirmEditInference(currentIdx, editingSpanRef.current?.textContent ?? ""); }}
                                          className="inline-flex items-center justify-center h-4 w-4 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200 transition-colors"
                                        >
                                          <Check className="h-2.5 w-2.5" />
                                        </button>
                                        <button
                                          title="Cancel"
                                          onClick={(e) => { e.stopPropagation(); setEditingInferenceIdx(-1); setEditingInferenceValue(""); }}
                                          className="inline-flex items-center justify-center h-4 w-4 rounded bg-muted text-muted-foreground border border-border hover:bg-muted/80 transition-colors"
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </span>
                                    </>
                                  ) : (
                                    /* ── Static highlight + action chips ── */
                                    <>
                                      <mark className="bg-amber-100 text-amber-900 rounded px-0.5 font-semibold not-italic">
                                        {part}
                                      </mark>
                                      <span className="inline-flex items-center gap-0.5 ml-0.5 align-middle">
                                        <button
                                          title="Accept"
                                          onClick={(e) => { e.stopPropagation(); acceptInference(currentIdx); }}
                                          className="inline-flex items-center justify-center h-4 w-4 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                        >
                                          <Check className="h-2.5 w-2.5" />
                                        </button>
                                        <button
                                          title="Edit"
                                          onClick={(e) => { e.stopPropagation(); startEditInference(currentIdx, part); }}
                                          className="inline-flex items-center justify-center h-4 w-4 rounded bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors"
                                        >
                                          <Pencil className="h-2.5 w-2.5" />
                                        </button>
                                        <button
                                          title="Deny"
                                          onClick={(e) => { e.stopPropagation(); denyInference(currentIdx); }}
                                          className="inline-flex items-center justify-center h-4 w-4 rounded bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 transition-colors"
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </span>
                                    </>
                                  )}
                                </span>
                              );
                            }
                            return <span key={i}>{part}</span>;
                          });
                        })()}
                      </div>
                      {/* Preview action row */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-700 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Use ✓ accept, ✏ edit, or ✗ deny on each highlighted phrase
                        </span>
                        <button
                          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                          onClick={() => {
                            const clean = noteDraft.replace(/\*\*([^*]+)\*\*/g, "$1");
                            handleNoteChange(clean);
                          }}
                        >
                          <Check className="h-3 w-3" />
                          Accept all
                        </button>
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                          onClick={() => setNotePreviewMode(false)}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Textarea
                        value={noteDraft}
                        onChange={(e) => handleNoteChange(e.target.value)}
                        placeholder={
                          generating
                            ? "Generating note draft…"
                            : "Record your session above, or click Generate to draft from goal data."
                        }
                        rows={(showAiChat || showTextChat || showSuggestEdits) ? 12 : 10}
                        className="resize-y text-sm leading-relaxed font-sans"
                        disabled={generating}
                      />
                      <div className="flex items-center justify-between">
                        {noteDraft && (
                          <span className="text-xs text-muted-foreground/70 italic flex items-center gap-1">
                            <Bot className="h-3 w-3" />
                            AI-generated — review and edit before saving
                          </span>
                        )}
                        <span
                          className={cn(
                            "text-xs ml-auto transition-colors",
                            noteStatus === "saved" ? "text-green-600" : "text-muted-foreground"
                          )}
                        >
                          {noteStatus === "saving" && "Saving…"}
                          {noteStatus === "saved" && "Draft saved ✓"}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {noteDraft && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground/70 border-t pt-3">
                    <span>{noteDraft.replace(/\*\*([^*]+)\*\*/g, "$1").trim().split(/\s+/).filter(Boolean).length} words</span>
                    {noteDraft.replace(/\*\*([^*]+)\*\*/g, "$1").trim().length < 30 && (
                      <span className="text-amber-600">Note is very short</span>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

        {/* ── RIGHT COLUMN ───────────────────────────────── */}
        <div className="space-y-4">

          {/* ─ CARD 3: Structured Session Data ─────────────── */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b bg-muted/30">
              <h2 className="text-sm font-semibold">Structured Session Data</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Extracted from your note or recording — click any field to edit
              </p>
            </div>

            <div className="p-5 space-y-5">
              {/* Missing / captured banner */}
              {allFieldsCaptured ? (
                <div className="flex items-center gap-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  All required fields captured
                </div>
              ) : (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    <span className="font-semibold">Missing: </span>
                    {missingLabels.join(", ")}
                  </span>
                </div>
              )}

              {/* A. Session Context */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  A. Session Context
                </p>
                <div className="rounded-lg border divide-y">
                  <FieldRow icon={CalendarDays} label="Date" value={formatDate(new Date(sessionDate))} />
                  <EditableFieldRow
                    icon={Clock}
                    label="Duration"
                    rawValue={effectiveDuration ? String(effectiveDuration) : ""}
                    displayValue={effectiveDuration ? `${effectiveDuration} min` : undefined}
                    missing={!effectiveDuration}
                    placeholder="e.g. 30"
                    onSave={saveDuration}
                  />
                  <EditableFieldRow
                    icon={MapPin}
                    label="Setting"
                    rawValue={effectiveLocation ?? ""}
                    displayValue={effectiveLocation}
                    missing={!effectiveLocation}
                    placeholder="e.g. Speech Room"
                    onSave={saveLocation}
                  />
                  <EditableFieldRow
                    icon={Info}
                    label="Type"
                    rawValue={effectiveSessionType}
                    displayValue={SESSION_TYPE_LABELS[effectiveSessionType] ?? effectiveSessionType.replace(/_/g, " ")}
                    editType="select"
                    editOptions={Object.entries(SESSION_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                    onSave={saveSessionType}
                  />
                  {/* Students + attendance */}
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-[130px] pt-0.5">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        Students Present
                      </div>
                      <div className="text-right space-y-1.5 flex-1">
                        {students.map((s) => {
                          const att = attendance[s.id];
                          const present = isPresent(s.id);
                          return (
                            <div key={s.id} className="flex items-center gap-2 justify-end">
                              <span className="text-xs text-muted-foreground">
                                {s.firstName} {s.lastName}
                              </span>
                              <span className={cn(
                                "text-xs font-medium rounded px-1.5 py-0.5",
                                present ? "text-green-700 bg-green-50" : "text-slate-600 bg-slate-100"
                              )}>
                                {att?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? "—"}
                              </span>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setShowAttendanceEdit((v) => !v)}
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          {showAttendanceEdit ? "Done" : "Edit attendance"}
                        </button>
                      </div>
                    </div>

                    {showAttendanceEdit && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        {students.map((s) => (
                          <div key={s.id} className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-xs font-medium">{s.firstName} {s.lastName}</span>
                            <div className="flex gap-1">
                              {ATTENDANCE_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => saveAttendance(s.id, opt.value)}
                                  disabled={savingAttendance}
                                  className={cn(
                                    "px-2 py-0.5 rounded-full text-xs font-medium border transition-colors",
                                    attendance[s.id] === opt.value
                                      ? opt.value === "PRESENT" || opt.value === "MAKEUP"
                                        ? "bg-green-500 text-white border-green-500"
                                        : "bg-slate-600 text-white border-slate-600"
                                      : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                                  )}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* B. Clinical Data */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  B. Clinical Data
                </p>

                {isGroup ? (
                  /* ── Group session: one sub-section per student ── */
                  <div className="space-y-5">
                    {students.map((s) => {
                      const studentGoals = matchedGoals.filter((mg) =>
                        s.goals.some((g) => g.id === mg.goal.id)
                      );
                      return (
                        <div key={s.id}>
                          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {s.firstName} {s.lastName}
                          </p>
                          {studentGoals.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic pl-5">
                              No goals on file for this student.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {studentGoals.map((mg) => renderGoalCard(mg))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : matchedGoals.length === 0 ? (
                  /* ── Single student, no goals ── */
                  <p className="text-xs text-muted-foreground italic">
                    No goals on file for this session.
                  </p>
                ) : (
                  /* ── Single student: flat goal list ── */
                  <div className="space-y-3">
                    {matchedGoals.map((mg) => renderGoalCard(mg))}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          ACTION BAR
      ══════════════════════════════════════════════════════ */}
      {completed ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-100 shrink-0">
              <Check className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">Documentation complete</p>
              <p className="text-xs text-green-700">Note saved to this session.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={!noteDraft.trim()}
              onClick={async () => {
                if (!noteDraft.trim()) return;
                try {
                  await persistNote(noteDraft);
                  toast.success("Note saved");
                } catch {
                  toast.error("Failed to save");
                }
              }}
              className="text-xs border-green-300 text-green-800 hover:bg-green-100"
            >
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompleted(false)}
              className="text-xs border-green-300 text-green-800 hover:bg-green-100"
            >
              Mark Incomplete
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              {!allFieldsCaptured && (
                <p className="text-xs text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Missing fields: {missingLabels.join(", ")}
                </p>
              )}
              {noteStatus === "saving" && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </p>
              )}
              {noteStatus === "saved" && (
                <p className="text-xs text-green-600 flex items-center gap-1.5">
                  <Check className="h-3 w-3" /> Saved
                </p>
              )}
              {noteStatus === "idle" && hasUnsavedChanges && noteDraft && (
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <CircleDot className="h-3 w-3" /> Unsaved changes
                </p>
              )}
              {noteStatus === "idle" && !hasUnsavedChanges && allFieldsCaptured && noteDraft && (
                <p className="text-xs text-muted-foreground">Ready to complete documentation</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline" size="sm"
                disabled={completing || !noteDraft.trim()}
                onClick={async () => {
                  if (!noteDraft.trim()) return;
                  try {
                    await persistNote(noteDraft);
                    toast.success("Note saved");
                  } catch {
                    toast.error("Failed to save");
                  }
                }}
              >
                Save
              </Button>
              <Button
                size="sm"
                disabled={completing || !noteDraft.trim()}
                onClick={markComplete}
                className="gap-2"
              >
                {completing ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                ) : (
                  <><Check className="h-3.5 w-3.5" /> Mark Complete</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
