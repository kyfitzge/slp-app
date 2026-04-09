import { requireUser } from "@/lib/auth/get-user";
import { getStudentsByUserId } from "@/lib/queries/students";
import { ScheduleEntryForm } from "@/components/schedule/schedule-entry-form";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "New Schedule Entry" };

export default async function NewScheduleEntryPage() {
  const user = await requireUser();
  const students = await getStudentsByUserId(user.id);

  return (
    <div>
      <PageHeader title="New schedule entry" description="Set up a recurring or one-time session." />
      <ScheduleEntryForm
        students={students.map((s) => ({
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
        }))}
      />
    </div>
  );
}
