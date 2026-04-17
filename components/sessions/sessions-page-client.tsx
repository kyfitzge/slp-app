"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/utils/format-date";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CaseloadSidePanel, type CaseloadStudent } from "@/components/shared/caseload-side-panel";
import {
  ClipboardList,
  Plus,
  ChevronRight,
  CircleDot,
  CircleCheck,
  CircleAlert,
  Ban,
  BarChart2,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SessionNote {
  id: string;
  noteText: string;
  isLocked: boolean;
  isAiGenerated: boolean;
}

interface DataPoint {
  id: string;
  accuracy: number;
  goalId: string;
  goal: { shortName: string | null; domain: string };
}

interface SessionStudent {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    goals: { id: string; shortName: string | null; domain: string }[];
  };
}

export interface SessionRow {
  id: string;
  sessionType: string;
  sessionDate: Date | string;
  startTime: string | null;
  durationMins: number | null;
  isCancelled: boolean;
  sessionStudents: SessionStudent[];
  notes: SessionNote[];
  dataPoints: DataPoint[];
}

type DocStatus = "needs_note" | "in_progress" | "complete" | "cancelled";
type StatusFilter = "all" | "needs_note" | "in_progress" | "complete";

interface Props {
  sessions: SessionRow[];
  students: CaseloadStudent[];
  needsNoteCount: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDocStatus(session: SessionRow): DocStatus {
  if (session.isCancelled) return "cancelled";
  if (session.notes.length === 0) return "needs_note";

  const isGroup = session.sessionStudents.length > 1;
  const substantialNotes = session.notes.filter(
    (n) => n.isLocked || (n.noteText && n.noteText.trim().length >= 60)
  );

  if (isGroup) {
    // Complete only when every student in the group has a substantial note
    const studentCount = session.sessionStudents.length;
    if (substantialNotes.length === 0) return "needs_note";
    if (substantialNotes.length < studentCount) return "in_progress";
    return "complete";
  }

  return substantialNotes.length > 0 ? "complete" : "in_progress";
}

function isOverdue(session: SessionRow, status: DocStatus): boolean {
  if (status !== "needs_note") return false;
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  return new Date(session.sessionDate) < twoDaysAgo;
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  GROUP: "Group",
  EVALUATION: "Eval",
  RE_EVALUATION: "Re-Eval",
  CONSULTATION: "Consult",
  PARENT_CONFERENCE: "Parent Conf.",
};

// ─── Status badge ───────────────────────────────────────────────────────────────

function DocStatusBadge({ status, overdue }: { status: DocStatus; overdue?: boolean }) {
  if (status === "cancelled")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-400 border border-slate-200">
        <Ban className="h-3 w-3" /> Cancelled
      </span>
    );
  if (status === "needs_note")
    return (
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border",
        overdue ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-amber-50 text-amber-600 border-amber-200"
      )}>
        <CircleAlert className="h-3 w-3" />
        {overdue ? "Overdue" : "Needs Note"}
      </span>
    );
  if (status === "in_progress")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-600 border border-sky-200">
        <CircleDot className="h-3 w-3" /> In Progress
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 border border-emerald-200">
      <CircleCheck className="h-3 w-3" /> Complete
    </span>
  );
}

// ─── Session row ────────────────────────────────────────────────────────────────

