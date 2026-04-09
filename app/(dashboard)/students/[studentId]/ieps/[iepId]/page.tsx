import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getIEPById } from "@/lib/queries/ieps";
import { getStudentById } from "@/lib/queries/students";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { IEPStatusBadge, GoalStatusBadge, GoalDomainBadge } from "@/components/shared/status-badge";
import { formatDate, getUrgencyLevel } from "@/lib/utils/format-date";
import {
  Plus, Pencil, CheckCircle2, Circle, ChevronRight,
  CalendarDays, Clock, MapPin, Target, BookOpen,
  ClipboardList, BarChart3, MessageSquare, AlertTriangle,
  Users, Info, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── PLAAFP section parser ─────────────────────────────────────────────────────
// Supports structured storage format:  ## Section Heading\n content\n\n## Next
function parsePLAAFP(raw?: string | null): { sections: Record<string, string> | null } {
  if (!raw?.trim()) return { sections: null };
  const hasSections = /^##\s+\w/m.test(raw);
  if (!hasSections) return { sections: null };
  const sections: Record<string, string> = {};
  const re = /^##\s+(.+)\n([\s\S]*?)(?=\n##\s+|\s*$)/gm;
  for (const m of raw.matchAll(re)) {
    const val = m[2].trim();
    if (val) sections[m[1].trim()] = val;
  }
  return { sections: Object.keys(sections).length > 0 ? sections : null };
}

// ─── Completion helpers ────────────────────────────────────────────────────────
type IEP     = NonNullable<Awaited<ReturnType<typeof getIEPById>>>;
type Student = NonNullable<Awaited<ReturnType<typeof getStudentById>>>;

function getCompletion(iep: IEP, student: Student) {
  const checks = {
    "Meeting date":        !!(iep.meetingDate),
    "Present Levels":      !!(iep.presentLevels?.trim()),
    "Active goals":        iep.goals.some(g => g.status === "ACTIVE"),
    "Service minutes":     !!(iep.minutesPerWeek),
    "Accommodations":      !!(student.accommodations?.trim()),
    "Progress reporting":  iep.goals.some(g => g.reportingPeriod?.trim()),
    "Parent input":        !!(iep.parentConcerns?.trim()),
    "Next eval date":      !!(iep.nextEvalDate),
  };
  const done    = Object.values(checks).filter(Boolean).length;
  const total   = Object.values(checks).length;
  const missing = (Object.entries(checks) as [string, boolean][])
    .filter(([, v]) => !v).map(([k]) => k);
  return { checks, done, total, missing };
}

// ─── Section card ──────────────────────────────────────────────────────────────
function SectionCard({
  id, icon: Icon, title, subtitle, editHref, complete, empty, children,
}: {
  id?: string; icon: React.ElementType; title: string; subtitle?: string;
  editHref?: string; complete?: boolean; empty?: boolean; children: React.ReactNode;
}) {
  return (
    <div id={id} className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg shrink-0",
            complete ? "bg-emerald-50" : empty ? "bg-amber-50/70" : "bg-muted/60"
          )}>
            <Icon className={cn(
              "h-3.5 w-3.5",
              complete ? "text-emerald-600" : empty ? "text-amber-500" : "text-muted-foreground"
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
              {complete && (
                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-px">
                  Complete
                </span>
              )}
              {empty && !complete && (
                <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-px">
                  Needs attention
                </span>
              )}
            </div>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {editHref && (
          <Button asChild variant="ghost" size="sm" className="h-7 px-2.5 text-xs shrink-0 ml-3">
            <Link href={editHref}><Pencil className="h-3 w-3 mr-1" />Edit</Link>
          </Button>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Field row ─────────────────────────────────────────────────────────────────
function FieldRow({
  icon: Icon, label, value, urgent,
}: {
  icon?: React.ElementType; label: string; value?: React.ReactNode; urgent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b last:border-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-[160px]">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        {label}
      </div>
      <div className={cn("text-sm font-medium text-right", urgent && "text-amber-700")}>
        {value ?? <span className="text-muted-foreground/40 font-normal text-xs italic">Not set</span>}
      </div>
    </div>
  );
}

// ─── Empty field prompt ────────────────────────────────────────────────────────
function EmptyPrompt({
  icon: Icon, title, description, actionLabel, actionHref,
}: {
  icon: React.ElementType; title: string; description?: string;
  actionLabel: string; actionHref: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-amber-200/80 bg-amber-50/30 px-5 py-5 text-center">
      <Icon className="h-5 w-5 text-amber-400 mx-auto mb-2" />
      <p className="text-sm font-medium text-amber-800 mb-0.5">{title}</p>
      {description && <p className="text-xs text-amber-700/70 mb-3 max-w-xs mx-auto">{description}</p>}
      <Button asChild size="sm" variant="outline">
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function IEPDetailPage({
  params,
}: {
  params: Promise<{ studentId: string; iepId: string }>;
}) {
  const user = await requireUser();
  const { studentId, iepId } = await params;

  const [iep, student] = await Promise.all([
    getIEPById(iepId),
    getStudentById(studentId, user.id),
  ]);

  if (!iep || !student) notFound();

  const comp         = getCompletion(iep, student);
  const urgency      = getUrgencyLevel(iep.reviewDate);
  const activeGoals  = iep.goals.filter(g => g.status === "ACTIVE");
  const masteredGoals = iep.goals.filter(g => g.status === "MASTERED");
  const plaafp       = parsePLAAFP(iep.presentLevels);
  const editBase     = `/students/${studentId}/ieps/${iepId}/edit`;

  return (
    <div className="space-y-5 pb-24">

      {/* ── Overview / Status bar ──────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

          {/* Left: status + date grid */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <IEPStatusBadge status={iep.status as never} />
              {(urgency === "overdue" || urgency === "urgent") && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  <AlertTriangle className="h-3 w-3" />
                  Annual review {urgency === "overdue" ? "overdue" : "due soon"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Effective</p>
                <p className="font-semibold">{formatDate(iep.effectiveDate)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Annual Review</p>
                <p className={cn(
                  "font-semibold",
                  urgency === "overdue" && "text-rose-600",
                  urgency === "urgent"  && "text-amber-600"
                )}>{formatDate(iep.reviewDate)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Expires</p>
                <p className="font-semibold">{formatDate(iep.expirationDate)}</p>
              </div>
              {iep.minutesPerWeek != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Service</p>
                  <p className="font-semibold">{iep.minutesPerWeek} min/wk</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: completion meter */}
          <div className="shrink-0 min-w-[160px]">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/60 transition-all"
                  style={{ width: `${(comp.done / comp.total) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {comp.done}/{comp.total}
              </span>
            </div>
            {comp.missing.length > 0 ? (
              <p className="text-xs text-muted-foreground leading-snug">
                <span className="font-medium text-amber-700">Missing: </span>
                {comp.missing.slice(0, 3).join(", ")}
                {comp.missing.length > 3 && (
                  <span className="text-muted-foreground/60"> +{comp.missing.length - 3} more</span>
                )}
              </p>
            ) : (
              <p className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />All sections complete
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── 1. Dates & Compliance ─────────────────────────────────────────── */}
      <SectionCard
        id="dates"
        icon={CalendarDays}
        title="Dates & Compliance"
        subtitle="Key compliance dates — all fields required for a complete IEP"
        editHref={editBase}
        complete={!!(iep.effectiveDate && iep.reviewDate && iep.expirationDate && iep.meetingDate && iep.nextEvalDate)}
        empty={!iep.meetingDate || !iep.nextEvalDate}
      >
        <div className="rounded-xl border divide-y overflow-hidden">
          <FieldRow icon={CalendarDays} label="Effective Date"     value={formatDate(iep.effectiveDate)} />
          <FieldRow
            icon={CalendarDays}
            label="Annual Review Date"
            value={formatDate(iep.reviewDate)}
            urgent={urgency === "overdue" || urgency === "urgent"}
          />
          <FieldRow icon={CalendarDays} label="Expiration Date"    value={formatDate(iep.expirationDate)} />
          <FieldRow icon={Users}        label="IEP Meeting Date"   value={iep.meetingDate  ? formatDate(iep.meetingDate)  : undefined} />
          <FieldRow icon={Clock}        label="Next Evaluation"    value={iep.nextEvalDate ? formatDate(iep.nextEvalDate) : undefined} />
        </div>
        {!iep.meetingDate && (
          <p className="text-xs text-amber-700 flex items-center gap-1.5 mt-3">
            <Info className="h-3.5 w-3.5 shrink-0" />
            IEP meeting date is required for a complete, compliant record.
          </p>
        )}
      </SectionCard>

      {/* ── 2. Present Levels (PLAAFP) ────────────────────────────────────── */}
      <SectionCard
        id="plaafp"
        icon={BookOpen}
        title="Present Levels (PLAAFP)"
        subtitle="Current academic achievement and functional performance — the legal basis for all goals and services"
        editHref={editBase}
        complete={!!iep.presentLevels?.trim()}
        empty={!iep.presentLevels?.trim()}
      >
        {iep.presentLevels?.trim() ? (
          plaafp.sections ? (
            /* Structured sections (created via the redesigned form) */
            <div className="space-y-5">
              {Object.entries(plaafp.sections).map(([heading, text]) => (
                <div key={heading}>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                    {heading}
                  </p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{text}</p>
                </div>
              ))}
            </div>
          ) : (
            /* Raw text fallback */
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {iep.presentLevels}
            </p>
          )
        ) : (
          <EmptyPrompt
            icon={BookOpen}
            title="Present Levels not written yet"
            description="PLAAFP is legally required and forms the foundation for all goals, services, and accommodations."
            actionLabel="Write Present Levels"
            actionHref={editBase}
          />
        )}
      </SectionCard>

      {/* ── 3. Goals ─────────────────────────────────────────────────────── */}
      <SectionCard
        id="goals"
        icon={Target}
        title={`Goals (${activeGoals.length} active${masteredGoals.length > 0 ? `, ${masteredGoals.length} mastered` : ""})`}
        subtitle="Measurable annual goals tied to this IEP"
        complete={activeGoals.length > 0}
        empty={activeGoals.length === 0}
      >
        {iep.goals.length === 0 ? (
          <EmptyPrompt
            icon={Target}
            title="No goals added yet"
            description="Every IEP must include measurable annual goals derived from the PLAAFP."
            actionLabel="Add First Goal"
            actionHref={`/students/${studentId}/goals/new?iepId=${iepId}`}
          />
        ) : (
          <div className="space-y-3">
            {activeGoals.length > 0 && (
              <div className="rounded-xl border divide-y overflow-hidden">
                {activeGoals.map((goal) => {
                  const latest    = goal.dataPoints[0];
                  const latestPct = latest ? Math.round(latest.accuracy * 100) : null;
                  const targetPct = Math.round(goal.targetAccuracy * 100);
                  const basePct   = goal.baselineScore != null ? Math.round(goal.baselineScore * 100) : null;
                  const atTarget  = latestPct != null && latestPct >= targetPct;
                  return (
                    <Link
                      key={goal.id}
                      href={`/students/${studentId}/goals/${goal.id}`}
                      className="flex items-start gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group"
                    >
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <GoalDomainBadge domain={goal.domain} />
                          <GoalStatusBadge status={goal.status as never} />
                        </div>

                        {/* Goal text */}
                        {goal.shortName && (
                          <p className="text-sm font-semibold text-foreground leading-snug">{goal.shortName}</p>
                        )}
                        <p className={cn(
                          "text-sm leading-relaxed",
                          goal.shortName ? "text-muted-foreground line-clamp-2" : "text-foreground font-medium line-clamp-3"
                        )}>
                          {goal.goalText}
                        </p>

                        {/* Stats row */}
                        <div className="flex items-center gap-4 flex-wrap">
                          {basePct != null && (
                            <span className="text-xs text-muted-foreground">
                              Baseline <span className="font-semibold text-foreground tabular-nums">{basePct}%</span>
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Target <span className="font-semibold text-primary tabular-nums">{targetPct}%</span>
                          </span>
                          {latestPct != null && (
                            <span className="text-xs text-muted-foreground">
                              Latest{" "}
                              <span className={cn(
                                "font-semibold tabular-nums",
                                atTarget ? "text-emerald-600" : "text-foreground"
                              )}>{latestPct}%</span>
                            </span>
                          )}
                          {goal.reportingPeriod && (
                            <span className="text-xs text-muted-foreground italic">{goal.reportingPeriod}</span>
                          )}
                          <span className="text-xs text-muted-foreground/60">
                            {goal.dataPoints.length} data pt{goal.dataPoints.length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {/* Mini progress bar */}
                        {latestPct != null && (
                          <div className="h-1 w-full max-w-xs bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", atTarget ? "bg-emerald-400" : "bg-primary/60")}
                              style={{ width: `${Math.min((latestPct / targetPct) * 100, 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 mt-1 transition-colors" />
                    </Link>
                  );
                })}
              </div>
            )}

            {masteredGoals.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 px-5 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <p className="text-xs font-semibold text-emerald-700">
                    {masteredGoals.length} mastered goal{masteredGoals.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {masteredGoals.map(g => (
                    <Link
                      key={g.id}
                      href={`/students/${studentId}/goals/${g.id}`}
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      {g.shortName ?? g.goalText.slice(0, 45)}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`/students/${studentId}/goals/new?iepId=${iepId}`}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Add Another Goal
              </Link>
            </Button>
          </div>
        )}
      </SectionCard>

      {/* ── 4. Services ───────────────────────────────────────────────────── */}
      <SectionCard
        id="services"
        icon={Clock}
        title="Services"
        subtitle="Speech-language service delivery — minutes, setting, and model"
        editHref={editBase}
        complete={!!(iep.minutesPerWeek)}
        empty={!iep.minutesPerWeek}
      >
        {iep.minutesPerWeek || iep.serviceLocation ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total min/week",  val: iep.minutesPerWeek },
                { label: "Individual",      val: iep.individualMinutes },
                { label: "Group",           val: iep.groupMinutes },
              ].map(({ label, val }) => (
                <div key={label} className="rounded-lg bg-muted/40 px-3 py-3 text-center">
                  <p className="text-xl font-bold tabular-nums">{val ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {iep.serviceLocation && (
              <div className="rounded-xl border overflow-hidden">
                <FieldRow icon={MapPin} label="Location / Model" value={iep.serviceLocation} />
              </div>
            )}
          </div>
        ) : (
          <EmptyPrompt
            icon={Clock}
            title="No service details recorded"
            description=""
            actionLabel="Add Service Minutes"
            actionHref={editBase}
          />
        )}
      </SectionCard>

      {/* ── 5. Accommodations & Supports ──────────────────────────────────── */}
      <SectionCard
        id="accommodations"
        icon={ClipboardList}
        title="Accommodations & Supports"
        subtitle="Instructional accommodations that support communication and classroom access"
        complete={!!(student.accommodations?.trim())}
        empty={!student.accommodations?.trim()}
      >
        {student.accommodations?.trim() ? (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {student.accommodations}
          </p>
        ) : (
          <div className="rounded-lg border border-dashed border-muted px-5 py-5 text-center">
            <ClipboardList className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-0.5">No accommodations recorded</p>
            <p className="text-xs text-muted-foreground/60 mb-3">
              Accommodations are managed on the student profile and displayed here automatically.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/students/${studentId}/edit`}>Edit Student Profile</Link>
            </Button>
          </div>
        )}
      </SectionCard>

      {/* ── 6. Progress Monitoring ────────────────────────────────────────── */}
      <SectionCard
        id="progress"
        icon={BarChart3}
        title="Progress Monitoring"
        subtitle="How and when progress toward each goal will be measured and reported"
        complete={iep.goals.some(g => g.reportingPeriod?.trim())}
        empty={!iep.goals.some(g => g.reportingPeriod?.trim())}
      >
        {iep.goals.filter(g => g.reportingPeriod?.trim()).length > 0 ? (
          <div className="space-y-3">
            <div className="rounded-xl border divide-y overflow-hidden">
              {iep.goals.filter(g => g.reportingPeriod?.trim()).map(goal => (
                <div key={goal.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <GoalDomainBadge domain={goal.domain} />
                    <p className="text-sm text-foreground truncate">
                      {goal.shortName ?? goal.goalText.slice(0, 50)}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-foreground shrink-0">
                    {goal.reportingPeriod}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Progress is tracked via session data points and reported to the IEP team per the schedule above.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-muted px-5 py-5 text-center">
            <BarChart3 className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-0.5">No reporting schedule set</p>
            <p className="text-xs text-muted-foreground/60 mb-3">
              Set a reporting period on each goal (e.g. "Quarterly", "Semester").
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/students/${studentId}/goals`}>Edit Goals</Link>
            </Button>
          </div>
        )}
      </SectionCard>

      {/* ── 7. Parent Input & Concerns ────────────────────────────────────── */}
      <SectionCard
        id="parent-input"
        icon={MessageSquare}
        title="Parent Input & Concerns"
        subtitle="Family priorities and concerns documented at the IEP meeting"
        editHref={editBase}
        complete={!!(iep.parentConcerns?.trim())}
        empty={!iep.parentConcerns?.trim()}
      >
        {iep.parentConcerns?.trim() ? (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {iep.parentConcerns}
          </p>
        ) : (
          <EmptyPrompt
            icon={MessageSquare}
            title="No parent input recorded yet"
            description=""
            actionLabel="Add Parent Input"
            actionHref={editBase}
          />
        )}
      </SectionCard>

      {/* ── Transition notes (conditional) ────────────────────────────────── */}
      {iep.transitionNotes?.trim() && (
        <SectionCard
          id="transition"
          icon={FileText}
          title="Transition Notes"
          subtitle="Transition planning and post-secondary goals"
          editHref={editBase}
          complete
        >
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {iep.transitionNotes}
          </p>
        </SectionCard>
      )}

      {/* ── Sticky action bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-56 right-0 border-t bg-card/95 backdrop-blur-sm px-8 py-3.5 flex items-center justify-between z-10">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Circle className={cn(
            "h-2 w-2 rounded-full shrink-0",
            comp.done === comp.total
              ? "fill-emerald-500 text-emerald-500"
              : "fill-amber-400 text-amber-400"
          )} />
          {comp.done === comp.total
            ? "All sections complete"
            : `${comp.done} of ${comp.total} sections complete`}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/students/${studentId}/ieps`}>← Back</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={editBase}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit IEP
            </Link>
          </Button>
        </div>
      </div>

    </div>
  );
}
