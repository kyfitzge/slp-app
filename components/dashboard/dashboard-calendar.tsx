"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  format,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths,
  subDays, subWeeks, subMonths,
  isSameDay, isSameMonth, isToday,
  eachDayOfInterval,
} from "date-fns";
import { ChevronLeft, ChevronRight, Loader2, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarSession {
  id: string;
  sessionDate: Date | string;
  sessionType: string;
  startTime: string | null;
  durationMins: number | null;
  isCancelled: boolean;
  hasNotes: boolean;
  sessionStudents: {
    student: { id: string; firstName: string; lastName: string };
  }[];
}

interface NewSessionDraft {
  studentId: string;
  studentName: string;
  date: Date;
  startTime: string;
}

type ViewMode = "day" | "week" | "month";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Return Tailwind color classes based on whether the session is past/future and has notes. */
function sessionColor(session: CalendarSession): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sessionDay = toLocalDate(session.sessionDate);
  const isPast = sessionDay < today;

  if (!isPast) {
    // Future session — blue
    return "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100";
  }
  if (session.hasNotes) {
    // Past + notes written — green
    return "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100";
  }
  // Past + no notes — yellow
  return "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100";
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL:        "Individual",
  GROUP:             "Group",
  EVALUATION:        "Eval",
  RE_EVALUATION:     "Re-Eval",
  CONSULTATION:      "Consult",
  PARENT_CONFERENCE: "Parent Conf.",
};

// Time grid: 6 AM → 9 PM, 30 px per 30-min slot → 1 px/minute
const GRID_START = 6;
const GRID_END   = 21;
const SLOT_PX    = 30;
const NUM_SLOTS  = (GRID_END - GRID_START) * 2; // 30 slots
const GRID_H     = NUM_SLOTS * SLOT_PX;          // 900 px

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Snap a minute value to the nearest 15-minute increment. */
function snap15(mins: number): number {
  return Math.round(mins / 15) * 15;
}

