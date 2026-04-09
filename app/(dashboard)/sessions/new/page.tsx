import { requireUser } from "@/lib/auth/get-user";
import { getStudentsByUserId } from "@/lib/queries/students";
import { SessionForm } from "@/components/sessions/session-form";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "New Session" };

export default async function NewSessionPage() {
  const user = await requireUser();
  const students = await getStudentsByUserId(user.id);

  return (
    <div>
      <PageHeader title="New session" description="Record a therapy session." />
      <SessionForm
        students={students.map((s) => ({
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
        }))}
      />
    </div>
  );
}
