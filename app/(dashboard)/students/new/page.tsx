import { PageHeader } from "@/components/shared/page-header";
import { StudentForm } from "@/components/students/student-form";

export const metadata = { title: "Add Student" };

export default function NewStudentPage() {
  return (
    <div>
      <PageHeader
        title="Add student"
        description="Create a new student profile and add them to your caseload."
      />
      <StudentForm />
    </div>
  );
}
