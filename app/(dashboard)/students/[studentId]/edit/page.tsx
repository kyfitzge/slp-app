import { requireUser } from "@/lib/auth/get-user";
import { getStudentById } from "@/lib/queries/students";
import { StudentForm } from "@/components/students/student-form";
import { PageHeader } from "@/components/shared/page-header";
import { notFound } from "next/navigation";
import { format } from "date-fns";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await requireUser();
  const { studentId } = await params;
  const student = await getStudentById(studentId, user.id);
  if (!student) notFound();

  const defaultValues = {
    firstName: student.firstName,
    lastName: student.lastName,
    dateOfBirth: format(new Date(student.dateOfBirth), "yyyy-MM-dd"),
    gender: student.gender ?? "",
    pronouns: student.pronouns ?? "",
    schoolName: student.schoolName,
    schoolDistrict: student.schoolDistrict ?? "",
    gradeLevel: student.gradeLevel as never,
    teacherName: student.teacherName ?? "",
    classroom: student.classroom ?? "",
    disabilityCategory: student.disabilityCategory as never,
    eligibilityDate: student.eligibilityDate ? format(new Date(student.eligibilityDate), "yyyy-MM-dd") : "",
    reevaluationDue: student.reevaluationDue ? format(new Date(student.reevaluationDue), "yyyy-MM-dd") : "",
    parentGuardianName: student.parentGuardianName ?? "",
    parentGuardianEmail: student.parentGuardianEmail ?? "",
    parentGuardianPhone: student.parentGuardianPhone ?? "",
    primaryLanguage: student.primaryLanguage,
    secondaryLanguage: student.secondaryLanguage ?? "",
    accommodations: student.accommodations ?? "",
    medicalAlerts: student.medicalAlerts ?? "",
    externalProviders: student.externalProviders ?? "",
  };

  return (
    <div>
      <PageHeader title="Edit student" />
      <StudentForm defaultValues={defaultValues} studentId={studentId} />
    </div>
  );
}
