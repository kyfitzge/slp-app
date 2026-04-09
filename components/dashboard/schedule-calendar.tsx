"use client";

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";

interface CalendarEvent {
  date: string; // ISO date string
  type: "session" | "iep";
  label: string;
}

interface ScheduleCalendarProps {
  events: CalendarEvent[];
}

export function ScheduleCalendar({ events }: ScheduleCalendarProps) {
  const [selected, setSelected] = useState<Date | undefined>(undefined);

  // Build lookup maps: dateKey → event types
  const sessionDates = new Set<string>();
  const iepDates = new Set<string>();

  for (const ev of events) {
    const key = ev.date.slice(0, 10);
    if (ev.type === "session") sessionDates.add(key);
    if (ev.type === "iep") iepDates.add(key);
  }

  function dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  // Events for the selected date
  const selectedEvents = selected
    ? events.filter((e) => e.date.slice(0, 10) === dateKey(selected))
    : [];

  return (
    <div>
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={setSelected}
        showOutsideDays
        className="w-full"
        classNames={{
          root: "w-full",
          months: "w-full",
          month: "w-full",
          month_grid: "w-full border-collapse",
          weekday: "text-muted-foreground text-xs font-medium py-1 text-center",
          day: "p-0 text-center",
          day_button: cn(
            "relative mx-auto flex flex-col items-center justify-start w-9 h-9 rounded-md text-sm transition-colors",
            "hover:bg-muted focus:bg-muted"
          ),
          selected: "bg-primary text-primary-foreground rounded-md",
          today: "font-semibold text-primary",
          outside: "text-muted-foreground/40",
          nav: "flex items-center justify-between mb-2",
          caption_label: "text-sm font-semibold",
          button_previous: "h-7 w-7 rounded hover:bg-muted flex items-center justify-center",
          button_next: "h-7 w-7 rounded hover:bg-muted flex items-center justify-center",
        }}
        components={{
          DayButton: ({ day, modifiers, ...props }) => {
            const key = dateKey(day.date);
            const hasSession = sessionDates.has(key);
            const hasIep = iepDates.has(key);
            const isSelected = modifiers.selected;

            return (
              <button
                {...props}
                className={cn(
                  "relative mx-auto flex flex-col items-center justify-center w-9 h-9 rounded-md text-sm transition-colors hover:bg-muted",
                  modifiers.today && !isSelected && "font-semibold text-primary",
                  modifiers.outside && "text-muted-foreground/40",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                <span>{day.date.getDate()}</span>
                {/* Event dots */}
                {(hasSession || hasIep) && !isSelected && (
                  <span className="flex gap-0.5 mt-0.5">
                    {hasSession && (
                      <span className="block h-1 w-1 rounded-full bg-blue-500" />
                    )}
                    {hasIep && (
                      <span className="block h-1 w-1 rounded-full bg-amber-500" />
                    )}
                  </span>
                )}
              </button>
            );
          },
        }}
      />

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1 px-1">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="block h-2 w-2 rounded-full bg-blue-500" />
          Session
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="block h-2 w-2 rounded-full bg-amber-500" />
          IEP review
        </span>
      </div>

      {/* Selected date events */}
      {selected && selectedEvents.length > 0 && (
        <div className="mt-3 rounded-lg border bg-muted/30 p-3 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {selected.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          {selectedEvents.map((ev, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className={cn(
                  "block h-2 w-2 rounded-full shrink-0",
                  ev.type === "session" ? "bg-blue-500" : "bg-amber-500"
                )}
              />
              <span className="text-xs text-foreground">{ev.label}</span>
            </div>
          ))}
        </div>
      )}

      {selected && selectedEvents.length === 0 && (
        <div className="mt-3 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            No sessions or IEP reviews on{" "}
            {selected.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            })}
            .
          </p>
        </div>
      )}
    </div>
  );
}
