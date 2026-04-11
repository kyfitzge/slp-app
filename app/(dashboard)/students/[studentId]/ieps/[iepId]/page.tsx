import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getIEPById } from "@/lib/queries/ieps";
import { getStudentById } from "@/lib/queries/students";
import { notFound } from "next/navigation";
import { IEPForm } from "@/components/ieps/iep-form";
import { IEPStatusBadge, GoalDomainBadge } from "@/components/shared/status-badge";
import { formatDate, getUrgencyLevel } from "@/lib/utils/format-date";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  Plus, AlertTriangle, CheckCircle2, Target, ChevronRight, Pencil, ArrowLeft,
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
    <div className="space-y-5 pb-12">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="h-8 -ml-2 text-muted-foreground hover:text-foreground">
            <Link href={`/students/${studentId}/ieps`}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              All IEPs
            </Link>
          </Button>
          <div className="h-4 w-px bg-border" />
          <IEPStatusBadge status={iep.status as never} />
          <span className="text-sm text-muted-foreground">
            Effective {formatDate(iep.effectiveDate)}
          </span>
          {(urgency === "overdue" || urgency === "urgent") && (
            <span className={cn(
              "inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1",
              urgency === "overdue"
                ? "bg-rose-50 text-rose-700 border border-rose-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            )}>
              <AlertTriangle className="h-3 w-3" />
              {urgency === "overdue" ? "Review overdue" : "Review due soon"}
            </span>
          )}
        </div>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">

        {/* LEFT: IEP form */}
        <IEPForm studentId={studentId} iepId={iepId} defaultValues={defaultValues} />

        {/* RIGHT: Goals panel (sticky) */}
        <div className="xl:sticky xl:top-6 rounded-xl border bg-card shadow-sm overflow-hidden">

          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/20">
            <h3 className="text-sm font-semibold">Goals</h3>
            <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs">
              <Link href={`/students/${studentId}/goals/new?iepId=${iepId}`}>
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Link>
            </Button>
          </div>

          {/* Goals list */}
          <div className="p-3">
            {iep.goals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <Target className="h-8 w-8 text-muted-foreground/20 mb-2.5" />
                <p className="text-sm font-medium text-muted-foreground">No goals yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1 mb-4">
                  Add measurable annual goals tied to this IEP.
                </p>
                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                  <Link href={`/students/${studentId}/goals/new?iepId=${iepId}`}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add First Goal
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">

                {/* Active goals */}
                {activeGoals.map((goal) => {
                  const latest = goal.dataPoints[0];
                  const latestPct = latest ? Math.round(latest.accuracy * 100) : null;
                  const targetPct = Math.round(goal.targetAccuracy * 100);
                  const atTarget = latestPct != null && latestPct >= targetPct;

                  return (
                    <div
                      key={goal.id}
                      className="flex items-start gap-2.5 rounded-lg border bg-background p-3 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <GoalDomainBadge domain={goal.domain} />
                        </div>
                        {goal.shortName && (
                          <p className="text-xs font-medium text-foreground truncate">
                            {goal.shortName}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {goal.goalText}
                        </p>
                        <div className="flex items-center gap-2.5 mt-1.5">
                          <span className="text-[11px] text-muted-foreground">
                            Target <span className="font-semibold text-foreground">{targetPct}%</span>
                          </span>
                          {latestPct != null && (
                            <span className="text-[11px] text-muted-foreground">
                              Latest{" "}
                              <span className={cn("font-semibold", atTarget ? "text-emerald-600" : "text-foreground")}>
                                {latestPct}%
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button asChild variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Link href={`/students/${studentId}/goals/${goal.id}/edit`}>
                            <Pencil className="h-3 w-3" />
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Link href={`/students/${studentId}/goals/${goal.id}`}>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {/* Mastered goals */}
                {masteredGoals.length > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 mt-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <p className="text-xs font-semibold text-emerald-700">
                        {masteredGoals.length} mastered
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {masteredGoals.map((g) => (
                        <Link
                          key={g.id}
                          href={`/students/${studentId}/goals/${g.id}`}
                          className="text-xs text-emerald-700 hover:underline"
                        >
                          {g.shortName ?? g.goalText.slice(0, 40)}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
