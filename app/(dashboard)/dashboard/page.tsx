import Link from "next/link";
import { startOfWeek, endOfWeek } from "date-fns";
import { requireUser } from "@/lib/auth/get-user";
import { getStudentsByUserId } from "@/lib/queries/students";
import { getUpcomingIEPReviews } from "@/lib/queries/ieps";
import { getSessionsForCalendar } from "@/lib/queries/sessions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CaseloadSidePanel } from "@/components/shared/caseload-side-panel";
import { DashboardCalendar } from "@/components/dashboard/dashboard-calendar";
import { AlertTriangle, Calendar, Plus, Users } from "lucide-react";
import { getUrgencyLevel } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();

  // Seed the calendar with the current week's sessions
  const today     = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });
  const weekEnd   = endOfWeek(today,   { weekStartsOn: 0 });

  const [students, upcomingReviews, initialSessions] = await Promise.all([
    getStudentsByUserId(user.id),
    getUpcomingIEPReviews(user.id, 60),
    getSessionsForCalendar(user.id, weekStart, weekEnd),
  ]);

  const urgentIEPs = upcomingReviews.filter(
    iep => getUrgencyLevel(iep.reviewDate) !== "soon"
  );

  return (
    <div className="flex flex-col gap-4 h-full max-w-[1600px]">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold">
            Good {getGreeting()}, {user.firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {today.toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
            })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {urgentIEPs.length > 0 && (
            <span className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
              "bg-amber-50 text-amber-700 border border-amber-200"
            )}>
              <AlertTriangle className="h-3.5 w-3.5" />
              {urgentIEPs.length} IEP{urgentIEPs.length !== 1 ? "s" : ""} need attention
            </span>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href="/sessions/new">
              <Plus className="h-4 w-4 mr-1.5" />
              New session
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Two-column layout: Caseload | Calendar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 flex-1 min-h-0">

        {/* LEFT: Caseload */}
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
          <CardContent className="flex-1 min-h-0 overflow-hidden pt-0 flex flex-col">
            <p className="text-xs text-muted-foreground mb-3 italic shrink-0">
              Drag a name onto the calendar to schedule a session
            </p>
            <CaseloadSidePanel
              draggable
              students={students.map(s => ({
                id:        s.id,
                firstName: s.firstName,
                lastName:  s.lastName,
                goals:     s.goals,
                ieps:      s.ieps.map(iep => ({
                  id:         iep.id,
                  status:     iep.status,
                  reviewDate: iep.reviewDate,
                  studentId:  s.id,
                })),
              }))}
            />
          </CardContent>
        </Card>

        {/* RIGHT: Calendar */}
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-hidden pt-0">
            <DashboardCalendar
              initialSessions={initialSessions.map(s => ({
                id:             s.id,
                sessionDate:    s.sessionDate,
                sessionType:    s.sessionType,
                startTime:      s.startTime,
                durationMins:   s.durationMins,
                isCancelled:    s.isCancelled,
                hasNotes:       s.notes.length > 0,
                sessionStudents: s.sessionStudents,
              }))}
            />
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
