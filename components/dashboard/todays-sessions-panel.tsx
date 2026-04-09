"use client";

import Link from "next/link";
import { Calendar, Clock, FileText, Play, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/utils/format-date";

interface SessionStudent {
  student: { id: string; firstName: string; lastName: string };
}

interface Session {
  id: string;
  sessionType: string;
  startTime: string | null;
  durationMins: number | null;
  sessionStudents: SessionStudent[];
}

interface TodaysSessionsPanelProps {
  sessions: Session[];
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  GROUP: "Group",
  EVALUATION: "Evaluation",
  CONSULTATION: "Consultation",
  PUSH_IN: "Push-in",
  PULL_OUT: "Pull-out",
  TELETHERAPY: "Teletherapy",
};

export function TodaysSessionsPanel({ sessions }: TodaysSessionsPanelProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="p-3 rounded-full bg-muted/50 mb-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No sessions today</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Enjoy the free time or{" "}
          <Link href="/sessions/new" className="text-primary hover:underline">
            log an unscheduled session
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const names = session.sessionStudents
          .map((ss) => ss.student.firstName)
          .join(", ");
        const fullNames = session.sessionStudents
          .map((ss) => `${ss.student.firstName} ${ss.student.lastName}`)
          .join(" · ");
        const typeLabel =
          SESSION_TYPE_LABELS[session.sessionType] ??
          session.sessionType.replace(/_/g, " ");

        return (
          <div
            key={session.id}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 hover:bg-muted/20 transition-colors"
          >
            {/* Time + info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{fullNames}</span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {typeLabel}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {session.startTime ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatTime(session.startTime)}
                    {session.durationMins && ` · ${session.durationMins} min`}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UserRound className="h-3 w-3" />
                    {names}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                <Link href={`/sessions/${session.id}`}>
                  <FileText className="h-3 w-3 mr-1" />
                  Notes
                </Link>
              </Button>
              <Button asChild size="sm" className="h-7 px-2 text-xs">
                <Link href={`/sessions/${session.id}`}>
                  <Play className="h-3 w-3 mr-1" />
                  Start
                </Link>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
