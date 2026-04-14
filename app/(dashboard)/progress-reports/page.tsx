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
    summaryText: r.summaryText ?? null,
    isDraft: r.isDraft,
    finalizedAt: r.finalizedAt ? r.finalizedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    student: r.student,
  }));

  const students = rawStudents.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    gradeLevel: s.gradeLevel ?? null,
    schoolName: s.schoolName ?? null,
    goals: s.goals.map((g) => ({
      id: g.id,
      shortName: g.shortName ?? null,
      goalText: g.goalText,
      domain: g.domain,
      targetAccuracy: g.targetAccuracy,
      status: g.status,
    })),
    ieps: s.ieps.map((iep) => ({
      id: iep.id,
      status: iep.status,
      reviewDate: iep.reviewDate.toISOString(),
      studentId: s.id,
    })),
  }));

  return <ProgressReportsPage initialReports={reports} students={students} />;
}
