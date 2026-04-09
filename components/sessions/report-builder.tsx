"use client";

import { useState, useCallback } from "react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import {
  FileDown, Loader2, CalendarRange, AlertCircle,
  Target, CheckCircle2, User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportStudent {
  id: string;
  firstName: string;
  lastName: string;
}

interface GoalDataPoint {
  id: string;
  accuracy: number;
  collectedAt: string;
  sessionId: string | null;
  cueingLevel: string | null;
  trialsCorrect: number | null;
  trialsTotal: number | null;
}

interface Goal {
  id: string;
  shortName: string | null;
  goalText: string;
  domain: string;
  status: string;
  targetAccuracy: number;
  baselineScore: number | null;
  baselineDate: string | null;
  masteryDate: string | null;
  dataPoints: GoalDataPoint[];
}

interface SessionNote {
  id: string;
  noteText: string;
  isLocked: boolean;
  isAiGenerated: boolean;
  createdAt: string;
}

interface SessionDataPoint {
  id: string;
  accuracy: number;
  goalId: string;
  cueingLevel: string | null;
  trialsCorrect: number | null;
  trialsTotal: number | null;
  goal: {
    shortName: string | null;
    goalText: string;
    domain: string;
    targetAccuracy: number;
  };
}

interface Session {
  id: string;
  sessionDate: string;
  sessionType: string;
  durationMins: number | null;
  isCancelled: boolean;
  sessionStudents: Array<{ attendance: string; attendanceNote: string | null }>;
  notes: SessionNote[];
  dataPoints: SessionDataPoint[];
}

export interface ReportData {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gradeLevel: string;
    schoolName: string;
    goals: Goal[];
  };
  sessions: Session[];
  period: { start: string; end: string };
  summary: {
    totalSessions: number;
    attendedSessions: number;
    cancelledSessions: number;
    goalsTracked: number;
    avgAccuracy: number | null;
    sessionsNeedingNotes: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  ARTICULATION: "Articulation",
  PHONOLOGY: "Phonology",
  LANGUAGE_EXPRESSION: "Language (Expressive)",
  LANGUAGE_COMPREHENSION: "Language (Receptive)",
  FLUENCY: "Fluency",
  VOICE: "Voice",
  PRAGMATICS: "Pragmatics",
  AUGMENTATIVE_COMMUNICATION: "AAC",
  LITERACY: "Literacy",
  SOCIAL_COMMUNICATION: "Social Communication",
};

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "Present",
  ABSENT_EXCUSED: "Absent (Excused)",
  ABSENT_UNEXCUSED: "Absent (Unexcused)",
  CANCELLED_SLP: "Cancelled (SLP)",
  CANCELLED_SCHOOL: "Cancelled (School)",
  MAKEUP: "Make-up",
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  GROUP: "Group",
  EVALUATION: "Evaluation",
  RE_EVALUATION: "Re-Evaluation",
  CONSULTATION: "Consultation",
  PARENT_CONFERENCE: "Parent Conf.",
};

const CUEING_LABELS: Record<string, string> = {
  INDEPENDENT: "Independent",
  GESTURAL: "Gestural cues",
  INDIRECT_VERBAL: "Indirect verbal",
  DIRECT_VERBAL: "Direct verbal",
  MODELING: "Modeling",
  PHYSICAL: "Physical assist",
  MAXIMUM_ASSISTANCE: "Max. assistance",
};

