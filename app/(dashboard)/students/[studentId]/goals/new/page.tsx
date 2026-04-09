import { requireUser } from "@/lib/auth/get-user";
import { GoalForm } from "@/components/goals/goal-form";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "New Goal" };

export default async function NewGoalPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  await requireUser();
  const { studentId } = await params;
  return (
    <div>
      <PageHeader title="Add goal" description="Create a measurable goal for this student." />
      <GoalForm studentId={studentId} />
    </div>
  );
}
