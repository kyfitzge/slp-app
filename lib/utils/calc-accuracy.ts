import type { GoalDataPoint } from "@/app/generated/prisma/client";

export interface AccuracyStats {
  latestAccuracy: number | null;
  averageAccuracy: number | null;
  sessionCount: number;
  trend: "up" | "down" | "stable" | "insufficient";
  percentToTarget: number | null;
}

/**
 * Aggregate data points into summary stats for a goal.
 * @param points - sorted oldest-first array of GoalDataPoints
 * @param targetAccuracy - the goal's target accuracy (0–1)
 */
export function aggregateDataPoints(
  points: Pick<GoalDataPoint, "accuracy" | "collectedAt">[],
  targetAccuracy: number
): AccuracyStats {
  if (points.length === 0) {
    return {
      latestAccuracy: null,
      averageAccuracy: null,
      sessionCount: 0,
      trend: "insufficient",
      percentToTarget: null,
    };
  }

  const sorted = [...points].sort(
    (a, b) => new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime()
  );

  const latestAccuracy = sorted[sorted.length - 1].accuracy;
  const averageAccuracy =
    sorted.reduce((sum, p) => sum + p.accuracy, 0) / sorted.length;

  // Compute trend from first half vs second half of data points
  let trend: AccuracyStats["trend"] = "insufficient";
  if (sorted.length >= 4) {
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);
    const firstAvg = firstHalf.reduce((s, p) => s + p.accuracy, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, p) => s + p.accuracy, 0) / secondHalf.length;
    const delta = secondAvg - firstAvg;
    if (delta > 0.05) trend = "up";
    else if (delta < -0.05) trend = "down";
    else trend = "stable";
  } else if (sorted.length >= 2) {
    const delta = sorted[sorted.length - 1].accuracy - sorted[0].accuracy;
    if (delta > 0.05) trend = "up";
    else if (delta < -0.05) trend = "down";
    else trend = "stable";
  }

  const percentToTarget =
    targetAccuracy > 0 ? Math.min((latestAccuracy / targetAccuracy) * 100, 100) : null;

  return {
    latestAccuracy,
    averageAccuracy,
    sessionCount: sorted.length,
    trend,
    percentToTarget,
  };
}

/** Format accuracy as a percentage string, e.g. 0.85 → "85%" */
export function formatAccuracy(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}
