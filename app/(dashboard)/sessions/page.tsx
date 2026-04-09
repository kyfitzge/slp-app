import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getSessionsByUserId } from "@/lib/queries/sessions";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SessionsList } from "@/components/sessions/sessions-list";
import { Button } from "@/components/ui/button";
import { Plus, ClipboardList, FileBarChart2 } from "lucide-react";

export const metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const user = await requireUser();
  const sessions = await getSessionsByUserId(user!.id, { limit: 100 });

  const needsNote = sessions.filter(
    (s) => !s.isCancelled && s.notes.length === 0
  ).length;

  return (
    <div>
      <PageHeader
        title="Sessions"
        description={
          needsNote > 0
            ? `${needsNote} session${needsNote !== 1 ? "s" : ""} need documentation`
            : `${sessions.length} session${sessions.length !== 1 ? "s" : ""} recorded`
        }
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/sessions/report">
                <FileBarChart2 className="h-4 w-4 mr-1.5" />
                Session Report
              </Link>
            </Button>
            <Button asChild>
              <Link href="/sessions/new">
                <Plus className="h-4 w-4 mr-1.5" />
                New session
              </Link>
            </Button>
          </div>
        }
      />

      {sessions.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No sessions yet"
          description="Record your first therapy session to get started."
          actionLabel="New session"
          actionHref="/sessions/new"
        />
      ) : (
        <SessionsList
          sessions={sessions.map((s) => ({
            id: s.id,
            sessionType: s.sessionType,
            sessionDate: s.sessionDate,
            startTime: s.startTime,
            durationMins: s.durationMins,
            isCancelled: s.isCancelled,
            sessionStudents: s.sessionStudents.map((ss) => ({
              student: {
                id: ss.student.id,
                firstName: ss.student.firstName,
                lastName: ss.student.lastName,
                goals: ss.student.goals.map((g) => ({
                  id: g.id,
                  shortName: g.shortName,
                  domain: g.domain,
                })),
              },
            })),
            notes: s.notes.map((n) => ({
              id: n.id,
              noteText: n.noteText,
              isLocked: n.isLocked,
              isAiGenerated: n.isAiGenerated,
            })),
            dataPoints: s.dataPoints.map((dp) => ({
              id: dp.id,
              accuracy: dp.accuracy,
              goalId: dp.goalId,
              goal: {
                shortName: dp.goal.shortName,
                domain: dp.goal.domain,
              },
            })),
          }))}
        />
      )}
    </div>
  );
}
