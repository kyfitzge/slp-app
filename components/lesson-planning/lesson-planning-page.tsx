"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CaseloadSidePanel } from "@/components/shared/caseload-side-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Loader2,
  Trash2,
  Plus,
  BookOpen,
  Target,
  Zap,
  Dumbbell,
  Home,
  Package,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Save,
  ClipboardList,
  History,
  Users,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel?: string | null;
  schoolName?: string | null;
  goals: { id: string; shortName?: string | null; goalText: string; domain: string; targetAccuracy: number; status: string }[];
  ieps: { id: string; status: string; reviewDate: string; studentId: string }[];
}

interface LessonPlanItem {
  id: string;
  studentId: string;
  sessionDate: string;
  sessionType: string;
  durationMins?: number | null;
  slpNotes?: string | null;
  planText: string;
  isDraft: boolean;
  createdAt: string;
}

interface PlanSection {
  title: string;
  content: string;
}

interface Props {
  students: StudentOption[];
}

const today = new Date().toISOString().split("T")[0];

const SESSION_TYPE_OPTIONS = [
  { value: "INDIVIDUAL",   label: "Individual" },
  { value: "GROUP",        label: "Group" },
  { value: "CONSULTATION", label: "Consultation" },
  { value: "EVALUATION",   label: "Evaluation" },
];

const DOMAIN_COLORS: Record<string, string> = {
  ARTICULATION:              "bg-blue-100 text-blue-700",
  PHONOLOGY:                 "bg-purple-100 text-purple-700",
  LANGUAGE_EXPRESSION:       "bg-emerald-100 text-emerald-700",
  LANGUAGE_COMPREHENSION:    "bg-teal-100 text-teal-700",
  FLUENCY:                   "bg-orange-100 text-orange-700",
  VOICE:                     "bg-pink-100 text-pink-700",
  PRAGMATICS:                "bg-yellow-100 text-yellow-700",
  AUGMENTATIVE_COMMUNICATION:"bg-indigo-100 text-indigo-700",
  LITERACY:                  "bg-red-100 text-red-700",
  SOCIAL_COMMUNICATION:      "bg-cyan-100 text-cyan-700",
};

// ─── Section parser ────────────────────────────────────────────────────────────

function parsePlanSections(text: string): PlanSection[] {
  const parts = text.split(/\n(?=## )/);
  return parts
    .map(part => {
      const lines = part.trim().split("\n");
      const titleLine = lines[0].replace(/^##\s*/, "").trim();
      const content = lines.slice(1).join("\n").trim();
      return { title: titleLine, content };
    })
    .filter(s => s.title && s.content);
}

function getSectionIcon(title: string) {
  const t = title.toUpperCase();
  if (t.includes("OBJECTIVE")) return <Target className="h-4 w-4" />;
  if (t.includes("WARM")) return <Zap className="h-4 w-4" />;
  if (t.includes("ACTIVITY")) return <Dumbbell className="h-4 w-4" />;
  if (t.includes("CLOSING")) return <CheckSquare className="h-4 w-4" />;
  if (t.includes("HOME") || t.includes("PRACTICE")) return <Home className="h-4 w-4" />;
  if (t.includes("MATERIAL")) return <Package className="h-4 w-4" />;
  return <ClipboardList className="h-4 w-4" />;
}

function getSectionColor(title: string): string {
  const t = title.toUpperCase();
  if (t.includes("OBJECTIVE")) return "border-l-violet-400 bg-violet-50/50";
  if (t.includes("WARM")) return "border-l-amber-400 bg-amber-50/50";
  if (t.includes("ACTIVITY")) return "border-l-blue-400 bg-blue-50/50";
  if (t.includes("CLOSING")) return "border-l-emerald-400 bg-emerald-50/50";
  if (t.includes("HOME") || t.includes("PRACTICE")) return "border-l-teal-400 bg-teal-50/50";
  if (t.includes("MATERIAL")) return "border-l-slate-400 bg-slate-50/50";
  return "border-l-gray-300 bg-gray-50/50";
}

// ─── Section content renderer ─────────────────────────────────────────────────

function renderSectionContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Bullet line
    if (/^[-•*]\s/.test(line)) {
      const bullets: string[] = [];
      while (i < lines.length && /^[-•*]\s/.test(lines[i])) {
        bullets.push(lines[i].replace(/^[-•*]\s/, "").trim());
        i++;
      }
      elements.push(
        <ul key={i} className="list-disc list-inside space-y-1 text-sm text-foreground/90">
          {bullets.map((b, idx) => <li key={idx}>{renderInline(b)}</li>)}
        </ul>
      );
      continue;
    }

    // Numbered line
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, "").trim());
        i++;
      }
      elements.push(
        <ol key={i} className="list-decimal list-inside space-y-1 text-sm text-foreground/90">
          {items.map((item, idx) => <li key={idx}>{renderInline(item)}</li>)}
        </ol>
      );
      continue;
    }

    // Bold label line (e.g. **Target:** ...)
    if (/^\*\*[^*]+\*\*:/.test(line)) {
      const match = line.match(/^\*\*([^*]+)\*\*:\s*(.*)/);
      if (match) {
        elements.push(
          <div key={i} className="text-sm">
            <span className="font-semibold text-foreground">{match[1]}:</span>{" "}
            <span className="text-foreground/85">{renderInline(match[2])}</span>
          </div>
        );
        i++;
        continue;
      }
    }

    // Plain paragraph
    elements.push(
      <p key={i} className="text-sm text-foreground/85 leading-relaxed">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-2">{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// ─── Plan section card ────────────────────────────────────────────────────────

function PlanSectionCard({ section }: { section: PlanSection }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className={cn("rounded-lg border-l-4 border border-border/60 overflow-hidden", getSectionColor(section.title))}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:brightness-95 transition-all"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-foreground/60">{getSectionIcon(section.title)}</span>
          <span className="text-sm font-semibold text-foreground">{section.title}</span>
        </div>
        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        }
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0.5">
          {renderSectionContent(section.content)}
        </div>
      )}
    </div>
  );
}

