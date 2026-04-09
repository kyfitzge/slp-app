"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

interface DataPoint {
  collectedAt: Date | string;
  accuracy: number;
}

interface GoalProgressChartProps {
  dataPoints: DataPoint[];
  targetAccuracy: number; // 0–1
}

export function GoalProgressChart({ dataPoints, targetAccuracy }: GoalProgressChartProps) {
  const chartData = dataPoints.map((dp) => ({
    date: format(new Date(dp.collectedAt), "M/d"),
    accuracy: Math.round(dp.accuracy * 100),
  }));

  const targetPct = Math.round(targetAccuracy * 100);

  if (chartData.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No data points yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          formatter={(value: number) => [`${value}%`, "Accuracy"]}
          contentStyle={{
            fontSize: 12,
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            background: "hsl(var(--card))",
            color: "hsl(var(--foreground))",
          }}
        />
        <ReferenceLine
          y={targetPct}
          stroke="hsl(var(--primary))"
          strokeDasharray="4 4"
          label={{
            value: `Target ${targetPct}%`,
            position: "insideTopRight",
            fontSize: 10,
            fill: "hsl(var(--primary))",
          }}
        />
        <Line
          type="monotone"
          dataKey="accuracy"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ r: 3, fill: "hsl(var(--primary))" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
