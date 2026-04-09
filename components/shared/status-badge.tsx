import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/*
 * Status badges — all use muted, pill-shaped tints.
 * Design principle: soft background + darker text of same hue.
 * Borders are a step darker than the background for quiet definition.
 * font-medium keeps them readable without feeling aggressive.
 */

type IEPStatus = "DRAFT" | "ACTIVE" | "IN_REVIEW" | "EXPIRED" | "DISCONTINUED";
type GoalStatus = "ACTIVE" | "MASTERED" | "DISCONTINUED" | "ON_HOLD";
type AttendanceStatus =
  | "PRESENT"
  | "ABSENT_EXCUSED"
  | "ABSENT_UNEXCUSED"
  | "CANCELLED_SLP"
  | "CANCELLED_SCHOOL"
  | "MAKEUP";

const IEP_LABELS: Record<IEPStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  IN_REVIEW: "In Review",
  EXPIRED: "Expired",
  DISCONTINUED: "Discontinued",
};

const GOAL_LABELS: Record<GoalStatus, string> = {
  ACTIVE: "Active",
  MASTERED: "Mastered",
  DISCONTINUED: "Discontinued",
  ON_HOLD: "On Hold",
};

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT_EXCUSED: "Absent (Excused)",
  ABSENT_UNEXCUSED: "Absent",
  CANCELLED_SLP: "Cancelled (SLP)",
  CANCELLED_SCHOOL: "Cancelled (School)",
  MAKEUP: "Makeup",
};

export function IEPStatusBadge({ status }: { status: IEPStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium",
        status === "ACTIVE" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        status === "IN_REVIEW" &&
          "border-amber-200 bg-amber-50 text-amber-700",
        status === "EXPIRED" &&
          "border-rose-200 bg-rose-50 text-rose-700",
        status === "DRAFT" &&
          "border-slate-200 bg-slate-50 text-slate-500",
        status === "DISCONTINUED" &&
          "border-slate-200 bg-slate-50 text-slate-400"
      )}
    >
      {IEP_LABELS[status]}
    </Badge>
  );
}

export function GoalStatusBadge({ status }: { status: GoalStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium",
        status === "ACTIVE" &&
          "border-sky-200 bg-sky-50 text-sky-700",
        status === "MASTERED" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        status === "ON_HOLD" &&
          "border-amber-200 bg-amber-50 text-amber-600",
        status === "DISCONTINUED" &&
          "border-slate-200 bg-slate-50 text-slate-400"
      )}
    >
      {GOAL_LABELS[status]}
    </Badge>
  );
}

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium",
        status === "PRESENT" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        (status === "ABSENT_EXCUSED" || status === "ABSENT_UNEXCUSED") &&
          "border-rose-200 bg-rose-50 text-rose-600",
        (status === "CANCELLED_SLP" || status === "CANCELLED_SCHOOL") &&
          "border-slate-200 bg-slate-50 text-slate-500",
        status === "MAKEUP" &&
          "border-sky-200 bg-sky-50 text-sky-700"
      )}
    >
      {ATTENDANCE_LABELS[status]}
    </Badge>
  );
}

export function GoalDomainBadge({ domain }: { domain: string }) {
  const label = domain.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Badge
      variant="outline"
      className="text-xs font-medium border-slate-200 bg-slate-50 text-slate-600"
    >
      {label}
    </Badge>
  );
}