// ─── Goal chip ─────────────────────────────────────────────────────────────────

function GoalChip({ goal }: { goal: StudentOption["goals"][0] }) {
  const domainLabel = goal.domain.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const colorClass = DOMAIN_COLORS[goal.domain] ?? "bg-gray-100 text-gray-700";
  const name = goal.shortName ?? goal.goalText.slice(0, 40);
  return (
    <div className={cn("rounded-lg px-3 py-2 text-xs shrink-0 max-w-[180px]", colorClass)}>
      <div className="font-semibold truncate">{name}</div>
      <div className="opacity-70 mt-0.5">{domainLabel} · {Math.round(goal.targetAccuracy)}% target</div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function LessonPlanningPage({ students }: Props) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [plans, setPlans] = useState<LessonPlanItem[]>([]);
  const [activePlan, setActivePlan] = useState<LessonPlanItem | null>(null);
  const [planText, setPlanText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Form state
  const [sessionDate, setSessionDate] = useState(today);
  const [sessionType, setSessionType] = useState("INDIVIDUAL");
  const [durationMins, setDurationMins] = useState("30");
  const [slpNotes, setSlpNotes] = useState("");

  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId]
  );

  const studentPlans = useMemo(
    () => plans.filter(p => p.studentId === selectedStudentId),
    [plans, selectedStudentId]
  );

  const sections = useMemo(() => parsePlanSections(planText), [planText]);
  const hasUnsavedPlan = planText.trim().length > 0 && !activePlan;
  const hasPlan = planText.trim().length > 0;

  // ── Student selection ──────────────────────────────────────────────────────

  async function handleSelectStudent(id: string) {
    if (id === selectedStudentId) return;
    setSelectedStudentId(id);
    setActivePlan(null);
    setPlanText("");
    setShowHistory(false);
    setLoadingPlans(true);
    try {
      const res = await fetch(`/api/lesson-plans?studentId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setPlans((prev) => {
          const other = prev.filter(p => p.studentId !== id);
          return [...other, ...data.plans.map((p: LessonPlanItem) => ({ ...p, studentId: id }))];
        });
      }
    } catch { /* silent */ }
    finally { setLoadingPlans(false); }
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!selectedStudentId) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/lesson-plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudentId,
          sessionDate,
          sessionType,
          durationMins: parseInt(durationMins) || 30,
          slpNotes: slpNotes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      setPlanText(data.planText);
      setActivePlan(null); // new unsaved plan
    } catch {
      toast.error("Failed to generate plan. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selectedStudentId || !planText.trim()) return;
    setIsSaving(true);
    try {
      if (activePlan) {
        const res = await fetch(`/api/lesson-plans/${activePlan.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planText, sessionDate, sessionType, durationMins: parseInt(durationMins) || null, slpNotes: slpNotes.trim() || null }),
        });
        if (!res.ok) throw new Error();
        const { plan } = await res.json();
        const updated = { ...plan, studentId: selectedStudentId };
        setActivePlan(updated);
        setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
        toast.success("Plan saved.");
      } else {
        const res = await fetch("/api/lesson-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: selectedStudentId,
            sessionDate,
            sessionType,
            durationMins: parseInt(durationMins) || null,
            slpNotes: slpNotes.trim() || null,
            planText,
          }),
        });
        if (!res.ok) throw new Error();
        const { plan } = await res.json();
        const saved = { ...plan, studentId: selectedStudentId };
        setActivePlan(saved);
        setPlans(prev => [saved, ...prev]);
        toast.success("Plan saved.");
      }
    } catch {
      toast.error("Failed to save plan.");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!activePlan) {
      // Unsaved — just clear
      setPlanText("");
      setActivePlan(null);
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/lesson-plans/${activePlan.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPlans(prev => prev.filter(p => p.id !== activePlan.id));
      setActivePlan(null);
      setPlanText("");
      toast.success("Plan deleted.");
    } catch {
      toast.error("Failed to delete plan.");
    } finally {
      setIsDeleting(false);
    }
  }

  // ── Load history plan ──────────────────────────────────────────────────────

  function handleLoadPlan(plan: LessonPlanItem) {
    setActivePlan(plan);
    setPlanText(plan.planText);
    setSessionDate(plan.sessionDate);
    setSessionType(plan.sessionType);
    setDurationMins(plan.durationMins?.toString() ?? "30");
    setSlpNotes(plan.slpNotes ?? "");
    setShowHistory(false);
  }

  // ── New plan ───────────────────────────────────────────────────────────────

  function handleNewPlan() {
    setActivePlan(null);
    setPlanText("");
    setSessionDate(today);
    setSessionType("INDIVIDUAL");
    setDurationMins("30");
    setSlpNotes("");
    setShowHistory(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const planCountMeta = useMemo(() => {
    const countMap: Record<string, number> = {};
    plans.forEach(p => {
      countMap[p.studentId] = (countMap[p.studentId] ?? 0) + 1;
    });
    return countMap;
  }, [plans]);

  return (
    <div className="flex flex-col h-full max-w-[1600px]">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Lesson Planning</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Build AI-powered session plans from IEP goals and session data
          </p>
        </div>
      </div>

      {/* ── Grid: caseload | main ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 flex-1 min-h-0">

        {/* ── LEFT: Caseload card ── */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Caseload
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-hidden pt-0 flex flex-col">
            <CaseloadSidePanel
              students={students}
              selectedId={selectedStudentId}
              onSelect={handleSelectStudent}
              getStudentMeta={(id) => {
                const count = planCountMeta[id];
                return count ? `${count} plan${count !== 1 ? "s" : ""}` : null;
              }}
            />
          </CardContent>
        </Card>

        {/* ── RIGHT: Main content card ── */}
        <div className="flex flex-col min-h-0 overflow-hidden rounded-xl border bg-card">
          {!selectedStudent ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-12">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-8 w-8 text-primary/60" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Select a student to start planning</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Choose a student from the caseload to create AI-powered lesson plans based on their IEP goals and session data.
                </p>
              </div>
            </div>
          ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-semibold">
                  {selectedStudent.firstName} {selectedStudent.lastName}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedStudent.goals.filter(g => g.status === "ACTIVE").length} active goal
                  {selectedStudent.goals.filter(g => g.status === "ACTIVE").length !== 1 ? "s" : ""}
                  {selectedStudent.gradeLevel ? ` · ${selectedStudent.gradeLevel}` : ""}
                  {selectedStudent.schoolName ? ` · ${selectedStudent.schoolName}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* History dropdown */}
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={() => setShowHistory(h => !h)}
                    disabled={loadingPlans}
                  >
                    {loadingPlans
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <History className="h-3.5 w-3.5" />
                    }
                    Past Plans
                    {studentPlans.length > 0 && (
                      <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 py-0 h-4">
                        {studentPlans.length}
                      </Badge>
                    )}
                  </Button>
                  {showHistory && studentPlans.length > 0 && (
                    <div className="absolute right-0 top-full mt-1 w-72 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
                      <div className="text-xs font-medium text-muted-foreground px-3 py-2 border-b bg-muted/30">
                        Saved Plans
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {studentPlans.map(plan => (
                          <button
                            key={plan.id}
                            onClick={() => handleLoadPlan(plan)}
                            className={cn(
                              "w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors border-b last:border-0",
                              activePlan?.id === plan.id && "bg-primary/5"
                            )}
                          >
                            <div className="font-medium">
                              {format(new Date(plan.sessionDate + "T12:00:00"), "MMM d, yyyy")}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {SESSION_TYPE_OPTIONS.find(t => t.value === plan.sessionType)?.label ?? plan.sessionType}
                              {plan.durationMins ? ` · ${plan.durationMins} min` : ""}
                              {" · "}saved {format(new Date(plan.createdAt), "MMM d")}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {showHistory && studentPlans.length === 0 && (
                    <div className="absolute right-0 top-full mt-1 w-60 bg-card border rounded-lg shadow-lg z-50 p-4 text-center text-sm text-muted-foreground">
                      No saved plans yet.
                    </div>
                  )}
                </div>

                {hasPlan && (
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleNewPlan}>
                    <Plus className="h-3.5 w-3.5" />
                    New Plan
                  </Button>
                )}
              </div>
            </div>

            {/* ── Active goal chips ── */}
            {selectedStudent.goals.filter(g => g.status === "ACTIVE").length > 0 && (
              <div className="px-6 py-3 border-b shrink-0">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="text-xs text-muted-foreground font-medium shrink-0">Active goals:</span>
                  {selectedStudent.goals
                    .filter(g => g.status === "ACTIVE")
                    .map(goal => <GoalChip key={goal.id} goal={goal} />)
                  }
                </div>
              </div>
            )}

            {/* ── Scrollable body ── */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {!hasPlan ? (
                /* ── Setup form ── */
                <div className="p-6 max-w-2xl mx-auto">
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold mb-1">Plan Your Next Session</h3>
                    <p className="text-xs text-muted-foreground">
                      The AI will use {selectedStudent.firstName}'s active IEP goals, recent session data, and your notes to build a ready-to-use lesson plan.
                    </p>
                  </div>

                  <div className="space-y-5">
                    {/* Date + Type + Duration */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Session Date</Label>
                        <Input
                          type="date"
                          value={sessionDate}
                          onChange={e => setSessionDate(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Session Type</Label>
                        <Select value={sessionType} onValueChange={setSessionType}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SESSION_TYPE_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Duration (min)</Label>
                        <Input
                          type="number"
                          min={5} max={120}
                          value={durationMins}
                          onChange={e => setDurationMins(e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>

                    {/* SLP Notes */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Focus notes <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <Textarea
                        placeholder={`What do you want to focus on? E.g. "Focus on /r/ in sentences today" or "Use Cariboo game, student loves it" or "Group session — Liam and Emma together"`}
                        value={slpNotes}
                        onChange={e => setSlpNotes(e.target.value)}
                        className="min-h-[100px] text-sm resize-none"
                      />
                    </div>

                    <Button
                      onClick={handleGenerate}
                      disabled={isGenerating || !sessionDate}
                      className="w-full gap-2"
                    >
                      {isGenerating
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating plan…</>
                        : <><Sparkles className="h-4 w-4" /> Generate Lesson Plan</>
                      }
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── Plan display ── */
                <div className="p-6 max-w-3xl mx-auto">

                  {/* Plan meta bar */}
                  <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs gap-1">
                        {format(new Date(sessionDate + "T12:00:00"), "MMMM d, yyyy")}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {SESSION_TYPE_OPTIONS.find(t => t.value === sessionType)?.label ?? sessionType}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {durationMins} min
                      </Badge>
                      {activePlan && (
                        <Badge variant="secondary" className="text-xs">Saved</Badge>
                      )}
                      {hasUnsavedPlan && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
                          Unsaved
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 h-8 text-xs"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                      >
                        {isGenerating
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Regenerating…</>
                          : <><Sparkles className="h-3.5 w-3.5 text-violet-500" /> Regenerate</>
                        }
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 h-8 text-xs"
                        onClick={handleSave}
                        disabled={isSaving}
                      >
                        {isSaving
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                          : <><Save className="h-3.5 w-3.5" /> {activePlan ? "Update" : "Save"}</>
                        }
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={handleDelete}
                        disabled={isDeleting}
                      >
                        {isDeleting
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                        {activePlan ? "Delete" : "Discard"}
                      </Button>
                    </div>
                  </div>

                  {/* If there are SLP notes, show them */}
                  {slpNotes.trim() && (
                    <div className="mb-4 rounded-lg bg-muted/50 border px-4 py-2.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Focus notes: </span>{slpNotes}
                    </div>
                  )}

                  {/* Sections */}
                  {sections.length > 0 ? (
                    <div className="space-y-3">
                      {sections.map((section, idx) => (
                        <PlanSectionCard key={idx} section={section} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <pre className="text-sm text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">
                        {planText}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
