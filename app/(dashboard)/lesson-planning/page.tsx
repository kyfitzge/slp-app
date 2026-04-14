import { requireUser } from "@/lib/auth/get-user";
import { getStudentsByUserId } from "@/lib/queries/students";
import { LessonPlanningPage } from "@/components/lesson-planning/lesson-planning-page";

export default async function LessonPlanningRoute() {
  const user = await requireUser();
  const rawStudents = await getStudentsByUserId(user.id);

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

  return <LessonPlanningPage students={students} />;
}
