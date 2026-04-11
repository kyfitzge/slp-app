"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronRight,
  CircleDot, CircleCheck, CircleAlert, Ban,
  BarChart2, ClipboardList, FileBarChart2, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/utils/format-date";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Goal {
  id: string;
  shortName: string | null;
  domain: string;
}

interface SessionStudent {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    goals: Goal[];
  };
}

interface Note {
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

export interface SessionRow {
  id: string;
  sessionType: string;
  sessionDate: Date | string;
  startTime: string | null;
  durationMins: number | null;
  isCancelled: boolean;
  sessionStudents: SessionStudent[];
  notes: Note[];
  dataPoints: DataPoint[];
}

type DocStatus = "needs_note" | "in_progress" | "complete" | "cancelled";
type FilterTab = "all" | "needs_note" | "in_progress" | "complete";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDocStatus(session: SessionRow): DocStatus {
  if (session.isCancelled) return "cancelled";
  if (session.notes.length === 0) return "needs_note";
  const hasSubstantial = session.notes.some(
    (n) => n.isLocked || (n.noteText && n.noteText.trim().length >= 60)
  );
  return hasSubstantial ? "complete" : "in_progress";
}

function isOverdue(session: SessionRow, status: DocStatus): boolean {
  if (status !== "needs_note") return false;
  const date = new Date(session.sessionDate);
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  return date < twoDaysAgo;
}

function getDataSummary(dataPoints: DataPoint[]) {
  if (dataPoints.length === 0) return null;
  const uniqueGoals = new Set(dataPoints.map((dp) => dp.goalId)).size;
  const avgAccuracy =
    dataPoints.reduce((sum, dp) => sum + dp.accuracy, 0) / dataPoints.length;
  return { uniqueGoals, avgAccuracy: Math.round(avgAccuracy * 100) };
}

function getGoalPreviews(sessionStudents: SessionStudent[]): string[] {
  const labels: string[] = [];
  for (const ss of sessionStudents) {
    for (const g of ss.student.goals) {
      const label =
        g.shortName ||
        g.domain.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      if (!labels.includes(label)) labels.push(label);
      if (labels.length >= 4) break;
    }
    if (labels.length >= 4) break;
  }
  return labels;
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  GROUP: "Group",
  EVALUATION: "Eval",
  RE_EVALUATION: "Re-Eval",
  CONSULTATION: "Consult",
  PARENT_CONFERENCE: "Parent Conf.",
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function DocStatusBadge({
  status,
  overdue,
}: {
  status: DocStatus;
  overdue?: boolean;
}) {
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-400 border border-slate-200">
        <Ban className="h-3 w-3" />
        Cancelled
      </span>
    );
  }
  if (status === "needs_note") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border",
          overdue
            ? "bg-rose-50 text-rose-600 border-rose-200"
            : "bg-amber-50 text-amber-600 border-amber-200"
        )}
      >
        <CircleAlert className="h-3 w-3" />
        {overdue ? "Overdue" : "Needs Note"}
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-600 border border-sky-200">
        <CircleDot className="h-3 w-3" />
        In Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 border border-emerald-200">
      <CircleCheck className="h-3 w-3" />
      Complete
    </span>
  );
}

// ─── Single session row ───────────────────────────────────────────────────────

