"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ClipboardCheck,
  Upload,
  FileText,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Search,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StudentSummary {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string | null;
  schoolName: string;
  disabilityCategory: string | null;
  reevaluationDue: string | Date | null;
}

interface TemplateSummary {
  id: string;
  name: string;
  fileName: string;
  createdAt: string | Date;
}

interface ReportSummary {
  id: string;
  title: string;
  status: string;
  updatedAt: string | Date;
  templateId?: string | null;
}

interface EvaluationsPageProps {
  students: StudentSummary[];
  initialTemplates: TemplateSummary[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGrade(g: string | null): string {
  if (!g) return "";
  if (g === "KINDERGARTEN") return "K";
  if (g === "PRE_K") return "Pre-K";
  return g.replace("GRADE_", "Gr. ");
}

function formatDisability(d: string | null): string {
  if (!d) return "";
  return d
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function isReevalSoon(date: string | Date | null): boolean {
  if (!date) return false;
  const diff = new Date(date).getTime() - Date.now();
  return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000;
}

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EvaluationsPage({
  students,
  initialTemplates,
}: EvaluationsPageProps) {
  // ── Left panel state
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // ── Template state
  const [templates, setTemplates] = useState<TemplateSummary[]>(initialTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateExpanded, setTemplateExpanded] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteTemplateName, setPasteTemplateName] = useState("");
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  // ── Report list state
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // ── Report editor state
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [reportStatus, setReportStatus] = useState("draft");
  const [additionalContext, setAdditionalContext] = useState("");
  const [contextExpanded, setContextExpanded] = useState(false);

  // ── Async state
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── Refs
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Derived
  const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? null;
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const filteredStudents = students.filter((s) => {
    const q = search.toLowerCase();
    return !q || `${s.firstName} ${s.lastName}`.toLowerCase().includes(q);
  });

  // ── Load reports when student changes ────────────────────────────────────
  useEffect(() => {
    if (!selectedStudentId) {
      setReports([]);
      return;
    }
    setLoadingReports(true);
    setSelectedReportId(null);
    setReportContent("");
    setReportTitle("");
    setReportStatus("draft");

    fetch(`/api/evaluations?studentId=${selectedStudentId}`)
      .then((r) => r.json())
      .then((data) => setReports(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Failed to load reports"))
      .finally(() => setLoadingReports(false));
  }, [selectedStudentId]);

  // ── Open a report ─────────────────────────────────────────────────────────
  async function openReport(reportId: string) {
    try {
      const res = await fetch(`/api/evaluations/${reportId}`);
      const data = await res.json();
      setSelectedReportId(reportId);
      setReportTitle(data.title ?? "");
      setReportContent(data.content ?? "");
      setReportStatus(data.status ?? "draft");
      if (data.templateId) setSelectedTemplateId(data.templateId);
    } catch {
      toast.error("Failed to load report");
    }
  }

  // ── Create new report ─────────────────────────────────────────────────────
  async function createReport() {
    if (!selectedStudentId) return;
    try {
      const res = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudentId,
          title: selectedStudent
            ? `Evaluation — ${selectedStudent.firstName} ${selectedStudent.lastName}`
            : "New Evaluation Report",
          templateId: selectedTemplateId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to create report");
        return;
      }
      const data = await res.json();
      setReports((prev) => [
        {
          id: data.id,
          title: data.title,
          status: data.status,
          updatedAt: data.updatedAt,
        },
        ...prev,
      ]);
      setSelectedReportId(data.id);
      setReportTitle(data.title);
      setReportContent(data.content ?? "");
      setReportStatus(data.status ?? "draft");
    } catch {
      toast.error("Failed to create report");
    }
  }

  // ── Auto-save content (debounced 1.5s) ───────────────────────────────────
  const scheduleContentSave = useCallback(
    (content: string) => {
      if (!selectedReportId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          await fetch(`/api/evaluations/${selectedReportId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          });
          setReports((prev) =>
            prev.map((r) =>
              r.id === selectedReportId
                ? { ...r, updatedAt: new Date().toISOString() }
                : r
            )
          );
        } catch {
          toast.error("Failed to save");
        } finally {
          setIsSaving(false);
        }
      }, 1500);
    },
    [selectedReportId]
  );

  function handleContentChange(val: string) {
    setReportContent(val);
    scheduleContentSave(val);
  }

  // ── Save title on blur ────────────────────────────────────────────────────
  async function saveTitle() {
    if (!selectedReportId || !reportTitle.trim()) return;
    try {
      await fetch(`/api/evaluations/${selectedReportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: reportTitle.trim() }),
      });
      setReports((prev) =>
        prev.map((r) =>
          r.id === selectedReportId ? { ...r, title: reportTitle.trim() } : r
        )
      );
    } catch {
      toast.error("Failed to save title");
    }
  }

  // ── Update status ─────────────────────────────────────────────────────────
  async function updateStatus(newStatus: string) {
    if (!selectedReportId) return;
    try {
      await fetch(`/api/evaluations/${selectedReportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setReportStatus(newStatus);
      setReports((prev) =>
        prev.map((r) =>
          r.id === selectedReportId ? { ...r, status: newStatus } : r
        )
      );
      toast.success(
        newStatus === "final"
          ? "Report marked as final"
          : "Report reopened as draft"
      );
    } catch {
      toast.error("Failed to update status");
    }
  }

  // ── Delete report ─────────────────────────────────────────────────────────
  async function deleteReport(reportId: string) {
    if (!confirm("Delete this report? This cannot be undone.")) return;
    try {
      await fetch(`/api/evaluations/${reportId}`, { method: "DELETE" });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      if (selectedReportId === reportId) {
        setSelectedReportId(null);
        setReportTitle("");
        setReportContent("");
        setReportStatus("draft");
      }
      toast.success("Report deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  // ── Template upload (file) ────────────────────────────────────────────────
  async function handleFileUpload(file: File) {
    if (!file) return;
    setUploadingTemplate(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/evaluations/templates", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Upload failed");
        return;
      }
      setTemplates((prev) => [data, ...prev]);
      setSelectedTemplateId(data.id);
      toast.success("Template uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploadingTemplate(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Template save from paste ──────────────────────────────────────────────
  async function savePasteTemplate() {
    if (!pasteText.trim()) {
      toast.error("Paste some template text first");
      return;
    }
    setUploadingTemplate(true);
    try {
      const blob = new Blob([pasteText], { type: "text/plain" });
      const file = new File(
        [blob],
        `${pasteTemplateName || "template"}.txt`,
        { type: "text/plain" }
      );
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", pasteTemplateName || "Pasted Template");
      const res = await fetch("/api/evaluations/templates", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed");
        return;
      }
      setTemplates((prev) => [data, ...prev]);
      setSelectedTemplateId(data.id);
      setPasteText("");
      setPasteTemplateName("");
      setPasteMode(false);
      toast.success("Template saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setUploadingTemplate(false);
    }
  }

  // ── Delete template ───────────────────────────────────────────────────────
  async function deleteTemplate(templateId: string) {
    try {
      await fetch(`/api/evaluations/templates/${templateId}`, {
        method: "DELETE",
      });
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      if (selectedTemplateId === templateId) setSelectedTemplateId(null);
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    }
  }

  // ── Generate AI draft ─────────────────────────────────────────────────────
  async function generateDraft() {
    if (!selectedStudentId) return;
    setIsDrafting(true);
    try {
      const res = await fetch("/api/evaluations/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudentId,
          templateId: selectedTemplateId,
          additionalContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to generate draft");
        return;
      }
      setReportContent(data.draft);
      scheduleContentSave(data.draft);
      toast.success("Draft generated");
    } catch {
      toast.error("Failed to generate draft");
    } finally {
      setIsDrafting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden -mx-8 -my-7">
      {/* ── Left: Caseload ────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r bg-sidebar overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">Caseload</span>
            <Badge variant="secondary" className="text-xs">
              {students.length}
            </Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students…"
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {filteredStudents.length === 0 && (
            <p className="text-xs text-muted-foreground px-4 py-6 text-center">
              No students found
            </p>
          )}
          {filteredStudents.map((student) => {
            const active = student.id === selectedStudentId;
            const reevalSoon = isReevalSoon(student.reevaluationDue);
            return (
              <button
                key={student.id}
                onClick={() => setSelectedStudentId(student.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-2",
                  active
                    ? "bg-primary/10 border-primary"
                    : "border-transparent hover:bg-sidebar-accent"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 text-primary"
                  )}
                >
                  {getInitials(student.firstName, student.lastName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "text-xs font-medium truncate",
                        active ? "text-primary" : "text-foreground"
                      )}
                    >
                      {student.firstName} {student.lastName}
                    </span>
                    {reevalSoon && (
                      <span
                        className="shrink-0 inline-block w-1.5 h-1.5 rounded-full bg-amber-500"
                        title="Re-evaluation due soon"
                      />
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate block">
                    {formatGrade(student.gradeLevel)}
                    {student.gradeLevel && student.disabilityCategory ? " · " : ""}
                    {formatDisability(student.disabilityCategory)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Right: Workspace ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {!selectedStudent ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <ClipboardCheck className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Evaluation Reports
            </h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Select a student from the caseload to draft, edit, or view their
              evaluation reports.
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-4 max-w-4xl mx-auto">
            {/* ── Student header ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  {selectedStudent.firstName} {selectedStudent.lastName}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {formatGrade(selectedStudent.gradeLevel)} ·{" "}
                  {selectedStudent.schoolName}
                  {selectedStudent.reevaluationDue && (
                    <span
                      className={cn(
                        "ml-2",
                        isReevalSoon(selectedStudent.reevaluationDue)
                          ? "text-amber-600 font-medium"
                          : ""
                      )}
                    >
                      · Re-eval due {formatDate(selectedStudent.reevaluationDue)}
                    </span>
                  )}
                </p>
              </div>
              <Button size="sm" onClick={createReport} className="shrink-0">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New Report
              </Button>
            </div>

            {/* ── Template section ───────────────────────────────────────── */}
            <div className="rounded-xl border bg-card">
              <button
                onClick={() => setTemplateExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/40 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Evaluation Template
                  {selectedTemplate && (
                    <Badge
                      variant="secondary"
                      className="text-xs font-normal ml-1"
                    >
                      {selectedTemplate.name}
                    </Badge>
                  )}
                </div>
                {templateExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {templateExpanded && (
                <div className="border-t px-4 pb-4 pt-3 space-y-4">
                  {/* Upload zone or paste mode */}
                  {!pasteMode ? (
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files[0];
                        if (f) handleFileUpload(f);
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.docx"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileUpload(f);
                        }}
                      />
                      {uploadingTemplate ? (
                        <Loader2 className="h-6 w-6 mx-auto text-primary animate-spin" />
                      ) : (
                        <>
                          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Drop a <strong>.docx</strong> or{" "}
                            <strong>.txt</strong> template here, or click to
                            browse
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        placeholder="Template name (optional)"
                        value={pasteTemplateName}
                        onChange={(e) => setPasteTemplateName(e.target.value)}
                        className="text-sm"
                      />
                      <Textarea
                        placeholder="Paste your evaluation report template here…"
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        className="min-h-[150px] text-sm font-mono"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={savePasteTemplate}
                          disabled={uploadingTemplate}
                        >
                          {uploadingTemplate && (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          )}
                          Save Template
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPasteMode(false);
                            setPasteText("");
                            setPasteTemplateName("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {!pasteMode && (
                    <button
                      onClick={() => setPasteMode(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      Or paste template text instead
                    </button>
                  )}

                  {/* Saved templates list */}
                  {templates.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Saved Templates
                      </p>
                      {templates.map((t) => (
                        <div
                          key={t.id}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                            selectedTemplateId === t.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/40"
                          )}
                          onClick={() =>
                            setSelectedTemplateId(
                              t.id === selectedTemplateId ? null : t.id
                            )
                          }
                        >
                          <FileText
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              selectedTemplateId === t.id
                                ? "text-primary"
                                : "text-muted-foreground"
                            )}
                          />
                          <span className="text-xs font-medium flex-1 truncate">
                            {t.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {t.fileName}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTemplate(t.id);
                            }}
                            className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {templates.length === 0 && !pasteMode && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No templates saved yet. Upload one above.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Reports list ───────────────────────────────────────────── */}
            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="text-sm font-medium text-foreground flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                  Reports
                  {reports.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {reports.length}
                    </Badge>
                  )}
                </span>
              </div>

              {loadingReports ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : reports.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No reports yet for this student.
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={createReport}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Create first report
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {reports.map((r) => (
                    <div
                      key={r.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors",
                        selectedReportId === r.id && "bg-primary/5"
                      )}
                      onClick={() => openReport(r.id)}
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm font-medium text-foreground truncate">
                        {r.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs shrink-0",
                          r.status === "final"
                            ? "border-green-300 bg-green-50 text-green-700"
                            : "border-amber-300 bg-amber-50 text-amber-700"
                        )}
                      >
                        {r.status === "final" ? "Final" : "Draft"}
                      </Badge>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDate(r.updatedAt)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteReport(r.id);
                        }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Report editor ─────────────────────────────────────────── */}
            {selectedReportId && (
              <div className="rounded-xl border bg-card overflow-hidden">
                {/* Editor header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/20">
                  <Input
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    onBlur={saveTitle}
                    className="flex-1 border-0 bg-transparent p-0 text-sm font-semibold shadow-none focus-visible:ring-0 h-auto"
                    placeholder="Report title…"
                    disabled={reportStatus === "final"}
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    {isSaving && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        reportStatus === "final"
                          ? "border-green-300 bg-green-50 text-green-700"
                          : "border-amber-300 bg-amber-50 text-amber-700"
                      )}
                    >
                      {reportStatus === "final" ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Final
                        </>
                      ) : (
                        "Draft"
                      )}
                    </Badge>
                  </div>
                </div>

                {/* Additional context collapsible */}
                <div className="border-b">
                  <button
                    onClick={() => setContextExpanded((v) => !v)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {contextExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    Additional context for AI drafting
                    {additionalContext && (
                      <span className="text-primary text-[10px]">
                        ● provided
                      </span>
                    )}
                  </button>
                  {contextExpanded && (
                    <div className="px-4 pb-3">
                      <Textarea
                        value={additionalContext}
                        onChange={(e) => setAdditionalContext(e.target.value)}
                        placeholder="Add any relevant context: referral reason, parent concerns, teacher observations, assessment battery planned, specific areas of concern, prior evaluations, etc."
                        className="min-h-[100px] text-sm resize-none"
                      />
                    </div>
                  )}
                </div>

                {/* AI draft button bar */}
                {reportStatus !== "final" && (
                  <div className="px-4 py-3 border-b bg-muted/10 flex items-center gap-3 flex-wrap">
                    <Button
                      size="sm"
                      onClick={generateDraft}
                      disabled={isDrafting}
                      className="gap-1.5"
                    >
                      {isDrafting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {isDrafting ? "Generating…" : "Generate AI Draft"}
                    </Button>
                    {!selectedTemplateId && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                        No template selected — will use default structure
                      </span>
                    )}
                    {selectedTemplate && (
                      <span className="text-xs text-muted-foreground">
                        Using template:{" "}
                        <span className="font-medium text-foreground">
                          {selectedTemplate.name}
                        </span>
                      </span>
                    )}
                  </div>
                )}

                {/* Content editor */}
                <div className="p-4">
                  <Textarea
                    value={reportContent}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder={
                      reportStatus === "final"
                        ? "(Report is finalized)"
                        : "Report content will appear here after AI generation, or type directly…"
                    }
                    className="min-h-[520px] text-sm font-mono leading-relaxed resize-y border-0 shadow-none focus-visible:ring-0 p-0"
                    disabled={reportStatus === "final"}
                  />
                </div>

                {/* Footer toolbar */}
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
                  <div className="text-xs text-muted-foreground">
                    {
                      reportContent
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean).length
                    }{" "}
                    words
                  </div>
                  <div className="flex gap-2">
                    {reportStatus === "draft" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-green-300 text-green-700 hover:bg-green-50 gap-1.5"
                        onClick={() => updateStatus("final")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark as Final
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus("draft")}
                      >
                        Reopen as Draft
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
