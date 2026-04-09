"use client";

import { useState } from "react";
import { QuickDataEntry } from "@/components/goals/quick-data-entry";
import { GoalDomainBadge } from "@/components/shared/status-badge";
import { formatAccuracy } from "@/lib/utils/calc-accuracy";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface Goal {
  id: string;
  shortName: string | null;
  goalText: string;
  domain: string;
}

interface SessionGoalDataPanelProps {
  sessionId: string;
  sessionDate: Date | string;
  student: { id: string; goals: Goal[] };
  existingDataPoints: Array<{ goalId: string; accuracy: number }>;
}

export function SessionGoalDataPanel({
  sessionId,
  sessionDate,
  student,
  existingDataPoints,
}: SessionGoalDataPanelProps) {
  const router = useRouter();
  const [recorded, setRecorded] = useState<Record<string, number>>(
    Object.fromEntries(existingDataPoints.map((dp) => [dp.goalId, dp.accuracy]))
  );

  if (student.goals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No active goals assigned.</p>
    );
  }

  return (
    <div className="space-y-2">
      {student.goals.map((goal) => {
        const existingAccuracy = recorded[goal.id];
        return (
          <div
            key={goal.id}
            className="flex items-center justify-between py-2 border-b last:border-0"
          >
            <div className="flex-1 min-w-0 mr-3">
              <div className="flex items-center gap-2">
                <GoalDomainBadge domain={goal.domain} />
                <span className="text-sm font-medium truncate">
                  {goal.shortName ?? goal.goalText.slice(0, 40)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {existingAccuracy != null && (
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{formatAccuracy(existingAccuracy)}</span>
                </div>
              )}
              <QuickDataEntry
                goalId={goal.id}
                goalName={goal.shortName ?? goal.goalText.slice(0, 60)}
                sessionId={sessionId}
                sessionDate={sessionDate}
                onSuccess={() => {
                  // We'll mark it with a placeholder until refresh
                  setRecorded((prev) => ({ ...prev, [goal.id]: -1 }));
                  router.refresh();
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
