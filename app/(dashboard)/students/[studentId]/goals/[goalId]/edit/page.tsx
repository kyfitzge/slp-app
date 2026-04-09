import { requireUser } from "@/lib/auth/get-user";
import { getGoalById } from "@/lib/queries/goals";
import { notFound } from "next/navigation";
import { GoalForm } from "@/components/goals/goal-form";
import { format } from "date-fns";

export default async function EditGoalPage({
  params,
}: {
  params: Promise<{ studentId: string; goalId: string }>;
}) {
  await requireUser();
  const { studentId, goalId } = await params;
  const goal = await getGoalById(goalId);
  if (!goal) notFound();

  const defaultValues = {
    studentId,
    iepId: goal.iepId ?? undefined,
    domain: goal.domain as never,
    status: goal.status as never,
    goalText: goal.goalText,
    shortName: goal.shortName ?? undefined,
    targetAccuracy: Math.round(goal.targetAccuracy * 100),
    targetTrials: goal.targetTrials ?? undefined,
    targetConsecutive: goal.targetConsecutive ?? undefined,
    baselineDate: goal.baselineDate
      ? format(new Date(goal.baselineDate), "yyyy-MM-dd")
      : undefined,
    baselineScore:
      goal.baselineScore != null
        ? Math.round(goal.baselineScore * 100)
        : undefined,
    baselineNotes: goal.baselineNotes ?? undefined,
    reportingPeriod: goal.reportingPeriod ?? undefined,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Edit goal</h2>
        <p className="text-sm text-muted-foreground">
          {goal.shortName ?? goal.goalText.slice(0, 60)}
        </p>
      </div>
      <GoalForm studentId={studentId} goalId={goalId} defaultValues={defaultValues} />
    </div>
  );
}
