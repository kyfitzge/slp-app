import Link from "next/link";
import { ChevronRight, CheckCircle2, XCircle, Clock, BarChart2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils";

interface SessionNote {
  noteText: string;
  isLocked: boolean;
}

interface DataPoint {
  accuracy: number;
  goalId: string;
}

interface RecentSession {
  id: string;
  sessionDate: Date | string;
  sessionType: string;
  durationMins: number | null;
  isCancelled: boolean;
  attendance: string;
  notes: SessionNote[];
  dataPoints: DataPoint[];
}

interface RecentSessionsPanelProps {
  sessions: RecentSession[];
  studentId: string;
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  GROUP: "Group",
  EVALUATION: "Eval",
  RE_EVALUATION: "Re-Eval",
  CONSULTATION: "Consult",
  PARENT_CONFERENCE: "Parent Conf.",
};

function getAttendanceInfo(attendance: string) {
  switch (attendance) {
    case "PRESENT":
      return { icon: CheckCircle2, color: "text-green-500", label: "Present" };
    case "ABSENT_EXCUSED":
    case "ABSENT_UNEXCUSED":
      return { icon: XCircle, color: "text-red-500", label: "Absent" };
    case "CANCELLED_SLP":
    case "CANCELLED_SCHOOL":
      return { icon: XCircle, color: "text-slate-400", label: "Cancelled" };
    case "MAKEUP":
      return { icon: CheckCircle2, color: "text-blue-500", label: "Makeup" };
    default:
      return { icon: Clock, color: "text-muted-foreground", label: attendance };
  }
}

function docStatus(session: RecentSession): "complete" | "in_progress" | "needs_note" {
  if (session.notes.length === 0) return "needs_note";
  const hasSubstantial = session.notes.some(
    (n) => n.isLocked || (n.noteText && n.noteText.trim().length >= 60)
  );
  return hasSubstantial ? "complete" : "in_progress";
}

export function RecentSessionsPanel({ sessions, studentId }: RecentSessionsPanelProps) {
  if (sessions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href="/sessions/new">Schedule first session</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">Recent Sessions</CardTitle>
        <Link
          href={`/students/${studentId}/sessions`}
          className="text-xs text-primary hover:underline flex items-center gap-0.5"
        >
          View all <ChevronRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-0 space-y-0 divide-y">
        {sessions.map((session) => {
          const attInfo = getAttendanceInfo(session.attendance);
          const AttIcon = attInfo.icon;
          const status = docStatus(session);
          const typeLabel = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType.replace(/_/g, " ");
          const avgAccuracy =
            session.dataPoints.length > 0
              ? Math.round(
                  (session.dataPoints.reduce((s, dp) => s + dp.accuracy, 0) / session.dataPoints.length) * 100
                )
              : null;

          return (
            <div key={session.id} className="py-2.5 flex items-center gap-3">
              {/* Attendance indicator */}
              <AttIcon className={cn("h-4 w-4 shrink-0", attInfo.color)} />

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{formatDate(new Date(session.sessionDate))}</span>
                  <Badge variant="secondary" className="text-xs">{typeLabel}</Badge>
                  {session.durationMins && (
                    <span className="text-xs text-muted-foreground">{session.durationMins} min</span>
                  )}
                </div>

                {/* Note status + data */}
                <div className="flex items-center gap-2 mt-0.5">
                  {status === "needs_note" && (
                    <span className="text-xs text-orange-600">Needs note</span>
                  )}
                  {status === "in_progress" && (
                    <span className="text-xs text-yellow-600">Note in progress</span>
                  )}
                  {status === "complete" && (
                    <span className="text-xs text-green-600">Note complete</span>
                  )}
                  {avgAccuracy != null && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <BarChart2 className="h-3 w-3" />
                      {avgAccuracy}% avg
                    </span>
                  )}
                </div>
              </div>

              {/* Link */}
              <Link
                href={`/sessions/${session.id}`}
                className="shrink-0 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
