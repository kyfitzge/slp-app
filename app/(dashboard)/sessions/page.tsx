import { requireUser } from "@/lib/auth/get-user";
import { getSessionsByUserId } from "@/lib/queries/sessions";
import { getStudentsByUserId } from "@/lib/queries/students";
import { SessionsPageClient } from "@/components/sessions/sessions-page-client";

export const metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const user = await requireUser();

  const [sessions, rawStudents] = await Promise.all([
    getSessionsByUserId(user!.id, { limit: 100 }),
    getStudentsByUserId(user!.id),
  ]);

  const needsNote = sessions.filter((s) => {
    if (s.isCancelled) return false;
    if (s.notes.length === 0) return true;
    // Group session: incomplete if fewer substantial notes than students
    const studentCount = s.sessionStudents.length;
    if (studentCount > 1) {
      const substantial = s.notes.filter(
        (n) => n.isLocked || (n.noteText && n.noteText.trim().length >= 60)
      ).length;
      return substantial < studentCount;
    }
    return false;
  }).length;

  const students = rawStudents.map((s) => ({
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
  }));

  return (
    <SessionsPageClient
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
      students={students}
      needsNoteCount={needsNote}
    />
  );
}
