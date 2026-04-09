import { format, formatDistanceToNow, isAfter, isBefore, addDays } from "date-fns";

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "MMM d, yyyy");
}

export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "M/d/yy");
}

export function formatTime(time: string | null | undefined): string {
  if (!time) return "—";
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function formatRelative(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function isOverdue(date: Date | string): boolean {
  return isBefore(new Date(date), new Date());
}

export function isDueSoon(date: Date | string, days = 30): boolean {
  const target = new Date(date);
  const now = new Date();
  return isAfter(target, now) && isBefore(target, addDays(now, days));
}

export function getUrgencyLevel(date: Date | string): "overdue" | "urgent" | "soon" | "ok" {
  if (isOverdue(date)) return "overdue";
  if (isDueSoon(date, 14)) return "urgent";
  if (isDueSoon(date, 30)) return "soon";
  return "ok";
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_FULL_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
