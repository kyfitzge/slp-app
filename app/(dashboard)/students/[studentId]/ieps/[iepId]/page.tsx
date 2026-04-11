import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getIEPById } from "@/lib/queries/ieps";
import { getStudentById } from "@/lib/queries/students";
import { notFound } from "next/navigation";
import { IEPForm } from "@/components/ieps/iep-form";
import { IEPStatusBadge, GoalStatusBadge, GoalDomainBadge } from "@/components/shared/status-badge";
import { formatDate, getUrgencyLevel } from "@/lib/utils/format-date";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  Plus, AlertTriangle, CheckCircle2, Target, ChevronRight, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default async function IEPPage({
  params,
}: {
  params: Promise<{ studentId: string; iepId: string }>;
}) {
  const user = await requireUser();
  if (!user) notFound();
  const { studentId, iepId } = await params;

  const [iep, student] = await Promise.all([
    getIEPById(iepId),
    getStudentById(studentId, user.id),
  ]);

  if (!iep || !student) notFound();

  const urgency = getUrgencyLevel(iep.reviewDate);
  const activeGoals = iep.goals.filter((g) => g.status === "ACTIVE");
  const masteredGoals = iep.goals.filter((g) => g.status === "MASTERED");

  const defaultValues = {
    studentId,
    status: iep.status as never,
    effectiveDate: format(new Date(iep.effectiveDate), "yyyy-MM-dd"),
    reviewDate: format(new Date(iep.reviewDate), "yyyy-MM-dd"),
    expirationDate: format(new Date(iep.expirationDate), "yyyy-MM-dd"),
    meetingDate: iep.meetingDate ? format(new Date(iep.meetingDate), "yyyy-MM-dd") : undefined,
    nextEvalDate: iep.nextEvalDate ? format(new Date(iep.nextEvalDate), "yyyy-MM-dd") : undefined,
    minutesPerWeek: iep.minutesPerWeek ?? undefined,
    groupMinutes: iep.groupMinutes ?? undefined,
    individualMinutes: iep.individualMinutes ?? undefined,
    serviceLocation: iep.serviceLocation ?? undefined,
    presentLevels: iep.presentLevels ?? undefined,
    parentConcerns: iep.parentConcerns ?? undefined,
    transitionNotes: iep.transitionNotes ?? undefined,
  };

  return (
    <div className="space-y-6 pb-10">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <IEPStatusBadge status={iep.status as never} />
          <span className="text-sm text-muted-foreground">
            Effective {formatDate(iep.effectiveDate)}
            {" · "}
            <span className={cn(
              urgency === "overdue" && "text-rose-600 font-medium",
              urgency === "urgent"  && "text-amber-600 font-medium",
            )}>
              Review {formatDate(iep.reviewDate)}
            </span>
          </span>
          {(urgency === "overdue" || urgency === "urgent") && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              <AlertTriangle className="h-3 w-3" />
              {urgency === "overdue" ? "Review overdue" : "Review due soon"}
            </span>
          )}
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 text-xs">
          <Link href={`/students/${studentId}/ieps`}>← All IEPs</Link>
        </Button>
      </div>

      {/* ── IEP Form (all fields editable inline) ───────────────────────── */}
      <IEPForm studentId={studentId} iepId={iepId} defaultValues={defaultValues} />

      {/* ── Goals ───────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Goals</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Measurable annual goals tied to this IEP
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="h-8 text-xs">
            <Link href={`/students/${studentId}/goals/new?iepId=${iepId}`}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Goal
            </Link>
          </Button>
        </div>

        {iep.goals.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-8 text-center">
            <Target className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm font-medium text-muted-foreground mb-1">No goals yet</p>
            <p className="text-xs text-muted-foreground/70 mb-4">
              Every IEP needs measurable annual goals derived from the present levels.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/students/${studentId}/goals/new?iepId=${iepId}`}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Add First Goal
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Active goals */}
            {activeGoals.length > 0 && (
              <div className="rounded-xl border divide-y overflow-hidden">
                {activeGoals.map((goal) => {
                  const latest = goal.dataPoints[0];
                  const latestPct = latest ? Math.round(latest.accuracy * 100) : null;
                  const targetPct = Math.round(goal.targetAccuracy * 100);
                  const atTarget = latestPct != null && latestPct >= targetPct;
                  return (
                    <div key={goal.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <GoalDomainBadge domain={goal.domain} />
                          {goal.shortName && (
                            <span className="text-sm font-medium">{goal.shortName}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{goal.goalText}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground">
                            Target <span className="font-semibold text-foreground">{targetPct}%</span>
                          </span>
                          {latestPct != null && (
                            <span className="text-xs text-muted-foreground">
                              Latest{" "}
                              <span className={cn("font-semibold", atTarget ? "text-emerald-600" : "text-foreground")}>
                                {latestPct}%
                              </span>
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground/60">
                            {goal.dataPoints.length} data pt{goal.dataPoints.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2 shrink-0">
                        <Link href={`/students/${studentId}/goals/${goal.id}/edit`}>
                          <Pencil className="h-3 w-3 mr-1" />Edit
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2 shrink-0">
                        <Link href={`/students/${studentId}/goals/${goal.id}`}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Mastered goals */}
            {masteredGoals.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <p className="text-xs font-semibold text-emerald-700">
                    {masteredGoals.length} mastered goal{masteredGoals.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {masteredGoals.map((g) => (
                    <Link
                      key={g.id}
                      href={`/students/${studentId}/goals/${g.id}`}
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      {g.shortName ?? g.goalText.slice(0, 50)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