function SessionItem({ session }: { session: SessionRow }) {
  const status = getDocStatus(session);
  const overdue = isOverdue(session, status);

  const studentNames = session.sessionStudents
    .map((ss) => `${ss.student.firstName} ${ss.student.lastName}`)
    .join(", ");

  const typeLabel = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType.replace(/_/g, " ");

  const avgAccuracy =
    session.dataPoints.length > 0
      ? Math.round(
          (session.dataPoints.reduce((s, dp) => s + dp.accuracy, 0) / session.dataPoints.length) * 100
        )
      : null;
  const uniqueGoals = new Set(session.dataPoints.map((dp) => dp.goalId)).size;

  return (
    <Link
      href={`/sessions/${session.id}`}
      className={cn(
        "group flex items-center gap-3 px-4 py-3.5 border-b last:border-0 transition-colors",
        "hover:bg-muted/40",
        overdue && "bg-rose-50/30 hover:bg-rose-50/50"
      )}
    >
      <div className="shrink-0 w-28 hidden sm:block">
        <DocStatusBadge status={status} overdue={overdue} />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="sm:hidden mb-1">
          <DocStatusBadge status={status} overdue={overdue} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{studentNames}</span>
          <Badge variant="secondary" className="text-xs shrink-0">{typeLabel}</Badge>
          {session.durationMins && (
            <span className="text-xs text-muted-foreground shrink-0">{session.durationMins} min</span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {formatDate(new Date(session.sessionDate))}
            {session.startTime && ` · ${formatTime(session.startTime)}`}
          </span>
          {avgAccuracy !== null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <BarChart2 className="h-3 w-3" />
              {uniqueGoals} goal{uniqueGoals !== 1 ? "s" : ""} · avg {avgAccuracy}%
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function SessionsPageClient({ sessions, students, needsNoteCount }: Props) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const enriched = useMemo(
    () => sessions.map((s) => ({ ...s, _status: getDocStatus(s) })),
    [sessions]
  );

  // Filter by selected student
  const studentFiltered = useMemo(() => {
    if (!selectedStudentId) return enriched;
    return enriched.filter((s) =>
      s.sessionStudents.some((ss) => ss.student.id === selectedStudentId)
    );
  }, [enriched, selectedStudentId]);

  // Status counts (based on student-filtered list)
  const counts = useMemo(
    () => ({
      all: studentFiltered.length,
      needs_note: studentFiltered.filter((s) => s._status === "needs_note").length,
      in_progress: studentFiltered.filter((s) => s._status === "in_progress").length,
      complete: studentFiltered.filter(
        (s) => s._status === "complete" || s._status === "cancelled"
      ).length,
    }),
    [studentFiltered]
  );

  // Final filtered list
  const displayed = useMemo(() => {
    return studentFiltered.filter((s) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "needs_note") return s._status === "needs_note";
      if (statusFilter === "in_progress") return s._status === "in_progress";
      if (statusFilter === "complete") return s._status === "complete" || s._status === "cancelled";
      return true;
    });
  }, [studentFiltered, statusFilter]);

  const statusTabs: { key: StatusFilter; label: string; urgent?: boolean }[] = [
    { key: "all", label: "All" },
    { key: "needs_note", label: "Needs Note", urgent: counts.needs_note > 0 },
    { key: "in_progress", label: "In Progress" },
    { key: "complete", label: "Complete" },
  ];

  // Per-student session count for caseload meta
  const sessionCountByStudent = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of enriched) {
      for (const ss of s.sessionStudents) {
        map[ss.student.id] = (map[ss.student.id] ?? 0) + 1;
      }
    }
    return map;
  }, [enriched]);

  return (
    <div className="flex flex-col h-full max-w-[1600px]">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Session Notes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {needsNoteCount > 0
              ? `${needsNoteCount} session${needsNoteCount !== 1 ? "s" : ""} need documentation`
              : `${sessions.length} session${sessions.length !== 1 ? "s" : ""} recorded`}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/sessions/new">
            <Plus className="h-4 w-4 mr-1.5" />
            New session
          </Link>
        </Button>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border bg-card">

        {/* ── LEFT: Caseload ── */}
        <aside className="w-64 shrink-0 flex flex-col border-r bg-sidebar overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-foreground">Caseload</span>
              <Badge variant="secondary" className="text-xs">{students.length}</Badge>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col px-2 py-2">
            <CaseloadSidePanel
              students={students}
              selectedId={selectedStudentId}
              onSelect={(id) => {
                setSelectedStudentId((prev) => (prev === id ? null : id));
                setStatusFilter("all");
              }}
            />
          </div>
        </aside>

        {/* ── RIGHT: Sessions list ── */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">
                {selectedStudentId
                  ? (() => {
                      const s = students.find((st) => st.id === selectedStudentId);
                      return s ? `${s.firstName} ${s.lastName}` : "Sessions";
                    })()
                  : "All Sessions"}
              </span>
              {selectedStudentId && (
                <button
                  onClick={() => setSelectedStudentId(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← All students
                </button>
              )}
            </div>
            {/* Status filter tabs */}
            <div className="flex gap-1.5 flex-wrap">
              {statusTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                    statusFilter === tab.key
                      ? tab.urgent
                        ? "bg-amber-600 text-white border-amber-600"
                        : "bg-primary text-primary-foreground border-primary"
                      : tab.urgent
                      ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                      : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  )}
                >
                  {tab.label}
                  <span className="ml-1.5 tabular-nums opacity-70">{counts[tab.key]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sessions list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <ClipboardList className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  {sessions.length === 0 ? "No sessions yet" : "No sessions in this category"}
                </p>
                {sessions.length === 0 && (
                  <p className="text-xs text-muted-foreground mb-4">
                    Record your first therapy session to get started.
                  </p>
                )}
                {sessions.length === 0 && (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/sessions/new">
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      New session
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="hidden sm:grid grid-cols-[7rem_1fr_auto] px-4 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                  <span>Status</span>
                  <span>Session</span>
                </div>
                {displayed.map((s) => (
                  <SessionItem key={s.id} session={s} />
                ))}
                <p className="text-xs text-muted-foreground text-right px-4 py-2">
                  {displayed.length} of {studentFiltered.length} session{studentFiltered.length !== 1 ? "s" : ""}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
