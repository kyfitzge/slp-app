import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getSessionsByUserId } from "@/lib/queries/sessions";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { AttendanceBadge } from "@/components/shared/status-badge";
import { formatDate, formatTime } from "@/lib/utils/format-date";
import { Calendar, ClipboardList } from "lucide-react";

export default async function StudentSessionsPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await requireUser();
  const { studentId } = await params;

  // Verify student belongs to this SLP's caseload
  const caseload = await prisma.caseload.findUnique({
    where: { userId_studentId: { userId: user.id, studentId } },
  });
  if (!caseload) notFound();

  const sessions = await getSessionsByUserId(user.id, { studentId });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""} total
        </p>
        <Link
          href={`/sessions/new?studentId=${studentId}`}
          className="text-xs text-primary hover:underline"
        >
          + New session
        </Link>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No sessions yet"
          description="Record a session to start tracking attendance and goal data."
          actionLabel="New session"
          actionHref={`/sessions/new?studentId=${studentId}`}
        />
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const ss = session.sessionStudents.find(
              (s) => s.student.id === studentId
            );

            return (
              <Link key={session.id} href={`/sessions/${session.id}`} className="block">
                <Card className="hover:shadow-sm transition-shadow">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {formatDate(session.sessionDate)}
                          </span>
                          {session.startTime && (
                            <span className="text-xs text-muted-foreground">
                              {formatTime(session.startTime)}
                            </span>
                          )}
                          {session.durationMins && (
                            <span className="text-xs text-muted-foreground">
                              · {session.durationMins} min
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {session.sessionType.replace(/_/g, " ")}
                          </Badge>
                          {session.sessionStudents.length > 1 && (
                            <span className="text-xs text-muted-foreground">
                              Group · {session.sessionStudents.length} students
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {session.dataPoints.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ClipboardList className="h-3.5 w-3.5" />
                            <span>{session.dataPoints.length} data pts</span>
                          </div>
                        )}
                        {ss && (
                          <AttendanceBadge status={(ss as any).attendance ?? "PRESENT"} />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
