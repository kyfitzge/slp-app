import { requireUser } from "@/lib/auth/get-user";
import { getAllProgressReports } from "@/lib/queries/progress-reports";
import { getStudentsByUserId } from "@/lib/queries/students";
import { ProgressReportsPage } from "@/components/progress/progress-reports-page";

export default async function ProgressReportsRoute() {
  const user = await requireUser();

  const [rawReports, rawStudents] = await Promise.all([
    getAllProgressReports(user.id),
    getStudentsByUserId(user.id),
  ]);

  const reports = rawReports.map((r) => ({
    id: r.id,
    periodLabel: r.periodLabel,
    periodStartDate: r.periodStartDate.toISOString(),
    periodEndDate: r.periodEndDate.toISOString(),
    isDraft: r.isDraft,
    finalizedAt: r.finalizedAt ? r.finalizedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    student: r.student,
  }));

  const students = rawStudents.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    goals: s.goals,
    ieps: s.ieps.map((iep) => ({
      id: iep.id,
      status: iep.status,
      reviewDate: iep.reviewDate.toISOString(),
      studentId: s.id,
    })),
  }));

  return <ProgressReportsPage initialReports={reports} students={students} />;
}
