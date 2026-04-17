"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CaseloadSidePanel, type CaseloadStudent } from "@/components/shared/caseload-side-panel";
import { formatDate, getUrgencyLevel } from "@/lib/utils/format-date";
import {
  Users,
  Plus,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Pencil,
  Target,
  Calendar,
  Phone,
  Mail,
  User,
  BookOpen,
  Activity,
  Loader2,
  FileText,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentListItem {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  schoolName: string;
  disabilityCategory: string;
  reevaluationDue: string | null;
  goals: { id: string }[];
  ieps: { id: string; status: string; reviewDate: string; studentId: string }[];
}

interface DataPoint {
  accuracy: number | null;
}

interface Goal {
  id: string;
  shortName: string | null;
  goalText: string;
  domain: string;
  status: string;
  targetAccuracy: number | null;
  dataPoints: DataPoint[];
}

interface IEP {
  id: string;
  status: string;
  effectiveDate: string;
  reviewDate: string;
  expirationDate: string;
  meetingDate?: string | null;
  nextEvalDate?: string | null;
  minutesPerWeek?: number | null;
  groupMinutes?: number | null;
  individualMinutes?: number | null;
  serviceLocation?: string | null;
  presentLevels?: string | null;
  parentConcerns?: string | null;
  transitionNotes?: string | null;
  goals: Goal[];
}

interface StudentDetail {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  gradeLevel: string;
  schoolName: string;
  schoolDistrict?: string | null;
  disabilityCategory: string;
  teacherName?: string | null;
  classroom?: string | null;
  primaryLanguage: string;
  secondaryLanguage?: string | null;
  reevaluationDue?: string | null;
  eligibilityDate?: string | null;
  parentGuardianName?: string | null;
  parentGuardianPhone?: string | null;
  parentGuardianEmail?: string | null;
  accommodations?: string | null;
  medicalAlerts?: string | null;
  externalProviders?: string | null;
  ieps: IEP[];
  goals: Goal[];
}

interface Props {
  students: StudentListItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGrade(g: string | null | undefined) {
  if (!g) return "";
  if (g === "KINDERGARTEN") return "Kindergarten";
  if (g === "PRE_K") return "Pre-K";
  return g.replace("GRADE_", "Grade ");
}

function formatDisability(d: string | null | undefined) {
  if (!d) return "";
  return d.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDomain(d: string) {
  return d.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const IEP_STATUS_STYLES: Record<string, string> = {
  ACTIVE:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  IN_REVIEW:    "bg-amber-50  text-amber-700  border-amber-200",
  DRAFT:        "bg-slate-50  text-slate-600  border-slate-200",
  EXPIRED:      "bg-rose-50   text-rose-700   border-rose-200",
  DISCONTINUED: "bg-slate-50  text-slate-400  border-slate-200",
};

const DOMAIN_COLORS: Record<string, string> = {
  ARTICULATION:              "bg-blue-50  text-blue-700",
  PHONOLOGY:                 "bg-violet-50 text-violet-700",
  LANGUAGE_EXPRESSION:       "bg-emerald-50 text-emerald-700",
  LANGUAGE_COMPREHENSION:    "bg-teal-50  text-teal-700",
  FLUENCY:                   "bg-orange-50 text-orange-700",
  VOICE:                     "bg-pink-50  text-pink-700",
  PRAGMATICS:                "bg-yellow-50 text-yellow-700",
  AUGMENTATIVE_COMMUNICATION:"bg-purple-50 text-purple-700",
  SOCIAL_COMMUNICATION:      "bg-cyan-50  text-cyan-700",
  LITERACY:                  "bg-lime-50  text-lime-700",
};

// ─── Goal progress bar ────────────────────────────────────────────────────────

function GoalRow({ goal, studentId }: { goal: Goal; studentId: string }) {
  const latestAccuracy = goal.dataPoints.find((dp) => dp.accuracy != null)?.accuracy ?? null;
  const target = goal.targetAccuracy;
  const pct = latestAccuracy != null ? Math.round(latestAccuracy * 100) : null;
  const targetPct = target != null ? Math.round(target * 100) : null;
  const domainColor = DOMAIN_COLORS[goal.domain] ?? "bg-slate-50 text-slate-600";

  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", domainColor)}>
            {formatDomain(goal.domain)}
          </span>
          {goal.shortName && (
            <span className="text-xs font-medium text-foreground truncate">{goal.shortName}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{goal.goalText}</p>
        {/* Progress bar */}
        {targetPct != null && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  pct == null ? "w-0" :
                  pct >= targetPct ? "bg-emerald-500" :
                  pct >= targetPct * 0.7 ? "bg-primary" : "bg-amber-400"
                )}
                style={{ width: pct != null ? `${Math.min(100, (pct / targetPct) * 100)}%` : "0%" }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {pct != null ? `${pct}%` : "—"} / {targetPct}%
            </span>
          </div>
        )}
      </div>
      <Link
        href={`/students/${studentId}/goals/${goal.id}`}
        className="shrink-0 text-muted-foreground hover:text-primary transition-colors mt-0.5"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

// ─── IEP card ─────────────────────────────────────────────────────────────────

function IEPCard({ iep, studentId }: { iep: IEP; studentId: string }) {
  const [plaafpExpanded, setPlaafpExpanded] = useState(false);
  const urgency = getUrgencyLevel(iep.reviewDate);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* IEP header */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 border-b",
        urgency === "overdue" ? "bg-rose-50/60" :
        urgency === "urgent"  ? "bg-amber-50/60" : ""
      )}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full border",
            IEP_STATUS_STYLES[iep.status] ?? "bg-slate-50 text-slate-600 border-slate-200"
          )}>
            {iep.status.replace(/_/g, " ")}
          </span>
          {(urgency === "overdue" || urgency === "urgent") && (
            <span className={cn(
              "flex items-center gap-1 text-xs font-medium",
              urgency === "overdue" ? "text-rose-600" : "text-amber-600"
            )}>
              <AlertTriangle className="h-3 w-3" />
              {urgency === "overdue" ? "Review overdue" : "Review due soon"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
            <Link href={`/students/${studentId}/ieps/${iep.id}/edit`}>
              <Pencil className="h-3 w-3" /> Edit
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
            <Link href={`/students/${studentId}/ieps/${iep.id}`}>
              <FileText className="h-3 w-3" /> Full IEP
            </Link>
          </Button>
        </div>
      </div>

      {/* Key dates + service */}
      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs border-b">
        <div>
          <p className="text-muted-foreground mb-0.5">Effective</p>
          <p className="font-medium">{formatDate(iep.effectiveDate)}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Review</p>
          <p className={cn(
            "font-medium",
            urgency === "overdue" ? "text-rose-600" :
            urgency === "urgent"  ? "text-amber-600" : ""
          )}>
            {formatDate(iep.reviewDate)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Expires</p>
          <p className="font-medium">{formatDate(iep.expirationDate)}</p>
        </div>
        {iep.minutesPerWeek && (
          <div>
            <p className="text-muted-foreground mb-0.5">Service</p>
            <p className="font-medium">{iep.minutesPerWeek} min/wk</p>
          </div>
        )}
        {iep.serviceLocation && (
          <div className="col-span-2">
            <p className="text-muted-foreground mb-0.5">Location</p>
            <p className="font-medium">{iep.serviceLocation}</p>
          </div>
        )}
        {(iep.individualMinutes || iep.groupMinutes) && (
          <div className="col-span-2 flex gap-4">
            {iep.individualMinutes && (
              <div>
                <p className="text-muted-foreground mb-0.5">Individual</p>
                <p className="font-medium">{iep.individualMinutes} min/wk</p>
              </div>
            )}
            {iep.groupMinutes && (
              <div>
                <p className="text-muted-foreground mb-0.5">Group</p>
                <p className="font-medium">{iep.groupMinutes} min/wk</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PLAAFP / Present Levels */}
      {iep.presentLevels && (
        <div className="border-b">
          <button
            onClick={() => setPlaafpExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Present Levels (PLAAFP)
            {plaafpExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {plaafpExpanded && (
            <div className="px-4 pb-3">
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{iep.presentLevels}</p>
            </div>
          )}
        </div>
      )}

      {/* Parent concerns */}
      {iep.parentConcerns && (
        <div className="px-4 py-3 border-b">
          <p className="text-xs font-medium text-muted-foreground mb-1">Parent Concerns</p>
          <p className="text-xs text-foreground leading-relaxed">{iep.parentConcerns}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StudentsIEPPage({ students }: Props) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [contactExpanded, setContactExpanded] = useState(false);

  // Fetch student detail when selection changes
  useEffect(() => {
    if (!selectedStudentId) { setStudentDetail(null); return; }
    setLoading(true);
    setStudentDetail(null);
    fetch(`/api/students/${selectedStudentId}`)
      .then((r) => r.json())
      .then((data) => setStudentDetail(data.student ?? null))
      .catch(() => setStudentDetail(null))
      .finally(() => setLoading(false));
  }, [selectedStudentId]);

  const activeIEP = studentDetail?.ieps.find(
    (i) => i.status === "ACTIVE" || i.status === "IN_REVIEW"
  ) ?? null;

  const activeGoals = studentDetail?.goals.filter((g) => g.status === "ACTIVE") ?? [];
  const otherGoals  = studentDetail?.goals.filter((g) => g.status !== "ACTIVE") ?? [];

  return (
    <div className="flex flex-col h-full max-w-[1600px]">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Students</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Caseload profiles, IEPs, and goals
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/students/new">
            <Plus className="h-4 w-4 mr-1.5" />
            Add student
          </Link>
        </Button>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border bg-card">

        {/* ── Left: Caseload ── */}
        <aside className="w-64 shrink-0 flex flex-col border-r bg-sidebar overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Caseload</span>
              <Badge variant="secondary" className="text-xs">{students.length}</Badge>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col px-2 py-2">
            <CaseloadSidePanel
              students={students}
              selectedId={selectedStudentId}
              onSelect={(id) => setSelectedStudentId((prev) => prev === id ? null : id)}
            />
          </div>
        </aside>

        {/* ── Right: IEP detail ── */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

          {/* No student selected */}
          {!selectedStudentId && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-base font-semibold text-foreground">Student Profiles & IEPs</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Select a student from the caseload to view their profile, IEP, and goals.
              </p>
            </div>
          )}

          {/* Loading */}
          {selectedStudentId && loading && (
            <div className="flex flex-col items-center justify-center flex-1 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
          )}

          {/* Student detail */}
          {selectedStudentId && !loading && studentDetail && (
            <>
              {/* Right panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                <div>
                  <span className="text-sm font-semibold text-foreground">
                    {studentDetail.firstName} {studentDetail.lastName}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatGrade(studentDetail.gradeLevel)}
                    {studentDetail.schoolName ? ` · ${studentDetail.schoolName}` : ""}
                    {studentDetail.disabilityCategory ? ` · ${formatDisability(studentDetail.disabilityCategory)}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
                    <Link href={`/students/${studentDetail.id}/edit`}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1">
                    <Link href={`/students/${studentDetail.id}/overview`}>
                      Overview <ChevronRight className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-5 max-w-3xl mx-auto">

                  {/* ── IEP Section ── */}
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        IEP
                      </h2>
                      <div className="flex gap-1.5">
                        {studentDetail.ieps.length > 1 && (
                          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                            <Link href={`/students/${studentDetail.id}/ieps`}>
                              All IEPs ({studentDetail.ieps.length})
                            </Link>
                          </Button>
                        )}
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
                          <Link href={`/students/${studentDetail.id}/ieps/new`}>
                            <Plus className="h-3 w-3" /> New IEP
                          </Link>
                        </Button>
                      </div>
                    </div>

                    {activeIEP ? (
                      <IEPCard iep={activeIEP} studentId={studentDetail.id} />
                    ) : (
                      <div className="rounded-xl border bg-card px-4 py-8 text-center">
                        <p className="text-sm text-muted-foreground mb-3">No active IEP on file.</p>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/students/${studentDetail.id}/ieps/new`}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create IEP
                          </Link>
                        </Button>
                      </div>
                    )}
                  </section>

                  {/* ── Goals Section ── */}
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold flex items-center gap-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        Goals
                        {activeGoals.length > 0 && (
                          <Badge variant="secondary" className="text-xs">{activeGoals.length} active</Badge>
                        )}
                      </h2>
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <Link href={`/students/${studentDetail.id}/goals/new`}>
                          <Plus className="h-3 w-3" /> Add Goal
                        </Link>
                      </Button>
                    </div>

                    {activeGoals.length === 0 ? (
                      <div className="rounded-xl border bg-card px-4 py-8 text-center">
                        <p className="text-sm text-muted-foreground mb-3">No active goals.</p>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/students/${studentDetail.id}/goals/new`}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add first goal
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-xl border bg-card divide-y overflow-hidden">
                        <div className="px-4 py-2 bg-muted/30">
                          <div className="grid grid-cols-[1fr_auto] text-xs font-medium text-muted-foreground">
                            <span>Goal</span>
                            <span>Progress</span>
                          </div>
                        </div>
                        <div className="px-4">
                          {activeGoals.map((goal) => (
                            <GoalRow key={goal.id} goal={goal} studentId={studentDetail.id} />
                          ))}
                        </div>
                      </div>
                    )}

                    {otherGoals.length > 0 && (
                      <Link
                        href={`/students/${studentDetail.id}/goals`}
                        className="mt-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        + {otherGoals.length} mastered / discontinued goal{otherGoals.length !== 1 ? "s" : ""}
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    )}
                  </section>

                  {/* ── Student Info Section ── */}
                  <section className="rounded-xl border bg-card overflow-hidden">
                    <button
                      onClick={() => setContactExpanded((v) => !v)}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        Student Details
                      </span>
                      {contactExpanded
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>

                    {contactExpanded && (
                      <div className="border-t px-4 pb-4 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
                        {studentDetail.dateOfBirth && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Date of Birth</p>
                            <p className="font-medium">{formatDate(studentDetail.dateOfBirth)}</p>
                          </div>
                        )}
                        {studentDetail.primaryLanguage && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Primary Language</p>
                            <p className="font-medium">{studentDetail.primaryLanguage}</p>
                          </div>
                        )}
                        {studentDetail.eligibilityDate && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Eligibility Date</p>
                            <p className="font-medium">{formatDate(studentDetail.eligibilityDate)}</p>
                          </div>
                        )}
                        {studentDetail.reevaluationDue && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Re-evaluation Due</p>
                            <p className="font-medium">{formatDate(studentDetail.reevaluationDue)}</p>
                          </div>
                        )}
                        {studentDetail.teacherName && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Teacher</p>
                            <p className="font-medium">{studentDetail.teacherName}</p>
                          </div>
                        )}
                        {studentDetail.classroom && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Classroom</p>
                            <p className="font-medium">{studentDetail.classroom}</p>
                          </div>
                        )}
                        {studentDetail.parentGuardianName && (
                          <div className="sm:col-span-2">
                            <p className="text-muted-foreground mb-0.5">Parent / Guardian</p>
                            <p className="font-medium">{studentDetail.parentGuardianName}</p>
                          </div>
                        )}
                        {studentDetail.parentGuardianPhone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                            <a href={`tel:${studentDetail.parentGuardianPhone}`} className="font-medium hover:text-primary transition-colors">
                              {studentDetail.parentGuardianPhone}
                            </a>
                          </div>
                        )}
                        {studentDetail.parentGuardianEmail && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                            <a href={`mailto:${studentDetail.parentGuardianEmail}`} className="font-medium hover:text-primary transition-colors truncate">
                              {studentDetail.parentGuardianEmail}
                            </a>
                          </div>
                        )}
                        {studentDetail.accommodations && (
                          <div className="sm:col-span-2">
                            <p className="text-muted-foreground mb-0.5">Accommodations</p>
                            <p className="font-medium leading-relaxed">{studentDetail.accommodations}</p>
                          </div>
                        )}
                        {studentDetail.medicalAlerts && (
                          <div className="sm:col-span-2">
                            <p className="text-muted-foreground mb-1 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                              Medical Alerts
                            </p>
                            <p className="font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                              {studentDetail.medicalAlerts}
                            </p>
                          </div>
                        )}
                        {studentDetail.externalProviders && (
                          <div className="sm:col-span-2">
                            <p className="text-muted-foreground mb-0.5">External Providers</p>
                            <p className="font-medium leading-relaxed">{studentDetail.externalProviders}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