const PRESETS = [
  {
    label: "This month",
    start: () => format(startOfMonth(new Date()), "yyyy-MM-dd"),
    end: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "Last month",
    start: () => format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
    end: () => format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
  },
  {
    label: "Last 3 months",
    start: () => format(subMonths(new Date(), 3), "yyyy-MM-dd"),
    end: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "Last 6 months",
    start: () => format(subMonths(new Date(), 6), "yyyy-MM-dd"),
    end: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "This school year",
    start: () => {
      const now = new Date();
      const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
      return `${year}-09-01`;
    },
    end: () => format(new Date(), "yyyy-MM-dd"),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtShort(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Session entry card ───────────────────────────────────────────────────────

function SessionEntry({
  session,
  index,
  total,
}: {
  session: Session;
  index: number;
  total: number;
}) {
  const att = session.sessionStudents[0]?.attendance ?? "";
  const attLabel = ATTENDANCE_LABELS[att] ?? att;
  const typeLabel = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType;
  const noteText = session.notes[0]?.noteText ?? "";
  const isLocked = session.notes[0]?.isLocked ?? false;

  // Deduplicate data points by goalId (keep highest accuracy if duplicates)
  const goalMap = new Map<string, SessionDataPoint>();
  for (const dp of session.dataPoints) {
    const existing = goalMap.get(dp.goalId);
    if (!existing || dp.accuracy > existing.accuracy) {
      goalMap.set(dp.goalId, dp);
    }
  }
  const goalEntries = Array.from(goalMap.values());

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Session header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/25 border-b">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Session {index + 1} of {total}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {fmtShort(session.sessionDate)}
          </span>
          <span className="text-xs text-muted-foreground">
            {typeLabel}
            {session.durationMins ? ` · ${session.durationMins} min` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {session.isCancelled ? (
            <span className="text-xs text-muted-foreground">Cancelled</span>
          ) : (
            <span
              className={cn(
                "text-xs font-medium",
                att === "PRESENT"
                  ? "text-emerald-600"
                  : att === "ABSENT_UNEXCUSED"
                  ? "text-rose-600"
                  : "text-amber-600"
              )}
            >
              {attLabel}
            </span>
          )}
          {isLocked && (
            <span className="text-[10px] border border-muted-foreground/20 rounded px-1.5 py-0.5 text-muted-foreground">
              Locked
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Session note */}
        {noteText ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
              Session Note
            </p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {noteText}
            </p>
          </div>
        ) : !session.isCancelled ? (
          <p className="text-sm text-muted-foreground italic">No session note recorded.</p>
        ) : null}

        {/* Goal performance */}
        {goalEntries.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Goal Performance
            </p>
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[1fr_60px_80px_120px] px-3 py-1.5 bg-muted/30 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Goal</span>
                <span className="text-right">Accuracy</span>
                <span className="text-right">Trials</span>
                <span className="pl-4">Cueing</span>
              </div>
              {goalEntries.map((dp, i) => {
                const atTarget = dp.accuracy >= dp.goal.targetAccuracy;
                return (
                  <div
                    key={dp.id}
                    className={cn(
                      "grid grid-cols-[1fr_60px_80px_120px] px-3 py-2.5 text-sm border-b last:border-0 items-center",
                      i % 2 === 1 && "bg-muted/10"
                    )}
                  >
                    <div className="min-w-0 pr-3">
                      <span className="font-medium text-foreground truncate block">
                        {dp.goal.shortName || DOMAIN_LABELS[dp.goal.domain] || dp.goal.domain}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Target: {Math.round(dp.goal.targetAccuracy * 100)}%
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums text-right",
                        atTarget ? "text-emerald-600" : "text-foreground"
                      )}
                    >
                      {Math.round(dp.accuracy * 100)}%
                    </span>
                    <span className="text-xs text-muted-foreground text-right tabular-nums">
                      {dp.trialsCorrect != null && dp.trialsTotal != null
                        ? `${dp.trialsCorrect}/${dp.trialsTotal}`
                        : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground pl-4">
                      {dp.cueingLevel ? (CUEING_LABELS[dp.cueingLevel] ?? dp.cueingLevel) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!session.isCancelled && goalEntries.length === 0 && !noteText && (
          <p className="text-sm text-muted-foreground italic">No data recorded for this session.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ReportBuilderProps {
  students: ReportStudent[];
}

export function ReportBuilder({ students }: ReportBuilderProps) {
  const [studentId, setStudentId] = useState<string>(
    students.length === 1 ? students[0].id : ""
  );
  const [startDate, setStartDate] = useState(
    format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!studentId || !startDate || !endDate) return;
    setLoading(true);
    setError(null);
    setReportData(null);
    try {
      const res = await fetch(
        `/api/sessions/report?studentId=${studentId}&startDate=${startDate}&endDate=${endDate}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load report data");
      setReportData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const handleDownloadPDF = useCallback(async () => {
    if (!reportData) return;
    setGenerating(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { SessionReportPDF: PdfDoc } = await import("./session-report-pdf");
      const blob = await pdf(<PdfDoc data={reportData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const name = `${reportData.student.firstName}-${reportData.student.lastName}`.toLowerCase();
      a.href = url;
      a.download = `session-notes-log-${name}-${startDate}-to-${endDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF generation failed:", e);
    } finally {
      setGenerating(false);
    }
  }, [reportData, startDate, endDate]);

  const sessions = reportData?.sessions ?? [];
  const goals = reportData?.student?.goals ?? [];
  const summary = reportData?.summary;

  // Sort sessions chronologically (oldest first for a log)
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime()
  );

  return (
    <div className="space-y-6">
      {/* ── Configure ── */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/8 text-primary">
              <CalendarRange className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-sm font-semibold">Configure Report</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <Label className="mb-1.5 block text-xs">Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a student…" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="start" className="mb-1.5 block text-xs">Start date</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label htmlFor="end" className="mb-1.5 block text-xs">End date</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setStartDate(p.start()); setEndDate(p.end()); }}
                className="px-2.5 py-1 rounded-full text-xs border bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!studentId || !startDate || !endDate || loading}
            className="gap-1.5"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loading ? "Loading…" : "Generate Report"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Report Preview ── */}
      {reportData && (
        <div className="space-y-5">

          {/* ── Report header ── */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    {reportData.student.firstName} {reportData.student.lastName}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {fmtDate(reportData.period.start)} – {fmtDate(reportData.period.end)}
                    {" · "}{reportData.student.schoolName}
                  </p>
                  {summary && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {summary.totalSessions} session{summary.totalSessions !== 1 ? "s" : ""}
                      {" · "}
                      {summary.attendedSessions} attended
                      {summary.cancelledSessions > 0 &&
                        ` · ${summary.cancelledSessions} cancelled`}
                    </p>
                  )}
                </div>
                <Button
                  onClick={handleDownloadPDF}
                  disabled={generating}
                  variant="outline"
                  className="gap-1.5 shrink-0"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  {generating ? "Building PDF…" : "Download PDF"}
                </Button>
              </div>

              {/* IEP Goals summary */}
              {goals.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    IEP Goals ({goals.length})
                  </p>
                  <div className="space-y-3">
                    {goals.map((goal) => {
                      const pts = goal.dataPoints;
                      const latest = pts.length > 0 ? pts[pts.length - 1].accuracy : null;
                      const atTarget = latest != null && latest >= goal.targetAccuracy;
                      return (
                        <div
                          key={goal.id}
                          className={cn(
                            "rounded-lg border px-3.5 py-3",
                            atTarget
                              ? "border-emerald-200 bg-emerald-50/30"
                              : "border-border bg-muted/20"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-foreground">
                                {goal.shortName ||
                                  DOMAIN_LABELS[goal.domain] ||
                                  goal.domain}
                              </span>
                              <span className="text-[11px] bg-primary/8 text-primary border border-primary/15 rounded-full px-2 py-0.5">
                                {DOMAIN_LABELS[goal.domain] ?? goal.domain}
                              </span>
                              {goal.status === "MASTERED" && (
                                <span className="text-[11px] flex items-center gap-1 text-emerald-600">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Mastered
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Target className="h-3 w-3" />
                                Target: {Math.round(goal.targetAccuracy * 100)}%
                              </span>
                              {latest != null && (
                                <span
                                  className={cn(
                                    "font-semibold",
                                    atTarget ? "text-emerald-600" : "text-foreground"
                                  )}
                                >
                                  Latest: {Math.round(latest * 100)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {goal.goalText}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {goals.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No active IEP goals found for this student.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Session log ── */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-muted-foreground uppercase tracking-wide text-[11px]">
              Session Notes Log — {sortedSessions.length} session{sortedSessions.length !== 1 ? "s" : ""}
            </h3>

            {sortedSessions.length === 0 ? (
              <div className="rounded-xl border bg-card py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No sessions found in this period.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedSessions.map((session, i) => (
                  <SessionEntry
                    key={session.id}
                    session={session}
                    index={i}
                    total={sortedSessions.length}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Bottom download */}
          {sortedSessions.length > 0 && (
            <div className="flex justify-end pt-1 pb-6">
              <Button
                onClick={handleDownloadPDF}
                disabled={generating}
                className="gap-1.5"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="h-3.5 w-3.5" />
                )}
                {generating ? "Building PDF…" : "Download PDF Report"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
