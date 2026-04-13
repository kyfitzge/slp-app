import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getStudentById } from "@/lib/queries/students";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GoalDomainBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils/format-date";
import { aggregateDataPoints } from "@/lib/utils/calc-accuracy";
import { TrendingUp, TrendingDown, Minus, Activity, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" | "insufficient" }) {
  if (trend === "up")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
        <TrendingUp className="h-3 w-3" /> Improving
      </span>
    );
  if (trend === "down")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
        <TrendingDown className="h-3 w-3" /> Declining
      </span>
    );
  if (trend === "stable")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-yellow-600 font-medium">
        <Minus className="h-3 w-3" /> Stable
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Activity className="h-3 w-3" /> Insufficient data
    </span>
  );
}

export default async function StudentProgressPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await requireUser();
  const { studentId } = await params;

  const student = await getStudentById(studentId, user.id);

  if (!student) notFound();

  const studentName = `${student.firstName} ${student.lastName}`;

  const goals = student.goals.filter((g) => g.dataPoints.length > 0 || g.status === "ACTIVE");
  const activeGoals = goals.filter((g) => g.status === "ACTIVE");
  const masteredGoals = student.goals.filter((g) => g.status === "MASTERED");

  return (
    <div className="space-y-6">
      {/* Goal Performance Data section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Goal Performance Data</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Goal-by-goal performance summary for {studentName}
            </p>
          </div>
        </div>

        {/* Active Goals Progress */}
        {activeGoals.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Activity className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No active goals with data yet.</p>
              <Button asChild size="sm" variant="outline">
                <Link href={`/students/${studentId}/goals/new`}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Add a goal
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeGoals.map((goal) => {
              const sortedPoints = [...goal.dataPoints].sort(
                (a, b) => new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime()
              );
              const stats = aggregateDataPoints(sortedPoints, goal.targetAccuracy);
              const latestPct = stats.latestAccuracy != null ? Math.round(stats.latestAccuracy * 100) : null;
              const avgPct = stats.averageAccuracy != null ? Math.round(stats.averageAccuracy * 100) : null;
              const targetPct = Math.round(goal.targetAccuracy * 100);
              const isAtTarget = stats.latestAccuracy != null && stats.latestAccuracy >= goal.targetAccuracy;

              return (
                <Card key={goal.id} className={cn(isAtTarget && "border-green-200")}>
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <div className="space-y-1 flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">
                          {goal.shortName ?? goal.goalText.slice(0, 60)}
                        </p>
                        <GoalDomainBadge domain={goal.domain} />
                        {isAtTarget && (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                            At Target
                          </Badge>
                        )}
                      </div>
                      {goal.shortName && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{goal.goalText}</p>
                      )}
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs shrink-0">
                      <Link href={`/students/${studentId}/goals/${goal.id}`}>
                        Details <ChevronRight className="h-3 w-3 ml-0.5" />
                      </Link>
                    </Button>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="text-center rounded-lg bg-muted/40 py-2">
                        <p className={cn(
                          "text-lg font-bold tabular-nums",
                          isAtTarget ? "text-green-600" : "text-foreground"
                        )}>
                          {latestPct != null ? `${latestPct}%` : "—"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Latest</p>
                      </div>
                      <div className="text-center rounded-lg bg-muted/40 py-2">
                        <p className="text-lg font-bold tabular-nums">
                          {avgPct != null ? `${avgPct}%` : "—"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Average</p>
                      </div>
                      <div className="text-center rounded-lg bg-muted/40 py-2">
                        <p className="text-lg font-bold tabular-nums text-primary">{targetPct}%</p>
                        <p className="text-[11px] text-muted-foreground">Target</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    {stats.percentToTarget != null && (
                      <div className="mb-2">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              isAtTarget ? "bg-green-500" : "bg-primary"
                            )}
                            style={{ width: `${stats.percentToTarget}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 text-right">
                          {Math.round(stats.percentToTarget)}% of target
                        </p>
                      </div>
                    )}

                    {/* Trend + data points */}
                    <div className="flex items-center justify-between">
                      <TrendBadge trend={stats.trend} />
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {stats.sessionCount} data point{stats.sessionCount !== 1 ? "s" : ""}
                        </p>
                        {sortedPoints.length > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            Last: {formatDate(new Date(sortedPoints[sortedPoints.length - 1].collectedAt))}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Mini data table — last 5 sessions */}
                    {sortedPoints.length > 0 && (
                      <div className="mt-3 border rounded-lg overflow-hidden">
                        <div className="grid grid-cols-2 text-[11px] font-medium text-muted-foreground bg-muted/40 px-3 py-1.5">
                          <span>Date</span>
                          <span className="text-right">Accuracy</span>
                        </div>
                        {sortedPoints.slice(-5).reverse().map((dp) => (
                          <div
                            key={dp.id}
                            className="grid grid-cols-2 text-xs px-3 py-1.5 border-t"
                          >
                            <span className="text-muted-foreground">{formatDate(new Date(dp.collectedAt))}</span>
                            <span className={cn(
                              "text-right font-medium tabular-nums",
                              dp.accuracy >= goal.targetAccuracy ? "text-green-600" : "text-foreground"
                            )}>
                              {Math.round(dp.accuracy * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Mastered Goals */}
        {masteredGoals.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
              Mastered Goals ({masteredGoals.length})
            </h3>
            <div className="space-y-2">
              {masteredGoals.map((goal) => (
                <Card key={goal.id} className="border-green-200 bg-green-50/20">
                  <CardContent className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <GoalDomainBadge domain={goal.domain} />
                      <p className="text-sm font-medium truncate">
                        {goal.shortName ?? goal.goalText.slice(0, 60)}
                      </p>
                      <Badge className="bg-green-100 text-green-700 border-green-200 text-xs shrink-0">
                        Mastered
                      </Badge>
                    </div>
                    <Link
                      href={`/students/${studentId}/goals/${goal.id}`}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      View →
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
