"use client";

import Link from "next/link";
import { useState } from "react";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ScheduleEntry {
  id: string;
  title: string | null;
  sessionType: string;
  frequency: string;
  dayOfWeek: number | null;
  startTime: string;
  durationMins: number;
  location: string | null;
  scheduleStudents: Array<{ studentId: string }>;
}

interface WeeklyCalendarProps {
  entries: ScheduleEntry[];
  studentMap: Record<string, string>; // studentId → "Last, First"
  initialWeekStart: Date;
}

const SESSION_TYPE_COLORS: Record<string, string> = {
  INDIVIDUAL: "bg-blue-50 border-blue-200 text-blue-800",
  GROUP: "bg-purple-50 border-purple-200 text-purple-800",
  CONSULTATION: "bg-amber-50 border-amber-200 text-amber-800",
  EVALUATION: "bg-green-50 border-green-200 text-green-800",
};

export function WeeklyCalendar({ entries, studentMap, initialWeekStart }: WeeklyCalendarProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);

  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)); // Mon-Fri

  function getEntriesForDay(dayIndex: number) {
    // dayIndex: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
    return entries
      .filter((e) => e.dayOfWeek === dayIndex)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  function formatTime(time: string) {
    const [h, m] = time.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
  }

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          Week of {format(weekStart, "MMM d, yyyy")}
        </span>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-5 gap-3">
        {days.map((day, i) => {
          const dayEntries = getEntriesForDay(i + 1);
          const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
          return (
            <div key={i} className="min-h-40">
              <div className={`text-center py-2 rounded-t-md border-b mb-2 ${isToday ? "bg-primary/10" : ""}`}>
                <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
                <div className={`text-sm font-medium ${isToday ? "text-primary" : ""}`}>
                  {format(day, "M/d")}
                </div>
              </div>
              <div className="space-y-1.5">
                {dayEntries.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4">—</div>
                ) : (
                  dayEntries.map((entry) => {
                    const studentNames = entry.scheduleStudents.map(
                      (ss) => studentMap[ss.studentId] ?? "Unknown"
                    );
                    return (
                      <div
                        key={entry.id}
                        className={`rounded-md border p-2 text-xs ${SESSION_TYPE_COLORS[entry.sessionType] ?? "bg-gray-50 border-gray-200"}`}
                      >
                        <div className="font-medium">{formatTime(entry.startTime)}</div>
                        <div className="text-[11px] opacity-80">{entry.durationMins} min</div>
                        <div className="mt-1 space-y-0.5">
                          {studentNames.slice(0, 3).map((name, ni) => (
                            <div key={ni} className="truncate">{name}</div>
                          ))}
                          {studentNames.length > 3 && (
                            <div className="opacity-70">+{studentNames.length - 3} more</div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
