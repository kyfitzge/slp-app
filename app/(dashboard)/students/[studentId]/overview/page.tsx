import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getStudentById } from "@/lib/queries/students";
import { getSessionsByUserId } from "@/lib/queries/sessions";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IEPStatusBadge } from "@/components/shared/status-badge";
import { EnhancedGoalCard } from "@/components/students/enhanced-goal-card";
import { RecentSessionsPanel } from "@/components/students/recent-sessions-panel";
import { formatDate, getUrgencyLevel } from "@/lib/utils/format-date";
import {
  Plus, AlertTriangle, Calendar, ChevronRight,
  CheckCircle2, Clock, Phone, Mail, BookOpen, User,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default async function StudentOverviewPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await requireUser();
  const { studentId } = await params;

  const [student, allSessions] = await Promise.all([
    getStudentById(studentId, user.id),
    getSessionsByUserId(user.id, { studentId, limit: 5 }),
  ]);

  if (!student) notFound();

  const activeIEP = student.ieps.find((i) => i.status === "ACTIVE" || i.status === "IN_REVIEW");
  const activeGoals = student.goals.filter((g) => g.status === "ACTIVE");
  const inactiveGoals = student.goals.filter((g) => g.status !== "ACTIVE");
  const urgency = activeIEP ? getUrgencyLevel(activeIEP.reviewDate) : null;

  // Today's sessions for this student
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaySessions = allSessions.filter((s) => {
    const d = new Date(s.sessionDate);
    return d >= today && d < tomorrow && !s.isCancelled;
  });

  // Build recent sessions with per-student attendance
  const recentSessions = allSessions.slice(0, 5).map((s) => {
    const ss = s.sessionStudents.find((x) => x.student.id === studentId);
    return {
      id: s.id,
      sessionDate: s.sessionDate,
      sessionType: s.sessionType,
      durationMins: s.durationMins,
      isCancelled: s.isCancelled,
      attendance: ss?.attendance ?? "PRESENT",
      notes: s.notes,
      dataPoints: s.dataPoints,
    };
  });

  return (
    <div className="space-y-6">

      {/* ── Today Panel ─────────────────────────────────────────────────── */}
      {todaySessions.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Today
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todaySessions.map((s) => {
              const ss = s.sessionStudents.find((x) => x.student.id === studentId);
              const hasNote = s.notes.length > 0;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    {hasNote
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      : <Clock className="h-4 w-4 text-orange-400 shrink-0" />
                    }
                    <span className="font-medium">
                      {s.sessionType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    {s.startTime && <span className="text-muted-foreground">{s.startTime}</span>}
                    {s.durationMins && <span className="text-muted-foreground">· {s.durationMins} min</span>}
                  </div>
                  <Button asChild size="sm" variant={hasNote ? "outline" : "default"} className="h-7 text-xs shrink-0">
                    <Link href={`/sessions/${s.id}`}>
                      {hasNote ? "View" : "Document"}
                      <ChevronRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Active Goals ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Active Goals ({activeGoals.length})</h2>
          <Button asChild size="sm" variant="outline">
            <Link href={`/students/${studentId}/goals/new`}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Goal
            </Link>
          </Button>
        </div>

        {activeGoals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground mb-3">No active goals yet.</p>
              <Button asChild size="sm" variant="outline">
                <Link href={`/students/${studentId}/goals/new`}>Add first goal</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {activeGoals.map((goal) => (
              <EnhancedGoalCard key={goal.id} studentId={studentId} goal={goal} />
            ))}
          </div>
        )}

        {inactiveGoals.length > 0 && (
          <Link
            href={`/students/${studentId}/goals`}
            className="mt-2 inline-flex items-center text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            + {inactiveGoals.length} inactive / mastered goal{inactiveGoals.length !== 1 ? "s" : ""}
            <ChevronRight className="h-3 w-3 ml-0.5" />
          </Link>
        )}
      </div>

      {/* ── Two-column: IEP + Recent Sessions ───────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* IEP Card */}
        <Card className={cn(
          urgency === "overdue" && "border-red-200 bg-red-50/30",
          urgency === "urgent" && "border-amber-200 bg-amber-50/20"
        )}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active IEP</CardTitle>
            <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
              <Link href={`/students/${studentId}/ieps/new`}>
                <Plus className="h-3 w-3 mr-1" />New
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {activeIEP ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <IEPStatusBadge status={activeIEP.status as never} />
                  {(urgency === "overdue" || urgency === "urgent") && (
                    <span className={cn(
                      "flex items-center gap-1 text-xs font-medium",
                      urgency === "overdue" ? "text-red-600" : "text-amber-600"
                    )}>
                      <AlertTriangle className="h-3 w-3" />
                      {urgency === "overdue" ? "Review overdue" : "Review due soon"}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Effective</span>
                    <p className="font-medium">{formatDate(activeIEP.effectiveDate)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Review</span>
                    <p className={cn(
                      "font-medium",
                      urgency === "overdue" && "text-red-600",
                      urgency === "urgent" && "text-amber-600"
                    )}>{formatDate(activeIEP.reviewDate)}</p>
                  </div>
                  {activeIEP.minutesPerWeek && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Service</span>
                      <p className="font-medium">{activeIEP.minutesPerWeek} min/week</p>
                    </div>
                  )}
                </div>

                <Link
                  href={`/students/${studentId}/ieps/${activeIEP.id}`}
                  className="text-xs text-primary hover:underline flex items-center gap-0.5"
                >
                  View full IEP <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No active IEP.{" "}
                <Link href={`/students/${studentId}/ieps/new`} className="text-primary hover:underline">
                  Create one →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Sessions */}
        <RecentSessionsPanel sessions={recentSessions} studentId={studentId} />
      </div>

      {/* ── Student Details (de-emphasized) ─────────────────────────────── */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1 select-none">
          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
          Student Details
        </summary>
        <Card className="mt-2">
          <CardContent className="pt-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {student.dateOfBirth && (
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">DOB:</span>
                <span>{formatDate(student.dateOfBirth)}</span>
              </div>
            )}
            {student.primaryLanguage && (
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Language:</span>
                <span>{student.primaryLanguage}</span>
              </div>
            )}
            {student.teacherName && (
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Teacher:</span>
                <span>{student.teacherName}</span>
              </div>
            )}
            {student.parentGuardianName && (
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Parent/Guardian:</span>
                <span>{student.parentGuardianName}</span>
              </div>
            )}
            {student.parentGuardianPhone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Phone:</span>
                <span>{student.parentGuardianPhone}</span>
              </div>
            )}
            {student.parentGuardianEmail && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Email:</span>
                <span>{student.parentGuardianEmail}</span>
              </div>
            )}
            {student.accommodations && (
              <div className="col-span-full">
                <p className="text-muted-foreground mb-0.5">Accommodations</p>
                <p className="text-sm">{student.accommodations}</p>
              </div>
            )}
            {student.medicalAlerts && (
              <div className="col-span-full">
                <p className="text-muted-foreground mb-0.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  Medical Alerts
                </p>
                <p className="text-sm text-amber-700 bg-amber-50 rounded px-2 py-1">{student.medicalAlerts}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </details>
    </div>
  );
}
