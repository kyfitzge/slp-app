import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getGoalsByStudentId } from "@/lib/queries/goals";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GoalStatusBadge, GoalDomainBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatAccuracy, aggregateDataPoints } from "@/lib/utils/calc-accuracy";
import { Plus, Target } from "lucide-react";

export default async function GoalsPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  await requireUser();
  const { studentId } = await params;
  const goals = await getGoalsByStudentId(studentId);

  const activeGoals = goals.filter((g) => g.status === "ACTIVE");
  const otherGoals = goals.filter((g) => g.status !== "ACTIVE");

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button asChild size="sm">
          <Link href={`/students/${studentId}/goals/new`}>
            <Plus className="h-4 w-4 mr-1.5" />Add goal
          </Link>
        </Button>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Create measurable goals for this student."
          actionLabel="Add goal"
          actionHref={`/students/${studentId}/goals/new`}
        />
      ) : (
        <div className="space-y-6">
          {activeGoals.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Active ({activeGoals.length})
              </h3>
              <div className="space-y-2">
                {activeGoals.map((goal) => {
                  const stats = aggregateDataPoints(goal.dataPoints, goal.targetAccuracy);
                  return (
                    <Link key={goal.id} href={`/students/${studentId}/goals/${goal.id}`}>
                      <Card className="hover:shadow-sm transition-shadow">
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <GoalDomainBadge domain={goal.domain} />
                                {goal.shortName && (
                                  <span className="text-sm font-medium">{goal.shortName}</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">{goal.goalText}</p>
                            </div>
                            <div className="text-right text-xs shrink-0 space-y-0.5">
                              <div className="font-medium">
                                {formatAccuracy(stats.latestAccuracy)}
                              </div>
                              <div className="text-muted-foreground">
                                / {Math.round(goal.targetAccuracy * 100)}% target
                              </div>
                              <div className="text-muted-foreground">
                                {stats.sessionCount} pts
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {otherGoals.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Inactive
              </h3>
              <div className="space-y-2">
                {otherGoals.map((goal) => (
                  <Link key={goal.id} href={`/students/${studentId}/goals/${goal.id}`}>
                    <Card className="hover:shadow-sm transition-shadow opacity-70">
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-center gap-2">
                          <GoalStatusBadge status={goal.status as never} />
                          <GoalDomainBadge domain={goal.domain} />
                          <p className="text-xs text-muted-foreground truncate">
                            {goal.shortName ?? goal.goalText.slice(0, 60)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
