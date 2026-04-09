import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getGoalById } from "@/lib/queries/goals";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoalStatusBadge, GoalDomainBadge } from "@/components/shared/status-badge";
import { GoalProgressChart } from "@/components/goals/goal-progress-chart";
import { QuickDataEntry } from "@/components/goals/quick-data-entry";
import { formatDate, formatDateShort } from "@/lib/utils/format-date";
import { formatAccuracy, aggregateDataPoints } from "@/lib/utils/calc-accuracy";
import { Pencil } from "lucide-react";

const CUEING_LABELS: Record<string, string> = {
  INDEPENDENT: "Independent",
  GESTURAL: "Gestural",
  INDIRECT_VERBAL: "Indirect Verbal",
  DIRECT_VERBAL: "Direct Verbal",
  MODELING: "Modeling",
  PHYSICAL: "Physical",
  MAXIMUM_ASSISTANCE: "Max Assist",
};

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ studentId: string; goalId: string }>;
}) {
  await requireUser();
  const { studentId, goalId } = await params;
  const goal = await getGoalById(goalId);
  if (!goal) notFound();

  const stats = aggregateDataPoints(goal.dataPoints, goal.targetAccuracy);
  const sortedDataPoints = [...goal.dataPoints].sort(
    (a, b) => new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Goal header */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <GoalStatusBadge status={goal.status as never} />
                <GoalDomainBadge domain={goal.domain} />
              </div>
              <p className="text-sm">{goal.goalText}</p>
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                <span>Target: <strong className="text-foreground">{Math.round(goal.targetAccuracy * 100)}%</strong></span>
                {goal.targetTrials && <span>Trials: {goal.targetTrials}</span>}
                {goal.baselineScore != null && (
                  <span>Baseline: {Math.round(goal.baselineScore * 100)}%</span>
                )}
                {goal.baselineDate && <span>({formatDate(goal.baselineDate)})</span>}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <QuickDataEntry
                goalId={goalId}
                goalName={goal.shortName ?? goal.goalText.slice(0, 50)}
              />
              <Button asChild size="sm" variant="outline">
                <Link href={`/students/${studentId}/goals/${goalId}/edit`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Latest", value: formatAccuracy(stats.latestAccuracy) },
          { label: "Average", value: formatAccuracy(stats.averageAccuracy) },
          { label: "Data points", value: String(stats.sessionCount) },
          {
            label: "Trend",
            value: stats.trend === "up" ? "↑ Improving" : stats.trend === "down" ? "↓ Declining" : stats.trend === "stable" ? "→ Stable" : "—",
          },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-3 pb-3 text-center">
              <div className="text-lg font-semibold">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Progress over time</CardTitle>
        </CardHeader>
        <CardContent>
          <GoalProgressChart
            dataPoints={sortedDataPoints}
            targetAccuracy={goal.targetAccuracy}
          />
        </CardContent>
      </Card>

      {/* Data points table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Data history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sortedDataPoints.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No data points recorded yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">Date</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">Accuracy</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">Trials</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">Cueing</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">Target</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">Notes</th>
                </tr>
              </thead>
              <tbody>
                {[...sortedDataPoints].reverse().map((dp) => (
                  <tr key={dp.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="px-4 py-2 text-muted-foreground">{formatDateShort(dp.collectedAt)}</td>
                    <td className="px-4 py-2 font-medium">{Math.round(dp.accuracy * 100)}%</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {dp.trialsCorrect != null && dp.trialsTotal != null
                        ? `${dp.trialsCorrect}/${dp.trialsTotal}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {CUEING_LABELS[dp.cueingLevel] ?? dp.cueingLevel}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{dp.targetItem ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{dp.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
