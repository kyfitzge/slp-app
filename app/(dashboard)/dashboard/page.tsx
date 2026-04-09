import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getStudentsByUserId } from "@/lib/queries/students";
import { getUpcomingIEPReviews } from "@/lib/queries/ieps";
import { getTodaysSessions, getSessionsForDateRange } from "@/lib/queries/sessions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CaseloadPanel } from "@/components/dashboard/caseload-panel";
import { TodaysSessionsPanel } from "@/components/dashboard/todays-sessions-panel";
import { ScheduleCalendar } from "@/components/dashboard/schedule-calendar";
import { AlertTriangle, Calendar, Plus, Users } from "lucide-react";
import { getUrgencyLevel } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();

  // Date range for calendar: today → 60 days out
  const today = new Date();
  const calendarEnd = new Date(today);
  calendarEnd.setDate(calendarEnd.getDate() + 60);

  const [students, upcomingReviews, todaysSessions, calendarSessions] =
    await Promise.all([
      getStudentsByUserId(user.id),
      getUpcomingIEPReviews(user.id, 60),
      getTodaysSessions(user.id),
      getSessionsForDateRange(user.id, today, calendarEnd),
    ]);

  // Build calendar events
  const calendarEvents = [
    ...calendarSessions.map((s) => ({
      date: s.sessionDate.toISOString(),
      type: "session" as const,
      label: s.sessionStudents
        .map((ss) => `${ss.student.firstName} ${ss.student.lastName}`)
        .join(", "),
    })),
    ...upcomingReviews.map((iep) => ({
      date: new Date(iep.reviewDate).toISOString(),
      type: "iep" as const,
      label: `IEP review — ${iep.student.firstName} ${iep.student.lastName}`,
    })),
  ];

  const urgentIEPs = upcomingReviews.filter(
    (iep) => getUrgencyLevel(iep.reviewDate) !== "soon"
  );

  return (
    <div className="flex flex-col gap-4 h-full max-w-[1400px]">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Good {getGreeting()}, {user.firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {urgentIEPs.length > 0 && (
            <Link
              href="/students"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
                "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {urgentIEPs.length} IEP{urgentIEPs.length !== 1 ? "s" : ""} need attention
            </Link>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href="/sessions/new">
              <Plus className="h-4 w-4 mr-1.5" />
              New session
            </Link>
          </Button>
        </div>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-4 flex-1 min-h-0">

        {/* ── LEFT: Caseload panel ── */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Caseload
              </span>
              <Link
                href="/students/new"
                className="text-xs text-primary font-normal hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Add student
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-hidden pt-0">
            <CaseloadPanel
              students={students.map((s) => ({
                id: s.id,
                firstName: s.firstName,
                lastName: s.lastName,
                goals: s.goals,
                ieps: s.ieps.map((iep) => ({
                  id: iep.id,
                  status: iep.status,
                  reviewDate: iep.reviewDate,
                  studentId: s.id,
                })),
              }))}
            />
          </CardContent>
        </Card>

        {/* ── RIGHT: stacked panels ── */}
        <div className="flex flex-col gap-4 min-h-0">

          {/* TOP RIGHT: Today's sessions */}
          <Card className="shrink-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Today&apos;s sessions
                  {todaysSessions.length > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold h-5 w-5">
                      {todaysSessions.length}
                    </span>
                  )}
                </span>
                <Link
                  href="/sessions"
                  className="text-xs text-primary font-normal hover:underline"
                >
                  All sessions →
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <TodaysSessionsPanel
                sessions={todaysSessions.map((s) => ({
                  id: s.id,
                  sessionType: s.sessionType,
                  startTime: s.startTime,
                  durationMins: s.durationMins,
                  sessionStudents: s.sessionStudents.map((ss) => ({
                    student: {
                      id: ss.student.id,
                      firstName: ss.student.firstName,
                      lastName: ss.student.lastName,
                    },
                  })),
                }))}
              />
            </CardContent>
          </Card>

          {/* BOTTOM RIGHT: Schedule calendar */}
          <Card className="flex-1 min-h-0 overflow-auto">
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Schedule
                </span>
                <Link
                  href="/schedule"
                  className="text-xs text-primary font-normal hover:underline"
                >
                  Manage →
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ScheduleCalendar events={calendarEvents} />
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
