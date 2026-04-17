import { requireUser } from "@/lib/auth/get-user";
import { getStudentsByUserId } from "@/lib/queries/students";
import { StudentsIEPPage } from "@/components/students/students-iep-page";

export const metadata = { title: "Students" };

export default async function Page() {
  const user = await requireUser();

  const students = await getStudentsByUserId(user.id);

  return (
    <StudentsIEPPage
      students={students.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        gradeLevel: s.gradeLevel,
        schoolName: s.schoolName,
        disabilityCategory: s.disabilityCategory,
        reevaluationDue: s.reevaluationDue ? s.reevaluationDue.toISOString() : null,
        goals: s.goals,
        ieps: s.ieps.map((iep) => ({
          id: iep.id,
          status: iep.status,
          reviewDate: iep.reviewDate.toISOString(),
          studentId: s.id,
        })),
      }))}
    />
  );
}
