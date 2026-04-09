"use client";

/**
 * SessionDocumentationPanel
 *
 * Unified after-session documentation workflow:
 *   1. Attendance
 *   2. Goals & performance data (inline, no dialogs)
 *   3. Session summary (typed or voice-to-text)
 *   4. AI note generation + editable draft
 *   5. Next-session plan
 *   6. Save / complete
 */

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Check, Mic, Square, Loader2, Sparkles,
  RefreshCw, ChevronDown, ChevronUp, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { GoalDomainBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus =
  | "PRESENT" | "ABSENT_EXCUSED" | "ABSENT_UNEXCUSED"
  | "CANCELLED_SLP" | "CANCELLED_SCHOOL" | "MAKEUP";

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

interface GoalEntry {
  goalId: string;
  goalName: string;
  domain: string;
  selected: boolean;
  trialsCorrect: string;
  trialsTotal: string;
  accuracy: string;
  cueingLevel: string;
  saved: boolean;
  saving: boolean;
}

export interface SessionDocumentationPanelProps {
  sessionId: string;
  sessionDate: Date | string;
  sessionType: string;
  durationMins?: number | null;
  students: StudentData[];
  initialNote: string;
  initialGoalData: Record<string, { accuracy: number; trialsCorrect?: number; trialsTotal?: number; cueingLevel?: string }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT_EXCUSED", label: "Absent (E)" },
  { value: "ABSENT_UNEXCUSED", label: "Absent" },
  { value: "CANCELLED_SLP", label: "Cancelled" },
];

const CUEING_OPTIONS = [
  { value: "INDEPENDENT", label: "Indep." },
  { value: "INDIRECT_VERBAL", label: "Min. cues" },
  { value: "DIRECT_VERBAL", label: "Mod. cues" },
  { value: "MAXIMUM_ASSISTANCE", label: "Max support" },
];

const SESSION_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual", GROUP: "Group", EVALUATION: "Evaluation",
  RE_EVALUATION: "Re-Evaluation", CONSULTATION: "Consultation",
  PARENT_CONFERENCE: "Parent Conference",
};

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  step, title, complete, description,
}: {
  step: number; title: string; complete?: boolean; description?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className={cn(
        "flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold shrink-0 mt-0.5 border",
        complete
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-muted text-muted-foreground border-border"
      )}>
        {complete ? <Check className="h-3.5 w-3.5" /> : step}
      </div>
      <div>
        <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

// ─── Inline goal card ─────────────────────────────────────────────────────────

function GoalCard({
  entry, sessionId, sessionDate, onChange, onSave,
}: {
  entry: GoalEntry;
  sessionId: string;
  sessionDate: string;
  onChange: (patch: Partial<GoalEntry>) => void;
  onSave: () => void;
}) {
  const correct = parseInt(entry.trialsCorrect) || 0;
  const total = parseInt(entry.trialsTotal) || 0;
  const computedAccuracy = total > 0 ? Math.round((correct / total) * 100) : null;

  return (
    <div className={cn(
      "rounded-lg border transition-all",
      entry.selected
        ? "border-primary/40 bg-primary/5 shadow-sm"
        : "border-border bg-card hover:border-border/60"
    )}>
      {/* Goal header row */}
      <button
        type="button"
        onClick={() => onChange({ selected: !entry.selected })}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className={cn(
          "flex items-center justify-center h-5 w-5 rounded border shrink-0 transition-colors",
          entry.selected ? "bg-primary border-primary" : "bg-background border-border"
        )}>
          {entry.selected && <Check className="h-3 w-3 text-primary-foreground" />}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <GoalDomainBadge domain={entry.domain} />
          <span className="text-sm font-medium truncate">{entry.goalName}</span>
        </div>
        {entry.saved && (
          <span className="flex items-center gap-1 text-xs text-green-600 shrink-0">
            <Check className="h-3 w-3" />
            Saved
          </span>
        )}
        {entry.selected
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        }
      </button>

      {/* Inline data entry (when selected) */}
      {entry.selected && (
        <div className="px-3 pb-3 pt-1 border-t border-primary/10 space-y-3">
          {/* Trials + accuracy */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                value={entry.trialsCorrect}
                onChange={(e) => onChange({ trialsCorrect: e.target.value, saved: false })}
                onBlur={onSave}
                placeholder="0"
                className="w-14 h-8 text-center text-sm font-medium rounded-md border bg-background px-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label="Correct trials"
              />
              <span className="text-sm text-muted-foreground font-medium">/</span>
              <input
                type="number"
                min={1}
                value={entry.trialsTotal}
                onChange={(e) => onChange({ trialsTotal: e.target.value, saved: false })}
                onBlur={onSave}
                placeholder="10"
                className="w-14 h-8 text-center text-sm font-medium rounded-md border bg-background px-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label="Total trials"
              />
              <span className="text-sm text-muted-foreground">trials</span>
            </div>

            {computedAccuracy !== null ? (
              <div className="flex items-center gap-1 ml-1">
                <span className="text-sm font-semibold text-primary">= {computedAccuracy}%</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={entry.accuracy}
                  onChange={(e) => onChange({ accuracy: e.target.value, saved: false })}
                  onBlur={onSave}
                  placeholder="—"
                  className="w-16 h-8 text-center text-sm font-medium rounded-md border bg-background px-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label="Accuracy %"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            )}

            {entry.saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>

          {/* Cueing pills */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground self-center mr-1">Cues:</span>
            {CUEING_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange({ cueingLevel: opt.value, saved: false }); }}
                onMouseUp={onSave}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  entry.cueingLevel === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Voice recorder (minimal, embedded) ──────────────────────────────────────

function EmbeddedVoiceRecorder({
  sessionId,
  onTranscript,
}: {
  sessionId: string;
  onTranscript: (text: string) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState("transcribing");

    recorder.onstop = async () => {
      const mimeType = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const ext = mimeType.split("/")[1]?.split(";")[0] ?? "webm";

      try {
        const fd = new FormData();
        fd.append("audio", blob, `summary.${ext}`);
        fd.append("sessionId", sessionId);
        const res = await fetch("/api/voice-notes/transcribe", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Transcription failed");
        onTranscript(json.rawTranscript ?? "");
        setState("done");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Transcription failed");
        setState("error");
      }
    };
  }, [sessionId, onTranscript]);

  async function start() {
    setErrorMsg("");
    setElapsed(0);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
      const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(250);
      setState("recording");
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      setErrorMsg("Microphone access denied");
      setState("error");
    }
  }

  const mm = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const ss = (elapsed % 60).toString().padStart(2, "0");

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {state === "idle" || state === "done" || state === "error" ? (
        <Button type="button" size="sm" variant="outline" onClick={start} className="h-8 gap-1.5">
          <Mic className="h-3.5 w-3.5" />
          {state === "done" ? "Re-record" : "Speak summary"}
        </Button>
      ) : state === "recording" ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={stop}
          className="h-8 gap-1.5 animate-pulse"
        >
          <Square className="h-3 w-3 fill-current" />
          Stop — {mm}:{ss}
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled className="h-8 gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Transcribing…
        </Button>
      )}
      {state === "done" && (
        <span className="text-xs text-green-600 flex items-center gap-1">
          <Check className="h-3 w-3" />
          Transcribed
        </span>
      )}
      {errorMsg && <span className="text-xs text-destructive">{errorMsg}</span>}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function SessionDocumentationPanel({
  sessionId,
  sessionDate,
  sessionType,
  durationMins,
  students,
  initialNote,
  initialGoalData,
}: SessionDocumentationPanelProps) {
  const router = useRouter();

  // ── Attendance ───────────────────────────────────────────────────────────────
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(
    Object.fromEntries(students.map((s) => [s.id, s.attendance as AttendanceStatus]))
  );
  const [savingAttendance, setSavingAttendance] = useState(false);

  const isPresent = (id: string) =>
    attendance[id] === "PRESENT" || attendance[id] === "MAKEUP";
  const anyPresent = students.some((s) => isPresent(s.id));
  const attendanceComplete = students.every((s) => !!attendance[s.id]);

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

  // ── Goal entries ─────────────────────────────────────────────────────────────
  const [goalEntries, setGoalEntries] = useState<Record<string, GoalEntry>>(() => {
    const map: Record<string, GoalEntry> = {};
    for (const s of students) {
      for (const g of s.goals) {
        const existing = initialGoalData[g.id];
        map[g.id] = {
          goalId: g.id,
          goalName: g.shortName ?? g.goalText.slice(0, 60),
          domain: g.domain,
          selected: !!existing,
          trialsCorrect: existing?.trialsCorrect?.toString() ?? "",
          trialsTotal: existing?.trialsTotal?.toString() ?? "",
          accuracy: existing?.accuracy != null ? String(Math.round(existing.accuracy)) : "",
          cueingLevel: existing?.cueingLevel ?? "INDEPENDENT",
          saved: !!existing,
          saving: false,
        };
      }
    }
    return map;
  });

  const goalsComplete = Object.values(goalEntries).some((e) => e.saved && e.selected);

  function patchGoal(goalId: string, patch: Partial<GoalEntry>) {
    setGoalEntries((prev) => ({
      ...prev,
      [goalId]: { ...prev[goalId], ...patch },
    }));
  }

  async function saveGoal(goalId: string) {
    const entry = goalEntries[goalId];
    if (!entry.selected) return;

    const correct = parseInt(entry.trialsCorrect) || null;
    const total = parseInt(entry.trialsTotal) || null;
    let accuracy: number;

    if (correct !== null && total !== null && total > 0) {
      accuracy = Math.round((correct / total) * 100);
    } else if (entry.accuracy !== "") {
      accuracy = parseFloat(entry.accuracy);
    } else {
      return; // nothing to save yet
    }

    patchGoal(goalId, { saving: true });
    try {
      const res = await fetch(`/api/goals/${goalId}/data-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId,
          sessionId,
          accuracy,
          trialsCorrect: correct,
          trialsTotal: total,
          cueingLevel: entry.cueingLevel,
          collectedAt: format(new Date(sessionDate), "yyyy-MM-dd"),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      patchGoal(goalId, { saved: true, saving: false });
    } catch {
      patchGoal(goalId, { saving: false });
      toast.error("Failed to save goal data");
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const [summaryText, setSummaryText] = useState("");
  const summaryComplete = summaryText.trim().length > 10;

  // ── Note draft ───────────────────────────────────────────────────────────────
  const [noteDraft, setNoteDraft] = useState(initialNote);
  const [generating, setGenerating] = useState(false);
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved">("idle");
  const noteDebouncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteComplete = noteDraft.trim().length > 30;

  async function generateNote() {
    setGenerating(true);
    try {
      const selectedGoals = Object.values(goalEntries)
        .filter((e) => e.selected)
        .map((e) => {
          const correct = parseInt(e.trialsCorrect) || null;
          const total = parseInt(e.trialsTotal) || null;
          const accuracy =
            correct != null && total != null && total > 0
              ? (correct / total) * 100
              : e.accuracy !== "" ? parseFloat(e.accuracy) : null;
          return {
            name: e.goalName,
            accuracy,
            trialsCorrect: correct,
            trialsTotal: total,
            cueingLevel: e.cueingLevel,
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
          summaryText: summaryText.trim(),
          goals: selectedGoals,
          attendance: attendanceList,
          sessionDate: format(new Date(sessionDate), "MMM d, yyyy"),
          sessionType: SESSION_TYPE_LABELS[sessionType] ?? sessionType,
          durationMins,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      setNoteDraft(json.draftNote);
      toast.success("Note draft generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate note");
    } finally {
      setGenerating(false);
    }
  }

  function handleNoteChange(text: string) {
    setNoteDraft(text);
    setNoteStatus("idle");
    if (noteDebouncRef.current) clearTimeout(noteDebouncRef.current);
    noteDebouncRef.current = setTimeout(async () => {
      if (!text.trim()) return;
      setNoteStatus("saving");
      try {
        const res = await fetch(`/api/sessions/${sessionId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteText: text }),
        });
        if (!res.ok) throw new Error();
        setNoteStatus("saved");
        setTimeout(() => setNoteStatus("idle"), 2500);
      } catch {
        setNoteStatus("idle");
      }
    }, 1500);
  }

  // ── Next steps ───────────────────────────────────────────────────────────────
  const [nextSteps, setNextSteps] = useState("");

  // ── Complete ─────────────────────────────────────────────────────────────────
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);

  async function markComplete() {
    if (!noteDraft.trim()) {
      toast.error("Please add a session note before completing documentation.");
      return;
    }
    setCompleting(true);
    try {
      // Save the final note (including next steps if provided)
      const finalNote = nextSteps.trim()
        ? `${noteDraft.trim()}\n\nPlan: ${nextSteps.trim()}`
        : noteDraft.trim();

      const res = await fetch(`/api/sessions/${sessionId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteText: finalNote }),
      });
      if (!res.ok) throw new Error();
      setCompleted(true);
      toast.success("Documentation saved");
      router.refresh();
    } catch {
      toast.error("Failed to save — please try again");
    } finally {
      setCompleting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Section 1: Attendance ── */}
      <div className="rounded-lg border bg-card p-4">
        <SectionHeader
          step={1}
          title="Attendance"
          complete={attendanceComplete}
        />
        <div className="space-y-2">
          {students.map((s) => {
            const status = attendance[s.id];
            const present = isPresent(s.id);
            return (
              <div key={s.id} className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {s.firstName} {s.lastName}
                  </span>
                  {!present && status && (
                    <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {ATTENDANCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => saveAttendance(s.id, opt.value)}
                      disabled={savingAttendance}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                        status === opt.value
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
            );
          })}
        </div>
      </div>

      {/* ── Section 2: Goals (only if at least one student is present) ── */}
      {anyPresent && (
        <div className="rounded-lg border bg-card p-4">
          <SectionHeader
            step={2}
            title="Goals & Performance"
            complete={goalsComplete}
            description="Select goals worked on and enter trial data"
          />

          {students.filter((s) => isPresent(s.id)).map((s) => (
            <div key={s.id} className="mb-4 last:mb-0">
              {students.length > 1 && (
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {s.firstName} {s.lastName}
                </p>
              )}
              {s.goals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active goals assigned.</p>
              ) : (
                <div className="space-y-2">
                  {s.goals.map((g) => {
                    const entry = goalEntries[g.id];
                    if (!entry) return null;
                    return (
                      <GoalCard
                        key={g.id}
                        entry={entry}
                        sessionId={sessionId}
                        sessionDate={format(new Date(sessionDate), "yyyy-MM-dd")}
                        onChange={(patch) => patchGoal(g.id, patch)}
                        onSave={() => saveGoal(g.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Section 3: Session Summary ── */}
      {anyPresent && (
        <div className="rounded-lg border bg-card p-4">
          <SectionHeader
            step={3}
            title="Session Summary"
            complete={summaryComplete}
            description="Speak or type a short recap — used to generate your note"
          />

          <Textarea
            value={summaryText}
            onChange={(e) => setSummaryText(e.target.value)}
            placeholder="e.g. Worked on final consonant deletion in CVC words — about 8 out of 10 correct with minimal cues. Practiced carryover in short phrases. Good effort today."
            rows={3}
            className="resize-none mb-3 text-sm"
          />

          <EmbeddedVoiceRecorder
            sessionId={sessionId}
            onTranscript={(text) => setSummaryText((prev) => prev ? `${prev} ${text}` : text)}
          />

          <p className="text-xs text-muted-foreground mt-2">
            Speak a short recap after the session and it will fill in above automatically.
          </p>
        </div>
      )}

      {/* ── Absent-only: quick absence note ── */}
      {!anyPresent && (
        <div className="rounded-lg border bg-amber-50/60 border-amber-200 p-4">
          <p className="text-sm font-medium text-amber-700 mb-2">
            No students present
          </p>
          <p className="text-xs text-amber-600 mb-3">
            You can generate a brief absence/cancellation note for your records.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={generating}
            onClick={generateNote}
            className="border-amber-300 text-amber-700 hover:bg-amber-100"
          >
            {generating ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generating…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate absence note</>
            )}
          </Button>
        </div>
      )}

      {/* ── Section 4: Note Draft ── */}
      <div className="rounded-lg border bg-card p-4">
        <SectionHeader
          step={anyPresent ? 4 : 3}
          title="Session Note"
          complete={noteComplete}
          description="Review and edit before saving"
        />

        {/* Generate button */}
        <div className="flex items-center gap-2 mb-3">
          <Button
            size="sm"
            disabled={generating}
            onClick={generateNote}
            className="gap-1.5"
          >
            {generating ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" />Generate note</>
            )}
          </Button>
          {noteDraft && (
            <Button
              size="sm"
              variant="ghost"
              disabled={generating}
              onClick={generateNote}
              className="gap-1.5 text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            Uses your goal data + summary
          </span>
        </div>

        {/* Note textarea */}
        <Textarea
          value={noteDraft}
          onChange={(e) => handleNoteChange(e.target.value)}
          placeholder={
            generating
              ? "Generating your note draft…"
              : "Click 'Generate note' to create a draft, or write your note here…"
          }
          rows={6}
          className="resize-none text-sm"
          disabled={generating}
        />

        <div className="flex items-center justify-between mt-1.5">
          {noteDraft && !noteDraft.startsWith("Click") && (
            <p className="text-xs text-muted-foreground/70 italic">
              AI-generated draft — review before saving
            </p>
          )}
          <p className={cn(
            "text-xs ml-auto",
            noteStatus === "saved" ? "text-green-600" : "text-muted-foreground"
          )}>
            {noteStatus === "saving" && "Saving…"}
            {noteStatus === "saved" && "Draft saved ✓"}
          </p>
        </div>
      </div>

      {/* ── Section 5: Next session plan (optional) ── */}
      <div className="rounded-lg border bg-card p-4">
        <SectionHeader
          step={anyPresent ? 5 : 4}
          title="Plan for Next Session"
          description="Optional — will be appended to your note"
        />
        <Textarea
          value={nextSteps}
          onChange={(e) => setNextSteps(e.target.value)}
          placeholder="e.g. Continue /r/ in medial position; introduce 3-syllable words next week."
          rows={2}
          className="resize-none text-sm"
        />
      </div>

      {/* ── Complete action ── */}
      {completed ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <Check className="h-4 w-4 text-green-600" />
          <p className="text-sm font-medium text-green-700">Documentation saved</p>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            When you're done documenting, save progress to finalize this session.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={completing || !noteDraft.trim()}
              onClick={async () => {
                if (!noteDraft.trim()) return;
                setNoteStatus("saving");
                try {
                  await fetch(`/api/sessions/${sessionId}/notes`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ noteText: noteDraft }),
                  });
                  setNoteStatus("saved");
                  toast.success("Progress saved");
                  setTimeout(() => setNoteStatus("idle"), 2500);
                } catch {
                  toast.error("Failed to save");
                  setNoteStatus("idle");
                }
              }}
            >
              Save progress
            </Button>
            <Button
              size="sm"
              disabled={completing || !noteDraft.trim()}
              onClick={markComplete}
              className="gap-1.5"
            >
              {completing
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                : <><Check className="h-3.5 w-3.5" />Mark complete</>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
