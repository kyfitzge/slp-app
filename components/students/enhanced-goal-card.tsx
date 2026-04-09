"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { GoalDomainBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

interface GoalDataPoint {
  accuracy: number;
  collectedAt: Date | string;
}

interface EnhancedGoalCardProps {
  studentId: string;
  goal: {
    id: string;
    shortName: string | null;
    goalText: string;
    domain: string;
    targetAccuracy: number;
    dataPoints: GoalDataPoint[];
  };
}

function computeStats(points: GoalDataPoint[], targetAccuracy: number) {
  if (points.length === 0) {
    return { latest: null, avg: null, trend: "insufficient" as const, pct: null };
  }
  const sorted = [...points].sort(
    (a, b) => new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime()
  );
  const latest = sorted[sorted.length - 1].accuracy;
  const avg = sorted.reduce((s, p) => s + p.accuracy, 0) / sorted.length;

  let trend: "up" | "down" | "stable" | "insufficient" = "insufficient";
  if (sorted.length >= 2) {
    const delta = sorted[sorted.length - 1].accuracy - sorted[0].accuracy;
    if (delta > 0.05) trend = "up";
    else if (delta < -0.05) trend = "down";
    else trend = "stable";
  }

  const pct = targetAccuracy > 0 ? Math.min((latest / targetAccuracy) * 100, 100) : null;
  return { latest, avg, trend, pct };
}

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" | "insufficient" }) {
  if (trend === "up")
    return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
  if (trend === "down")
    return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  if (trend === "stable")
    return <Minus className="h-3.5 w-3.5 text-yellow-500" />;
  return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
}

// Mini sparkline using SVG
function Sparkline({ points, targetAccuracy }: { points: GoalDataPoint[]; targetAccuracy: number }) {
  if (points.length < 2) return null;
  const sorted = [...points]
    .sort((a, b) => new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime())
    .slice(-8);

  const w = 80;
  const h = 28;
  const pad = 2;

  const xs = sorted.map((_, i) => pad + (i / (sorted.length - 1)) * (w - pad * 2));
  const ys = sorted.map((p) => h - pad - p.accuracy * (h - pad * 2));
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const targetY = h - pad - targetAccuracy * (h - pad * 2);

  return (
    <svg width={w} height={h} className="overflow-visible">
      {/* Target line */}
      <line
        x1={pad} y1={targetY.toFixed(1)}
        x2={w - pad} y2={targetY.toFixed(1)}
        stroke="hsl(var(--primary))"
        strokeWidth="1"
        strokeDasharray="3 2"
        opacity="0.4"
      />
      {/* Trend path */}
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Latest dot */}
      <circle cx={xs[xs.length - 1].toFixed(1)} cy={ys[ys.length - 1].toFixed(1)} r="2.5" fill="hsl(var(--primary))" />
    </svg>
  );
}

export function EnhancedGoalCard({ studentId, goal }: EnhancedGoalCardProps) {
  const stats = computeStats(goal.dataPoints, goal.targetAccuracy);
  const latestPct = stats.latest != null ? Math.round(stats.latest * 100) : null;
  const targetPct = Math.round(goal.targetAccuracy * 100);
  const isAtOrAboveTarget = stats.latest != null && stats.latest >= goal.targetAccuracy;

  return (
    <Link href={`/students/${studentId}/goals/${goal.id}`}>
      <Card className={cn(
        "hover:border-primary/25 transition-colors cursor-pointer h-full group",
        isAtOrAboveTarget && "border-emerald-200 bg-emerald-50/20"
      )}>
        <CardContent className="pt-4 pb-4">
          {/* Top row: name + domain badge */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-sm font-medium leading-snug line-clamp-2 flex-1">
              {goal.shortName ?? goal.goalText.slice(0, 60)}
            </p>
            <GoalDomainBadge domain={goal.domain} />
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3">
            {/* Latest accuracy + trend */}
            <div className="flex items-center gap-1.5">
              <TrendIcon trend={stats.trend} />
              <span className={cn(
                "text-base font-semibold tabular-nums",
                isAtOrAboveTarget ? "text-emerald-600" : "text-foreground"
              )}>
                {latestPct != null ? `${latestPct}%` : "—"}
              </span>
              <span className="text-xs text-muted-foreground">/ {targetPct}%</span>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Sparkline */}
            {goal.dataPoints.length >= 2 && (
              <Sparkline points={goal.dataPoints} targetAccuracy={goal.targetAccuracy} />
            )}
          </div>

          {/* Progress bar — thin and elegant */}
          {stats.pct != null && (
            <div className="mt-2.5 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  isAtOrAboveTarget ? "bg-emerald-400" : "bg-primary/70"
                )}
                style={{ width: `${stats.pct}%` }}
              />
            </div>
          )}

          {/* Footer: data count */}
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {goal.dataPoints.length === 0
              ? "No data yet"
              : `${goal.dataPoints.length} data point${goal.dataPoints.length !== 1 ? "s" : ""}`}
            {stats.avg != null && ` · avg ${Math.round(stats.avg * 100)}%`}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
