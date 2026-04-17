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
  UserPlus,
  X,
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
  additionalStudentIds?: string[];
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
    <div className={cn("rounded-lg px-3 py-2 text-xs shrink-0 w-[172px]", colorClass)}>
      <div className="font-semibold truncate">{name}</div>
      <div className="opacity-70 mt-0.5 truncate">{domainLabel} · {Math.round(goal.targetAccuracy)}% target</div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function LessonPlanningPage({ students }: Props) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [additionalStudentIds, setAdditionalStudentIds] = useState<string[]>([]);
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [plans, setPlans] = useState<LessonPlanItem[]>([]);
  const [activePlan, setActivePlan] = useState<LessonPlanItem | null>(null);
  const [planText, setPlanText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [dragOver, setDragOver] = useState<"primary" | "secondary" | null>(null);

  // Form state
  const [sessionDate, setSessionDate] = useState(today);
  const [sessionType, setSessionType] = useState("INDIVIDUAL");
  const [durationMins, setDurationMins] = useState("30");
  const [slpNotes, setSlpNotes] = useState("");

  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId]
  );

  const additionalStudents = useMemo(
    () => additionalStudentIds.map(id => students.find(s => s.id === id)).filter((s): s is StudentOption => s !== undefined),
    [students, additionalStudentIds]
  );

  // Students available to add (excludes primary and already-added)
  const availableToAdd = useMemo(
    () => students.filter(s => s.id !== selectedStudentId && !additionalStudentIds.includes(s.id)),
    [students, selectedStudentId, additionalStudentIds]
  );

  const isGroup = additionalStudentIds.length > 0;

  const studentPlans = useMemo(
    () => plans.filter(p => p.studentId === selectedStudentId),
    [plans, selectedStudentId]
  );

  const sections = useMemo(() => parsePlanSections(planText), [planText]);

  const hasUnsavedPlan = planText.trim().length > 0 && !activePlan;
  const hasPlan = planText.trim().length > 0;

  // ── Student selection ──────────────────────────────────────────────────────

  function handleClearPrimary() {
    setSelectedStudentId(null);
    setAdditionalStudentIds([]);
    setActivePlan(null);
    setPlanText("");
    setShowHistory(false);
    setShowStudentPicker(false);
  }

  async function handleSelectStudent(id: string) {
    if (id === selectedStudentId) return;
    setSelectedStudentId(id);
    setAdditionalStudentIds([]);
    setActivePlan(null);
    setPlanText("");
    setShowHistory(false);
    setShowStudentPicker(false);
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

  function handleAddStudent(id: string) {
    if (additionalStudentIds.includes(id) || id === selectedStudentId) return;
    setAdditionalStudentIds(prev => [...prev, id]);
    setShowStudentPicker(false);
    // Reset any existing plan when the student roster changes
    setActivePlan(null);
    setPlanText("");
  }

  function handleRemoveStudent(id: string) {
    setAdditionalStudentIds(prev => prev.filter(sid => sid !== id));
    // Keep the plan text — removing one student from the group should not
    // wipe the draft. Clear activePlan so the unsaved state is obvious,
    // but preserve whatever the SLP has already written.
    setActivePlan(null);
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
          additionalStudentIds,
          sessionDate,
          sessionType,
          durationMins: parseInt(durationMins) || 30,
          slpNotes: slpNotes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      setPlanText(data.planText);
      setActivePlan(null);
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
          body: JSON.stringify({
            planText, sessionDate, sessionType,
            durationMins: parseInt(durationMins) || null,
            slpNotes: slpNotes.trim() || null,
            additionalStudentIds,
          }),
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
            additionalStudentIds,
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
    setAdditionalStudentIds(plan.additionalStudentIds ?? []);
    setShowHistory(false);
  }

  // ── Delete from history panel ─────────────────────────────────────────────

  async function handleDeleteFromHistory(planId: string) {
    try {
      const res = await fetch(`/api/lesson-plans/${planId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPlans(prev => prev.filter(p => p.id !== planId));
      if (activePlan?.id === planId) {
        setActivePlan(null);
        setPlanText("");
      }
      toast.success("Plan deleted.");
    } catch {
      toast.error("Failed to delete plan.");
    }
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

  // ── Drop handler ──────────────────────────────────────────────────────────

  function handleDrop(e: React.DragEvent, target: "primary" | "secondary") {
    e.preventDefault();
    setDragOver(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const { studentId } = data;
      if (!studentId) return;
      if (target === "primary") {
        // Dropping on primary slot: select this as primary student, clear additional
        void handleSelectStudent(studentId);
      } else {
        // Dropping on secondary slot: only allowed when primary is already set and this isn't already included
        if (!selectedStudentId || studentId === selectedStudentId) return;
        handleAddStudent(studentId);
      }
    } catch { /* ignore */ }
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

      {/* ── Two-panel layout: caseload | main ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border bg-card">

        {/* ── LEFT: Caseload ── */}
        <aside className="w-64 shrink-0 flex flex-col border-r bg-sidebar overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Caseload</span>
              <Badge variant="secondary" className="text-xs">{students.length}</Badge>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col px-2 py-2">
            <CaseloadSidePanel
              students={students}
              selectedId={selectedStudentId}
              draggable
              onSelect={handleSelectStudent}
              getStudentMeta={(id) => {
                const count = planCountMeta[id];
                return count ? `${count} plan${count !== 1 ? "s" : ""}` : null;
              }}
            />
          </div>
        </aside>

        {/* ── RIGHT: Main content ── */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {!selectedStudent ? (
            /* ── Empty state ── */
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver("primary"); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, "primary")}
              className={cn(
                "flex-1 flex flex-col items-center justify-center text-center p-8 transition-colors",
                dragOver === "primary" && "ring-2 ring-inset ring-dashed ring-primary/40 bg-primary/5"
              )}
            >
              <BookOpen className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Select a student to start planning
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Choose a student from the caseload, or drag one here to get started.
              </p>
            </div>
          ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

            {/* ── Tinted header ── */}
            <div className="flex items-center gap-2.5 px-5 py-3.5 bg-primary/5 border-b border-primary/10 shrink-0">
              <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 shrink-0">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Session Plan</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[selectedStudent, ...additionalStudents].map(s => s.firstName + " " + s.lastName).join(" · ")}
                  {sessionDate ? ` · ${format(new Date(sessionDate + "T12:00:00"), "MMM d, yyyy")}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {activePlan && (
                  <Badge variant="outline" className="text-xs border-emerald-200 bg-emerald-50 text-emerald-700">
                    Saved
                  </Badge>
                )}
                {studentPlans.length > 0 && (
                  <button
                    onClick={() => setShowHistory(h => !h)}
                    disabled={loadingPlans}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors border",
                      showHistory
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {loadingPlans
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <History className="h-3.5 w-3.5" />
                    }
                    {studentPlans.length} past
                    {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
                {hasPlan && (
                  <button
                    onClick={handleNewPlan}
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground border border-border hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New
                  </button>
                )}
              </div>
            </div>

            {/* ── History inline panel ── */}
            {showHistory && (
              <div className="shrink-0 border-b bg-muted/20 max-h-56 overflow-y-auto">
                {studentPlans.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No saved plans yet.</p>
                ) : (
                  <div className="flex flex-col divide-y divide-border/60">
                    {studentPlans.map(plan => (
                      <button
                        key={plan.id}
                        onClick={() => handleLoadPlan(plan)}
                        className={cn(
                          "group flex items-start gap-3 px-5 py-3 text-left text-xs transition-colors hover:bg-muted/50",
                          activePlan?.id === plan.id && "bg-primary/5"
                        )}
                      >
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-200 bg-amber-50 text-amber-700 shrink-0">
                              Draft
                            </Badge>
                            <span className="font-medium text-foreground truncate">
                              {format(new Date(plan.sessionDate + "T12:00:00"), "MMM d, yyyy")}
                            </span>
                          </div>
                          <p className="text-muted-foreground">
                            {SESSION_TYPE_OPTIONS.find(t => t.value === plan.sessionType)?.label ?? plan.sessionType}
                            {plan.durationMins ? ` · ${plan.durationMins} min` : ""}
                          </p>
                        </div>
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteFromHistory(plan.id); }}
                          className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 mt-0.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Scrollable content ── */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="p-5 flex flex-col gap-4">

                {/* ── Student group management ── */}
                <div className="shrink-0 flex flex-col gap-2">

                  {/* Selected student pills */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                      {selectedStudent.firstName} {selectedStudent.lastName}
                      <button
                        onClick={handleClearPrimary}
                        className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                        title="Remove student"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                    {additionalStudents.map(s => (
                      <span key={s.id} className="flex items-center gap-1">
                        <span className="text-muted-foreground/50 text-xs">+</span>
                        <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                          {s.firstName} {s.lastName}
                          <button
                            onClick={() => handleRemoveStudent(s.id)}
                            className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            title={`Remove ${s.firstName}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      </span>
                    ))}
                  </div>

                  {/* Add / drop zone */}
                  {availableToAdd.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setShowStudentPicker(p => !p)}
                        onDragOver={(e) => { e.preventDefault(); setDragOver("secondary"); }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={(e) => handleDrop(e, "secondary")}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm font-medium transition-colors",
                          dragOver === "secondary"
                            ? "border-primary/60 bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        <UserPlus className="h-4 w-4" />
                        Add student — click to select or drag from caseload
                      </button>
                      {showStudentPicker && (
                        <div className="absolute left-0 top-full mt-1 w-60 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
                          <div className="text-xs font-medium text-muted-foreground px-3 py-2 border-b bg-muted/30">
                            Add to group
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {availableToAdd.map(s => (
                              <button
                                key={s.id}
                                onClick={() => handleAddStudent(s.id)}
                                className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors border-b last:border-0"
                              >
                                <div className="font-medium">{s.firstName} {s.lastName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {s.goals.filter(g => g.status === "ACTIVE").length} active goal
                                  {s.goals.filter(g => g.status === "ACTIVE").length !== 1 ? "s" : ""}
                                  {s.gradeLevel ? ` · ${s.gradeLevel}` : ""}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Session fields ── */}
                <div className="shrink-0 flex flex-col sm:flex-row gap-2">
                  <Input
                    type="date"
                    value={sessionDate}
                    onChange={e => setSessionDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Select value={sessionType} onValueChange={setSessionType}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SESSION_TYPE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Duration</Label>
                    <Input
                      type="number"
                      min={5} max={180}
                      value={durationMins}
                      onChange={e => setDurationMins(e.target.value)}
                      className="h-8 text-sm w-20"
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                  </div>
                </div>

                {/* ── Focus notes ── */}
                <div className="shrink-0">
                  <Textarea
                    placeholder={`Focus notes — e.g. "Work on /r/ in sentences" or "Use Cariboo game"`}
                    value={slpNotes}
                    onChange={e => setSlpNotes(e.target.value)}
                    className="min-h-[80px] text-sm resize-none"
                  />
                </div>

                {/* ── Action buttons ── */}
                <div className="shrink-0 flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isGenerating || !sessionDate}
                    onClick={handleGenerate}
                    className="gap-1.5 h-8 text-xs text-violet-500 hover:text-violet-700 hover:bg-violet-50"
                  >
                    {isGenerating
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                      : <><Sparkles className="h-3.5 w-3.5" /> {hasPlan ? "Regenerate" : "Generate"}</>
                    }
                  </Button>
                  {hasPlan && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isSaving}
                        onClick={handleSave}
                        className="gap-1.5 h-8 text-xs hover:bg-muted"
                      >
                        {isSaving
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                          : <><Save className="h-3.5 w-3.5" /> {activePlan ? "Update" : "Save Draft"}</>
                        }
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isDeleting}
                        onClick={handleDelete}
                        className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        {isDeleting
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                        {activePlan ? "Delete" : "Discard"}
                      </Button>
                    </>
                  )}
                </div>

                {/* ── Active goals — always visible ── */}
                {(selectedStudent.goals.filter(g => g.status === "ACTIVE").length > 0 ||
                  additionalStudents.some(s => s.goals.filter(g => g.status === "ACTIVE").length > 0)) && (
                  <div className="shrink-0 border-t pt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active Goals</p>
                    {isGroup ? (
                      <div className="space-y-2">
                        {[selectedStudent, ...additionalStudents].map((student) => {
                          const activeGoals = student.goals.filter(g => g.status === "ACTIVE");
                          if (activeGoals.length === 0) return null;
                          return (
                            <div key={student.id} className="flex items-start gap-2">
                              <span className="text-xs font-semibold text-muted-foreground shrink-0 w-16 truncate pt-2">{student.firstName}:</span>
                              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 flex-1">
                                {activeGoals.map(goal => <GoalChip key={goal.id} goal={goal} />)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {selectedStudent.goals
                          .filter(g => g.status === "ACTIVE")
                          .map(goal => <GoalChip key={goal.id} goal={goal} />)
                        }
                      </div>
                    )}
                  </div>
                )}

                {/* ── Plan content ── */}
                {hasPlan && (
                  <div className="space-y-3 pb-4 border-t pt-4">
                    {sections.length > 0 ? (
                      sections.map((section, idx) => (
                        <PlanSectionCard key={idx} section={section} />
                      ))
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
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