function SessionItem({ session }: { session: SessionRow }) {
  const status = getDocStatus(session);
  const overdue = isOverdue(session, status);
  const dataSummary = getDataSummary(session.dataPoints);
  const goalPreviews = getGoalPreviews(session.sessionStudents);
  const studentNames = session.sessionStudents
    .map((ss) => `${ss.student.firstName} ${ss.student.lastName}`)
    .join(", ");
  const typeLabel =
    SESSION_TYPE_LABELS[session.sessionType] ??
    session.sessionType.replace(/_/g, " ");

  return (
    <div
      className={cn(
        "group flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5 border-b last:border-0 transition-colors",
        "hover:bg-muted/40",
        overdue && "bg-rose-50/30 hover:bg-rose-50/50"
      )}
    >
      {/* Status — leftmost, most prominent on mobile */}
      <div className="shrink-0 w-28 hidden sm:block">
        <DocStatusBadge status={status} overdue={overdue} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Mobile status */}
        <div className="flex items-center gap-2 sm:hidden mb-1">
          <DocStatusBadge status={status} overdue={overdue} />
        </div>

        {/* Student names + type */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">
            {studentNames}
          </span>
          <Badge variant="secondary" className="text-xs shrink-0">
            {typeLabel}
          </Badge>
          {session.durationMins && (
            <span className="text-xs text-muted-foreground shrink-0">
              {session.durationMins} min
            </span>
          )}
        </div>

        {/* Date + goals preview + data */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {formatDate(new Date(session.sessionDate))}
            {session.startTime && ` · ${formatTime(session.startTime)}`}
          </span>

          {goalPreviews.length > 0 && (
            <span className="text-xs text-muted-foreground/80">
              {goalPreviews.join(" · ")}
            </span>
          )}

          {dataSummary ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <BarChart2 className="h-3 w-3" />
              {dataSummary.uniqueGoals} goal{dataSummary.uniqueGoals !== 1 ? "s" : ""} tracked
              {" · "}avg {dataSummary.avgAccuracy}%
            </span>
          ) : null}
        </div>

        {/* Note preview */}
        {status === "in_progress" && session.notes[0]?.noteText && (
          <p className="text-xs text-muted-foreground line-clamp-1 italic">
            &ldquo;{session.notes[0].noteText.trim()}&rdquo;
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs">
          <Link href={`/sessions/${session.id}`}>
            View
            <ChevronRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Main list component ──────────────────────────────────────────────────────

interface SessionsListProps {
  sessions: SessionRow[];
}

export function SessionsList({ sessions }: SessionsListProps) {
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [filter, setFilter] = useState<FilterTab>("all");

  // Derive unique students from sessions
  const uniqueStudents = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) {
      for (const ss of s.sessionStudents) {
        if (!map.has(ss.student.id)) {
          map.set(ss.student.id, `${ss.student.firstName} ${ss.student.lastName}`);
        }
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  const enriched = useMemo(
    () => sessions.map((s) => ({ ...s, _status: getDocStatus(s) })),
    [sessions]
  );

  const counts = useMemo(
    () => ({
      all: enriched.filter(
        (s) => studentFilter === "all" || s.sessionStudents.some((ss) => ss.student.id === studentFilter)
      ).length,
      needs_note: enriched.filter(
        (s) =>
          s._status === "needs_note" &&
          (studentFilter === "all" || s.sessionStudents.some((ss) => ss.student.id === studentFilter))
      ).length,
      in_progress: enriched.filter(
        (s) =>
          s._status === "in_progress" &&
          (studentFilter === "all" || s.sessionStudents.some((ss) => ss.student.id === studentFilter))
      ).length,
      complete: enriched.filter(
        (s) =>
          (s._status === "complete" || s._status === "cancelled") &&
          (studentFilter === "all" || s.sessionStudents.some((ss) => ss.student.id === studentFilter))
      ).length,
    }),
    [enriched, studentFilter]
  );

  const filtered = useMemo(() => {
    return enriched.filter((s) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "needs_note" && s._status === "needs_note") ||
        (filter === "in_progress" && s._status === "in_progress") ||
        (filter === "complete" &&
          (s._status === "complete" || s._status === "cancelled"));

      const matchesStudent =
        studentFilter === "all" ||
        s.sessionStudents.some((ss) => ss.student.id === studentFilter);

      return matchesFilter && matchesStudent;
    });
  }, [enriched, filter, studentFilter]);

  const tabs: { key: FilterTab; label: string; urgent?: boolean }[] = [
    { key: "all", label: "All" },
    { key: "needs_note", label: "Needs Note", urgent: counts.needs_note > 0 },
    { key: "in_progress", label: "In Progress" },
    { key: "complete", label: "Complete" },
  ];

  // Link for report — pre-populate student if one is selected
  const reportHref =
    studentFilter !== "all"
      ? `/sessions/report?studentId=${studentFilter}`
      : "/sessions/report";

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Student filter */}
        <div className="flex items-center gap-1.5 min-w-[180px]">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select value={studentFilter} onValueChange={setStudentFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All students" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All students</SelectItem>
              {uniqueStudents.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1.5 flex-wrap flex-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                filter === tab.key
                  ? tab.urgent
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-primary text-primary-foreground border-primary"
                  : tab.urgent
                  ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                  : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              )}
            >
              {tab.label}
              <span className="ml-1.5 tabular-nums opacity-70">
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Report link */}
        <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Link href={reportHref}>
            <FileBarChart2 className="h-3.5 w-3.5" />
            Session Report
          </Link>
        </Button>
      </div>

      {/* Needs-note callout banner */}
      {counts.needs_note > 0 && filter === "all" && (
        <button
          onClick={() => setFilter("needs_note")}
          className="w-full flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-left hover:bg-amber-50 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-amber-700">
            <CircleAlert className="h-4 w-4" />
            {counts.needs_note} session{counts.needs_note !== 1 ? "s" : ""} still need documentation
          </span>
          <span className="text-xs text-amber-600 font-medium">View →</span>
        </button>
      )}

      {/* Session list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card py-12 text-center">
          <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            No sessions in this category.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Column headers — desktop only */}
          <div className="hidden sm:grid grid-cols-[7rem_1fr_auto] px-4 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
            <span>Status</span>
            <span>Session</span>
            <span className="pr-1">Action</span>
          </div>

          {filtered.map((s) => (
            <SessionItem key={s.id} session={s} />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {filtered.length} of {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