/** Convert a pixel offset from the top of the grid back to a HH:MM time string. */
function pxToTime(px: number): string {
  const totalMins = GRID_START * 60 + Math.max(0, px);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface ResizePreview {
  sessionId: string;
  top: number;    // px from grid top
  height: number; // px (= minutes)
}

function minsFromStart(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  return Math.max(0, (parts[0] - GRID_START) * 60 + (parts[1] ?? 0));
}

function slotToTime(idx: number): string {
  const total = GRID_START * 60 + idx * 30;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtTimeLabel(timeStr: string): string {
  const h = parseInt(timeStr.split(":")[0]);
  const m = parseInt(timeStr.split(":")[1] ?? "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Normalize a session date for calendar comparison.
 *
 * Prisma DateTime fields serialise as UTC ISO strings. A session stored on
 * "2026-04-09" becomes "2026-04-09T00:00:00.000Z" — which in any UTC-negative
 * timezone resolves to April 8 local time, putting the event on the wrong day.
 *
 * We rebuild a local Date from the *UTC* year/month/day components so that
 * "2026-04-09T00:00:00Z" → new Date(2026, 3, 9) regardless of local timezone.
 */
function toLocalDate(d: Date | string): Date {
  const utc = new Date(d);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function getMonthGrid(date: Date): Date[] {
  const ms = startOfMonth(date);
  const me = endOfMonth(date);
  return eachDayOfInterval({
    start: startOfWeek(ms, { weekStartsOn: 0 }),
    end:   endOfWeek(me,   { weekStartsOn: 0 }),
  });
}

// ─── Session context-menu wrapper ────────────────────────────────────────────
// Wraps any session element with a right-click menu providing Edit and Delete.

function SessionEventMenu({
  session,
  onDelete,
  children,
}: {
  session: CalendarSession;
  onDelete: (id: string) => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem
          className="gap-2 cursor-pointer"
          onSelect={() => router.push(`/sessions/${session.id}`)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 cursor-pointer"
          onSelect={() => router.push(`/sessions/${session.id}/edit`)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          onSelect={() => onDelete(session.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ─── Shared drag-start helper for session events ─────────────────────────────

function sessionDragStart(e: React.DragEvent, sessionId: string) {
  e.stopPropagation();
  e.dataTransfer.clearData();
  e.dataTransfer.setData(
    "application/json",
    JSON.stringify({ type: "session-move", sessionId }),
  );
  e.dataTransfer.effectAllowed = "move";
}

// ─── SessionChip (month view) ─────────────────────────────────────────────────

function SessionChip({
  session,
  onDelete,
  draggingId,
  onDragStart,
  onDragEnd,
}: {
  session: CalendarSession;
  onDelete: (id: string) => void;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const names = session.sessionStudents.map(ss =>
    `${ss.student.firstName} ${ss.student.lastName.charAt(0)}.`
  ).join(", ");
  const color = sessionColor(session);
  return (
    <SessionEventMenu session={session} onDelete={onDelete}>
      <Link
        href={`/sessions/${session.id}`}
        draggable
        onDragStart={e => { sessionDragStart(e, session.id); onDragStart(session.id); }}
        onDragEnd={onDragEnd}
        onClick={e => e.stopPropagation()}
        className={cn(
          "block rounded border px-1 py-0.5 text-xs leading-tight truncate transition-all relative z-10 cursor-grab active:cursor-grabbing",
          color,
          session.isCancelled && "opacity-40 line-through",
          draggingId === session.id && "opacity-30 ring-2 ring-primary/40",
        )}
      >
        {names}
      </Link>
    </SessionEventMenu>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  currentDate, sessions, dragOverSlot, onDragOver, onDragLeave, onDrop, onDelete,
  draggingId, onSessionDragStart, onDragEnd,
}: {
  currentDate: Date;
  sessions: CalendarSession[];
  dragOverSlot: string | null;
  onDragOver: (e: React.DragEvent, key: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, date: Date, time: string) => void;
  onDelete: (id: string) => void;
  draggingId: string | null;
  onSessionDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const days = getMonthGrid(currentDate);

  return (
    <div className="flex flex-col h-full">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b shrink-0">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr border-l overflow-auto">
        {days.map(day => {
          const key = format(day, "yyyy-MM-dd");
          const daySessions = sessions.filter(s => isSameDay(toLocalDate(s.sessionDate), day));
          const inMonth = isSameMonth(day, currentDate);
          const today   = isToday(day);
          const over    = dragOverSlot === key;

          return (
            <div
              key={key}
              className={cn(
                "border-r border-b min-h-[88px] p-1 relative transition-colors",
                !inMonth && "bg-muted/25",
                over && "bg-primary/8 ring-2 ring-inset ring-primary/40",
              )}
              onDragOver={e => onDragOver(e, key)}
              onDragLeave={onDragLeave}
              onDrop={e => onDrop(e, day, "")}
            >
              {/* Date number */}
              <span className={cn(
                "text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full mb-0.5",
                today   && "bg-primary text-primary-foreground",
                !today  && !inMonth && "text-muted-foreground/40",
                !today  && inMonth  && "text-foreground",
              )}>
                {format(day, "d")}
              </span>

              {/* Events */}
              <div className="space-y-0.5">
                {daySessions.slice(0, 3).map(s => (
                  <SessionChip key={s.id} session={s} onDelete={onDelete}
                    draggingId={draggingId} onDragStart={onSessionDragStart} onDragEnd={onDragEnd} />
                ))}
                {daySessions.length > 3 && (
                  <span className="text-xs text-muted-foreground px-1 block">
                    +{daySessions.length - 3} more
                  </span>
                )}
              </div>

              {/* Drop hint overlay */}
              {over && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-xs font-semibold text-primary bg-white/90 border border-primary/30 px-2 py-1 rounded shadow-sm">
                    Drop to schedule
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time Grid View (week / day) ──────────────────────────────────────────────

function useCurrentTimePx(): number | null {
  const [px, setPx] = useState<number | null>(() => {
    const now = new Date();
    const mins = (now.getHours() - GRID_START) * 60 + now.getMinutes();
    return mins >= 0 && mins <= (GRID_END - GRID_START) * 60 ? mins : null;
  });

  useEffect(() => {
    function update() {
      const now = new Date();
      const mins = (now.getHours() - GRID_START) * 60 + now.getMinutes();
      setPx(mins >= 0 && mins <= (GRID_END - GRID_START) * 60 ? mins : null);
    }
    // Align tick to the next whole minute
    const msToNextMin = 60000 - (Date.now() % 60000);
    const timeout = setTimeout(() => {
      update();
      const interval = setInterval(update, 60000);
      return () => clearInterval(interval);
    }, msToNextMin);
    return () => clearTimeout(timeout);
  }, []);

  return px;
}

function TimeGridView({
  days, sessions, dragOverSlot, onDragOver, onDragLeave, onDrop, onDelete,
  draggingId, onSessionDragStart, onDragEnd,
  resizePreview, onResizeStart,
}: {
  days: Date[];
  sessions: CalendarSession[];
  dragOverSlot: string | null;
  onDragOver: (e: React.DragEvent, key: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, date: Date, time: string) => void;
  onDelete: (id: string) => void;
  draggingId: string | null;
  onSessionDragStart: (id: string) => void;
  onDragEnd: () => void;
  resizePreview: ResizePreview | null;
  onResizeStart: (sessionId: string, edge: "top" | "bottom", originY: number, originTop: number, originDuration: number) => void;
}) {
  const nowPx = useCurrentTimePx();

  /** Compute which 15-min slot the cursor is over, snapping to the nearest 15 minutes. */
  function slotFromEvent(e: React.DragEvent): string {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = Math.max(0, e.clientY - rect.top);
    // 1px = 1min; snap to nearest 15-min increment
    return pxToTime(snap15(y));
  }

  // 15-minute slot slots for highlight (4 per hour × 15 hours = 60 slots, 15px each)
  const SLOT_PX_15 = 15;
  const NUM_SLOTS_15 = (GRID_END - GRID_START) * 4;
  const slots15 = Array.from({ length: NUM_SLOTS_15 }, (_, i) => i);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Sticky day headers */}
      <div className="flex shrink-0 border-b bg-card z-10">
        <div className="w-14 shrink-0" /> {/* gutter */}
        {days.map(day => (
          <div key={day.toISOString()} className="flex-1 py-2 text-center border-l">
            <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
            <div className={cn(
              "text-sm font-semibold mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full",
              isToday(day) && "bg-primary text-primary-foreground",
            )}>
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Scrollable time body */}
      <div className="flex flex-1 min-h-0 overflow-auto">

        {/* Time labels — even slots + one extra label at the grid's end hour */}
        <div className="w-14 shrink-0 border-r relative" style={{ height: GRID_H + 8 }}>
          {[...Array.from({ length: NUM_SLOTS }, (_, i) => i).filter(i => i % 2 === 0), NUM_SLOTS].map(i => (
            <div
              key={i}
              className="absolute right-2 text-xs text-muted-foreground whitespace-nowrap"
              style={{ top: i * SLOT_PX - 7 }}
            >
              {fmtTimeLabel(slotToTime(i))}
            </div>
          ))}
        </div>

        {/* Day columns — each column is the drop target; slot is calculated from mouse Y */}
        <div className="flex flex-1">
          {days.map(day => {
            const dayKey  = format(day, "yyyy-MM-dd");
            const dayAll  = sessions.filter(s => isSameDay(toLocalDate(s.sessionDate), day));
            const timed   = dayAll.filter(s =>  s.startTime);
            const untimed = dayAll.filter(s => !s.startTime);

            return (
              <div
                key={day.toISOString()}
                className="flex-1 border-l relative"
                style={{ height: GRID_H }}
                onDragOver={e => {
                  e.preventDefault();
                  onDragOver(e, `${dayKey}_${slotFromEvent(e)}`);
                }}
                onDragLeave={onDragLeave}
                onDrop={e => {
                  e.preventDefault();
                  onDrop(e, day, slotFromEvent(e));
                }}
              >
                {/* Horizontal grid lines + slot highlight at 15-min resolution.
                    pointer-events-none so they never intercept drag events. */}
                {slots15.map(i => {
                  // Build the time string for this 15-min slot
                  const totalMins = GRID_START * 60 + i * 15;
                  const hh = Math.floor(totalMins / 60);
                  const mm = totalMins % 60;
                  const slotTime = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
                  const slotKey  = `${dayKey}_${slotTime}`;
                  const isHour   = i % 4 === 0;
                  const isHalf   = i % 2 === 0;
                  const showLine = isHour || isHalf; // only draw lines at 30-min boundaries
                  return (
                    <div
                      key={i}
                      className={cn(
                        "absolute left-0 right-0 pointer-events-none transition-colors",
                        showLine && "border-t",
                        isHour ? "border-border/60" : "border-border/35",
                        dragOverSlot === slotKey && "bg-primary/15",
                      )}
                      style={{ top: i * SLOT_PX_15, height: SLOT_PX_15 }}
                    />
                  );
                })}

                {/* Current-time indicator — only on today's column */}
                {isToday(day) && nowPx !== null && (
                  <div
                    className="absolute left-0 right-0 z-30 pointer-events-none"
                    style={{ top: nowPx }}
                  >
                    {/* Dot on the left edge */}
                    <div className="absolute -left-1 -top-1.5 w-2.5 h-2.5 rounded-full bg-red-500" />
                    {/* Horizontal line */}
                    <div className="h-px bg-red-500 w-full" />
                  </div>
                )}

                {/* Untimed sessions — stacked at the very top */}
                {untimed.map((s, idx) => {
                  const color = sessionColor(s);
                  const names = s.sessionStudents.map(ss =>
                    `${ss.student.firstName} ${ss.student.lastName.charAt(0)}.`
                  ).join(", ");
                  return (
                    <SessionEventMenu key={s.id} session={s} onDelete={onDelete}>
                      <Link
                        href={`/sessions/${s.id}`}
                        draggable
                        onDragStart={e => { sessionDragStart(e, s.id); onSessionDragStart(s.id); }}
                        onDragEnd={onDragEnd}
                        className={cn(
                          "absolute left-0.5 right-0.5 z-20 rounded border px-1.5 py-0.5 text-xs",
                          "leading-tight overflow-hidden transition-all cursor-grab active:cursor-grabbing",
                          color,
                          s.isCancelled && "opacity-40 line-through",
                          draggingId === s.id ? "opacity-30 ring-2 ring-primary/40" : "hover:opacity-85",
                        )}
                        style={{ top: idx * (SLOT_PX + 2), height: SLOT_PX - 2 }}
                      >
                        <span className="font-medium truncate block">{names}</span>
                      </Link>
                    </SessionEventMenu>
                  );
                })}

                {/* Timed sessions — positioned by start time */}
                {timed.map(s => {
                  const baseTop    = minsFromStart(s.startTime!);
                  const baseDur    = Math.max(15, s.durationMins ?? 30);
                  // Use live resize preview if this session is being resized
                  const isResizing = resizePreview?.sessionId === s.id;
                  const top    = isResizing ? resizePreview!.top    : baseTop;
                  const height = isResizing ? resizePreview!.height : Math.max(SLOT_PX - 2, baseDur);
                  const color  = sessionColor(s);
                  const names  = s.sessionStudents.map(ss =>
                    `${ss.student.firstName} ${ss.student.lastName.charAt(0)}.`
                  ).join(", ");
                  const label  = SESSION_TYPE_LABELS[s.sessionType] ?? s.sessionType;
                  return (
                    <SessionEventMenu key={s.id} session={s} onDelete={onDelete}>
                      {/* Outer div is the drag source — covers the full block including resize handles */}
                      <div
                        draggable
                        onDragStart={e => {
                          // If a resize just started on this gesture, cancel the drag
                          if (isResizing) { e.preventDefault(); return; }
                          sessionDragStart(e, s.id);
                          onSessionDragStart(s.id);
                        }}
                        onDragEnd={onDragEnd}
                        className={cn(
                          "absolute left-0.5 right-0.5 z-20 rounded border text-xs overflow-hidden",
                          "select-none cursor-grab active:cursor-grabbing",
                          color,
                          s.isCancelled && "opacity-40",
                          draggingId === s.id ? "opacity-30 ring-2 ring-primary/40" : "",
                          isResizing && "ring-2 ring-primary/60 shadow-md cursor-ns-resize",
                        )}
                        style={{ top, height }}
                      >
                        {/* Top resize handle — mousedown preventDefault stops drag from starting */}
                        <div
                          draggable={false}
                          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-30 hover:bg-primary/20 rounded-t"
                          onMouseDown={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            onResizeStart(s.id, "top", e.clientY, baseTop, baseDur);
                          }}
                        />

                        {/* Link for navigation — not the drag source */}
                        <Link
                          href={`/sessions/${s.id}`}
                          draggable={false}
                          className={cn(
                            "block w-full h-full px-1.5 py-1",
                            s.isCancelled && "line-through",
                          )}
                          onClick={e => {
                            // Prevent navigation if this block was just dragged
                            if (draggingId === s.id) e.preventDefault();
                          }}
                        >
                          <div className="font-medium truncate leading-tight pt-1">{names}</div>
                          {height > 36 && (
                            <div className="opacity-70 truncate leading-tight">{label}</div>
                          )}
                        </Link>

                        {/* Bottom resize handle — mousedown preventDefault stops drag from starting */}
                        <div
                          draggable={false}
                          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-30 hover:bg-primary/20 rounded-b"
                          onMouseDown={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            onResizeStart(s.id, "bottom", e.clientY, baseTop, baseDur);
                          }}
                        />
                      </div>
                    </SessionEventMenu>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DashboardCalendarProps {
  initialSessions: CalendarSession[];
}

export function DashboardCalendar({ initialSessions }: DashboardCalendarProps) {
  const router = useRouter();

  const [view, setView]               = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions]       = useState<CalendarSession[]>(initialSessions);
  const [loading, setLoading]         = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  // New-session dialog state
  const [draft, setDraft]               = useState<NewSessionDraft | null>(null);
  const [draftType, setDraftType]       = useState("INDIVIDUAL");
  const [draftDuration, setDraftDuration] = useState("30");
  const [draftTime, setDraftTime]       = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [creating, setCreating]         = useState(false);

  // Delete confirmation dialog state
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [deleting, setDeleting]   = useState(false);

  // Session-move drag state
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);

  // Resize state (mouse-based, not HTML5 drag)
  const resizingRef = useRef<{
    sessionId: string;
    edge: "top" | "bottom";
    originY: number;
    originTop: number;    // px from grid top
    originDuration: number; // mins
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null);

  // ── Fetch sessions for the visible range ──────────────────────────────────

  const fetchSessions = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({
        startDate: format(start, "yyyy-MM-dd"),
        endDate:   format(end,   "yyyy-MM-dd"),
      });
      const res = await fetch(`/api/sessions?${p}`);
      if (res.ok) {
        const data = await res.json();
        // API returns `notes: [{id}]`; normalize to the boolean `hasNotes` the component expects
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSessions((data.sessions ?? []).map((s: any) => ({
          ...s,
          hasNotes: Array.isArray(s.notes) ? s.notes.length > 0 : !!s.hasNotes,
        })));
      }
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let start: Date, end: Date;
    if (view === "day") {
      start = currentDate; end = currentDate;
    } else if (view === "week") {
      start = startOfWeek(currentDate, { weekStartsOn: 0 });
      end   = endOfWeek(currentDate,   { weekStartsOn: 0 });
    } else {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      start = startOfWeek(ms, { weekStartsOn: 0 });
      end   = endOfWeek(me,   { weekStartsOn: 0 });
    }
    fetchSessions(start, end);
  }, [view, currentDate, fetchSessions]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  function navigate(dir: 1 | -1) {
    setCurrentDate(prev => {
      if (view === "day")   return dir > 0 ? addDays(prev, 1)    : subDays(prev, 1);
      if (view === "week")  return dir > 0 ? addWeeks(prev, 1)   : subWeeks(prev, 1);
      return                               dir > 0 ? addMonths(prev, 1)  : subMonths(prev, 1);
    });
  }

  function getLabel(): string {
    if (view === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    if (view === "week") {
      const s = startOfWeek(currentDate, { weekStartsOn: 0 });
      const e = endOfWeek(currentDate,   { weekStartsOn: 0 });
      const sameMonth = format(s, "MMM") === format(e, "MMM");
      return `${format(s, "MMM d")} – ${sameMonth ? format(e, "d, yyyy") : format(e, "MMM d, yyyy")}`;
    }
    return format(currentDate, "MMMM yyyy");
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent, slotKey: string) {
    e.preventDefault();
    // "move" cursor when rescheduling an existing session, "copy" when creating new
    e.dataTransfer.dropEffect = draggingSessionId ? "move" : "copy";
    setDragOverSlot(slotKey);
  }

  function handleDragLeave() {
    setDragOverSlot(null);
  }

  function handleDrop(e: React.DragEvent, date: Date, startTime: string) {
    e.preventDefault();
    setDragOverSlot(null);
    setDraggingSessionId(null);
    try {
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return;
      const data = JSON.parse(raw);

      if (data.type === "session-move") {
        // Reschedule existing session
        handleSessionMove(data.sessionId, date, startTime);
      } else {
        // Create new session from student drop
        const { studentId, studentName } = data;
        setDraft({ studentId, studentName, date, startTime });
        setDraftType("INDIVIDUAL");
        setDraftDuration("30");
        setDraftTime(startTime);
        setDraftLocation("");
      }
    } catch { /* ignore */ }
  }

  // ── Reschedule (move) session ──────────────────────────────────────────────

  async function handleSessionMove(sessionId: string, date: Date, startTime: string) {
    const prev = sessions.find(s => s.id === sessionId);
    if (!prev) return;

    // Optimistic update — snap to new date/time immediately
    const newLocalDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    setSessions(s => s.map(sess =>
      sess.id === sessionId
        ? { ...sess, sessionDate: newLocalDate, startTime: startTime || sess.startTime }
        : sess
    ));

    try {
      const body: Record<string, string> = {
        sessionDate: format(date, "yyyy-MM-dd"),
      };
      if (startTime) body.startTime = startTime;

      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success("Session rescheduled");
      router.refresh();
    } catch {
      // Revert optimistic update on failure
      setSessions(s => s.map(sess => sess.id === sessionId ? prev : sess));
      toast.error("Failed to reschedule session");
    }
  }

  // ── Resize session (mouse drag on top/bottom handle) ──────────────────────

  function handleResizeStart(
    sessionId: string,
    edge: "top" | "bottom",
    originY: number,
    originTop: number,
    originDuration: number,
  ) {
    resizingRef.current = { sessionId, edge, originY, originTop, originDuration };
    setResizePreview({ sessionId, top: originTop, height: Math.max(SLOT_PX - 2, originDuration) });
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const r = resizingRef.current;
      if (!r) return;
      const deltaPx = e.clientY - r.originY; // 1px = 1min

      let newTop: number;
      let newHeight: number;

      if (r.edge === "bottom") {
        newTop = r.originTop;
        newHeight = Math.max(15, snap15(r.originDuration + deltaPx));
      } else {
        // top handle: move the start, shrink/grow duration
        const rawTop = r.originTop + deltaPx;
        newTop = Math.max(0, Math.min(GRID_H - 15, snap15(rawTop)));
        newHeight = Math.max(15, r.originTop + r.originDuration - newTop);
      }

      setResizePreview({ sessionId: r.sessionId, top: newTop, height: newHeight });
    }

    async function onMouseUp() {
      const r = resizingRef.current;
      resizingRef.current = null;
      if (!r || !resizePreview) {
        setResizePreview(null);
        return;
      }

      const { top, height } = resizePreview;
      const newStartTime = pxToTime(top);
      const newDuration  = Math.max(15, Math.round(height));

      // Optimistic update
      const prev = sessions.find(s => s.id === r.sessionId);
      setSessions(s => s.map(sess =>
        sess.id === r.sessionId
          ? { ...sess, startTime: newStartTime, durationMins: newDuration }
          : sess
      ));
      setResizePreview(null);

      try {
        const res = await fetch(`/api/sessions/${r.sessionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startTime: newStartTime, durationMins: newDuration }),
        });
        if (!res.ok) throw new Error();
        toast.success("Session updated");
        router.refresh();
      } catch {
        if (prev) setSessions(s => s.map(sess => sess.id === r.sessionId ? prev : sess));
        toast.error("Failed to update session");
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizePreview, sessions]);

  // ── Create session ─────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!draft) return;
    setCreating(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionDate:  format(draft.date, "yyyy-MM-dd"),
          sessionType:  draftType,
          startTime:    draftTime || undefined,
          durationMins: parseInt(draftDuration) || 30,
          location:     draftLocation || undefined,
          studentIds:   [draft.studentId],
        }),
      });
      if (!res.ok) throw new Error();
      const { session } = await res.json();
      toast.success("Session scheduled");
      setDraft(null);
      // Optimistic update so the event appears immediately.
      // Use toLocalDate so the event lands on the correct calendar cell.
      const firstName = draft.studentName.split(" ")[0];
      const lastName  = draft.studentName.split(" ").slice(1).join(" ");
      setSessions(prev => [...prev, {
        ...session,
        sessionDate: toLocalDate(session.sessionDate ?? draft.date),
        hasNotes: false,
        sessionStudents: [{ student: { id: draft.studentId, firstName, lastName } }],
      }]);
      router.refresh();
    } catch {
      toast.error("Failed to create session");
    } finally {
      setCreating(false);
    }
  }

  // ── Delete session ─────────────────────────────────────────────────────────

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sessions/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Session deleted");
      setSessions(prev => prev.filter(s => s.id !== deleteId));
      setDeleteId(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete session");
    } finally {
      setDeleting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const viewDays = view === "month" ? [] : view === "week"
    ? getWeekDays(currentDate)
    : [currentDate];

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={resizePreview ? { cursor: "ns-resize", userSelect: "none" } : undefined}
    >

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 pb-3 shrink-0 flex-wrap">
        {/* View toggle */}
        <div className="flex rounded-md border overflow-hidden shrink-0">
          {(["day", "week", "month"] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
            onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Period label */}
        <span className="text-sm font-semibold flex-1 flex items-center gap-1.5 min-w-0">
          <span className="truncate">{getLabel()}</span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
        </span>

        {/* New session button */}
        <Button asChild variant="outline" size="sm" className="h-7 shrink-0 gap-1">
          <Link href="/sessions/new">
            <Plus className="h-3.5 w-3.5" />
            New
          </Link>
        </Button>
      </div>

      {/* ── Calendar body ── */}
      <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-card">
        {view === "month" ? (
          <MonthView
            currentDate={currentDate}
            sessions={sessions}
            dragOverSlot={dragOverSlot}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDelete={setDeleteId}
            draggingId={draggingSessionId}
            onSessionDragStart={setDraggingSessionId}
            onDragEnd={() => setDraggingSessionId(null)}
          />
        ) : (
          <TimeGridView
            days={viewDays}
            sessions={sessions}
            dragOverSlot={dragOverSlot}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDelete={setDeleteId}
            draggingId={draggingSessionId}
            onSessionDragStart={setDraggingSessionId}
            onDragEnd={() => setDraggingSessionId(null)}
            resizePreview={resizePreview}
            onResizeStart={handleResizeStart}
          />
        )}
      </div>

      {/* ── Create-session dialog ── */}
      <Dialog open={!!draft} onOpenChange={open => { if (!open) setDraft(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Schedule Session</DialogTitle>
          </DialogHeader>

          {draft && (
            <div className="space-y-4 py-1">
              {/* Summary chip */}
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Student</span>
                  <span className="font-medium text-sm">{draft.studentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Date</span>
                  <span className="font-medium text-sm">{format(draft.date, "MMMM d, yyyy")}</span>
                </div>
              </div>

              {/* Session type + duration */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Session Type</Label>
                  <Select value={draftType} onValueChange={setDraftType}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SESSION_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Duration (min)</Label>
                  <Input
                    type="number" min={5} max={180}
                    value={draftDuration}
                    onChange={e => setDraftDuration(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Time + location */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Time</Label>
                  <Input
                    type="time"
                    value={draftTime}
                    onChange={e => setDraftTime(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Location</Label>
                  <Input
                    value={draftLocation}
                    onChange={e => setDraftLocation(e.target.value)}
                    placeholder="e.g. Speech Room"
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Schedule Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={!!deleteId} onOpenChange={open => { if (!open && !deleting) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete the session and all associated notes and data.
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Delete Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
