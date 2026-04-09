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

  const trialMatch = text.match(/(\d+)\s*(?:\/|out\s+of)\s*(\d+)/i);
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
  const keywords = [...name.split(/\s+/).filter((w) => w.length > 3), domain];
  // Split on sentence boundaries
  const sentences = transcript.split(/(?<=[.!?])\s+/);
  const relevant = sentences.filter((s) =>
    keywords.some((kw) => s.toLowerCase().includes(kw))
  );
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
    const words = name.split(/\s+/).filter((w) => w.length > 3);
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
}: {
  sessionId: string;
  hasExistingContent: boolean;
  onTranscript: (text: string, mode: TranscriptMode) => void;
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

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Voice recording
        </p>
        {state === "done" && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            <Check className="h-3 w-3" /> Processed
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* IDLE / ERROR — show record button; if content already exists show both options */}
        {(state === "idle" || state === "error") && (
          <>
            <Button
              type="button"
              size="sm"
              variant={hasExistingContent ? "outline" : "default"}
              onClick={() => startRecording("replace")}
              className="gap-2"
            >
              <Mic className="h-4 w-4" />
              {hasExistingContent ? "Re-record" : "Record summary"}
            </Button>
            {hasExistingContent && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => startRecording("append")}
                className="gap-2 text-primary border-primary/40 hover:bg-primary/5"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Add more information
              </Button>
            )}
          </>
        )}

        {/* ACTIVE RECORDING — stop button */}
        {isRecordingAny && (
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
        )}

        {/* PROCESSING */}
        {state === "processing" && (
          <Button type="button" size="sm" variant="outline" disabled className="gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing…
          </Button>
        )}

        {/* DONE — re-record + add more (always shown after a successful recording) */}
        {state === "done" && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => startRecording("replace")}
              className="gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Re-record
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => startRecording("append")}
              className="gap-2 text-primary border-primary/40 hover:bg-primary/5"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Add more information
            </Button>
          </>
        )}
      </div>

      {/* Context labels */}
      <p className="text-xs text-muted-foreground">
        {state === "idle" && !hasExistingContent &&
          "Record a spoken recap — your note and plan will be generated automatically."}
        {state === "idle" && hasExistingContent &&
          "Re-record to replace the current note, or add more information to expand it."}
        {state === "recording" &&
          "Speak your session recap, accuracy data, and next-session plan…"}
        {state === "appending" &&
          "Recording additional context — it will be merged with your previous recording."}
        {state === "processing" && "Transcribing and generating your note…"}
        {state === "done" && hasExistingContent &&
          "Note generated. Re-record to start over, or add more detail."}
        {state === "done" && !hasExistingContent &&
          "Note generated from your recording."}
        {state === "error" && (
          <span className="text-destructive">{errorMsg}</span>
        )}
      </p>
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
          <span className="text-sm font-medium text-foreground break-words">{value}</span>
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
              <span className="text-sm font-medium text-foreground">{displayValue ?? rawValue}</span>
            )}
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/edit:opacity-60 transition-opacity shrink-0" />
          </button>
        )}
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

  const extracted = useMemo<ExtractedData>(
    () => extractFromText(summaryContext),
    [summaryContext]
  );

  // ── All goals across every student in this session ───────────────────────
  const allGoals = useMemo(
    () => students.flatMap((s) => s.goals),
    [students]
  );

  /**
   * Goals matched from the voice transcript, each enriched with per-goal
   * extracted data and any previously saved DB data point.
   * Before any recording, falls back to goals that already have saved data.
   */
  const matchedGoals = useMemo<MatchedGoalData[]>(() => {
    const goals = summaryContext.trim()
      ? matchGoalsFromTranscript(summaryContext, allGoals)
      : allGoals.filter((g) => !!initialGoalData[g.id]);

    return goals.map((goal) => ({
      goal,
      extracted: extractDataForGoal(summaryContext, goal),
      saved: initialGoalData[goal.id],
    }));
  }, [summaryContext, allGoals, initialGoalData]);

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

  // Re-run extraction when the page loads with a saved summary context
  useEffect(() => {
    if (initialSummaryContext.trim()) {
      extractStructuredData(initialSummaryContext);
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

  // ── Note draft ───────────────────────────────────────────────────────────────
  const [noteDraft, setNoteDraft] = useState(initialNote);
  const [generating, setGenerating] = useState(false);
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [generatedAt, setGeneratedAt] = useState<Date | null>(
    initialNote ? new Date() : null
  );
  const noteDebouncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setGeneratedAt(new Date());
      await persistNote(draft);
      toast.success("Note generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate note");
    } finally {
      setGenerating(false);
    }
  }

  /** Persist the note draft to the DB (debounce-safe). */
  async function persistNote(note: string) {
    if (!note.trim()) return;
    setNoteStatus("saving");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteText: note }),
      });
      if (!res.ok) throw new Error();
      setNoteStatus("saved");
      setTimeout(() => setNoteStatus("idle"), 2500);
    } catch {
      setNoteStatus("idle");
    }
  }

  function handleNoteChange(text: string) {
    setNoteDraft(text);
    setNoteStatus("idle");
    if (noteDebouncRef.current) clearTimeout(noteDebouncRef.current);
    noteDebouncRef.current = setTimeout(() => persistNote(text), 1500);
  }

  // ── Voice handler — receives transcript, updates context, auto-generates ────
  async function handleVoiceTranscript(text: string, mode: TranscriptMode) {
    const newContext = mode === "append"
      ? (summaryContext ? `${summaryContext} ${text}` : text)
      : text;

    setSummaryContext(newContext);

    // Run note generation and LLM structured extraction in parallel
    await Promise.all([
      generateNote(newContext),
      extractStructuredData(newContext),
    ]);
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
      const res = await fetch(`/api/sessions/${sessionId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteText: finalNote }),
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

  const missingLabels: string[] = [];
  if (!location) missingLabels.push("Setting");
  if (!durationMins && !extracted.durationMins) missingLabels.push("Duration");
  if (anyPresent && matchedGoals.length === 0) missingLabels.push("Goals");
  if (anyPresent && matchedGoals.length > 0 && !hasAnyGoalAccuracy) missingLabels.push("Accuracy");
  if (anyPresent && matchedGoals.length > 0 && !hasAnyGoalTrials) missingLabels.push("# of Trials");
  if (anyPresent && matchedGoals.length > 0 && !hasAnyGoalCueing) missingLabels.push("Level of Support");

  const allFieldsCaptured = missingLabels.length === 0;

  const effectiveDuration = durationMins ?? aiSessionData.duration ?? extracted.durationMins ?? null;

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
            {location && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {location}
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
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-5 items-start">

        {/* ── LEFT COLUMN ────────────────────────────────── */}
        <div className="space-y-4">

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
                  Record your session summary or click Generate to draft from goal data
                </p>
              </div>
              {generatedAt && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(generatedAt, "h:mm a")}
                </span>
              )}
            </div>

            <div className="p-5 space-y-4">
              {/* Voice recorder */}
              <VoiceCapture
                sessionId={sessionId}
                hasExistingContent={!!noteDraft.trim()}
                onTranscript={handleVoiceTranscript}
              />

              {/* Regenerate button — only shown once there is something to work with */}
              {(summaryContext.trim() || noteDraft.trim()) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={generating}
                    onClick={() => generateNote()}
                    className="gap-2"
                  >
                    {generating ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                    ) : (
                      <><RefreshCw className="h-3.5 w-3.5" /> Regenerate</>
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Regenerate note from your recording
                  </span>
                </div>
              )}

              {/* Note textarea */}
              <div className="space-y-1.5">
                <Textarea
                  value={noteDraft}
                  onChange={(e) => handleNoteChange(e.target.value)}
                  placeholder={
                    generating
                      ? "Generating note draft…"
                      : "Record your session above, or click Generate to draft from goal data."
                  }
                  rows={10}
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
              </div>

              {noteDraft && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground/70 border-t pt-3">
                  <span>{noteDraft.trim().split(/\s+/).filter(Boolean).length} words</span>
                  {noteDraft.trim().length < 30 && (
                    <span className="text-amber-600">Note is very short</span>
                  )}
                </div>
              )}
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
                Extracted from your recording and session data
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
                  <FieldRow icon={Clock} label="Duration"
                    value={effectiveDuration ? `${effectiveDuration} min` : null}
                    missing={!effectiveDuration}
                  />
                  <FieldRow icon={MapPin} label="Setting" value={location ?? null} missing={!location} />
                  <FieldRow icon={Info} label="Type"
                    value={SESSION_TYPE_LABELS[sessionType] ?? sessionType.replace(/_/g, " ")}
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

              {/* B. Clinical Data — one sub-section per matched goal */}
              {anyPresent && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    B. Clinical Data
                  </p>

                  {matchedGoals.length === 0 ? (
                    /* ── No goals detected yet ── */
                    <div className="space-y-2">
                      <div className="rounded-lg border divide-y">
                        <FieldRow icon={Target} label="Goals Targeted" value={null} missing />
                        <FieldRow label="Accuracy" value={null} missing />
                        <FieldRow label="Number of Trials" value={null} missing />
                        <FieldRow label="Level of Support" value={null} missing />
                      </div>
                      <p className="text-xs text-muted-foreground italic mt-1">
                        Goals will be detected automatically when you record your session summary.
                      </p>
                    </div>
                  ) : (
                    /* ── One editable card per matched goal ── */
                    <div className="space-y-3">
                      {matchedGoals.map((mg) => {
                        const aiExt  = aiExtractions[mg.goal.id];
                        const ovride = goalOverrides[mg.goal.id];
                        const acc    = goalEffectiveAccuracy(mg, aiExt, ovride);
                        const trials = goalEffectiveTrials(mg,   aiExt, ovride);
                        const cueing = goalEffectiveCueing(mg,   aiExt, ovride);
                        const goalLabel = mg.goal.shortName ?? mg.goal.goalText.slice(0, 50);

                        // Raw strings for the inputs
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
                      })}

                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          ACTION BAR
      ══════════════════════════════════════════════════════ */}
      {completed ? (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-100 shrink-0">
            <Check className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800">Documentation complete</p>
            <p className="text-xs text-green-700">Note saved to this session.</p>
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
                  <Loader2 className="h-3 w-3 animate-spin" /> Auto-saving…
                </p>
              )}
              {noteStatus === "saved" && (
                <p className="text-xs text-green-600 flex items-center gap-1.5">
                  <Check className="h-3 w-3" /> Draft saved
                </p>
              )}
              {noteStatus === "idle" && allFieldsCaptured && noteDraft && (
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
                    toast.success("Progress saved");
                  } catch {
                    toast.error("Failed to save");
                  }
                }}
              >
                Save Progress
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
