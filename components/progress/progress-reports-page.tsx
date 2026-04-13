"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/format-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CaseloadSidePanel } from "@/components/shared/caseload-side-panel";
import {
  Sparkles,
  FileText,
  Users,
  AlertTriangle,
  Info,
  Loader2,
  Trash2,
  Bot,
  History,
  PenLine,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ReportListItem {
  id: string;
  periodLabel: string;
  periodStartDate: string;
  periodEndDate: string;
  summaryText: string | null;
  isDraft: boolean;
  finalizedAt: string | null;
  createdAt: string;
  student: { id: string; firstName: string; lastName: string };
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  goals: { id: string }[];
  ieps: { id: string; status: string; reviewDate: string; studentId: string }[];
}

interface GenerateMetadata {
  goalsUsed: Array<{ id: string; name: string; dataPointCount: number }>;
  sessionCount: number;
  sessionNoteCount: number;
  dataWarnings: string[];
  hasLimitedData: boolean;
}

interface EditorState {
  reportId: string | null;
  title: string;
  startDate: string;
  endDate: string;
  text: string;
  isAiGenerated: boolean;
  isDraft: boolean;
}

interface Props {
  initialReports: ReportListItem[];
  students: StudentOption[];
}

// ─── Historical report card ────────────────────────────────────────────────────

function ReportCard({
  report,
  isActive,
  onLoad,
  onDelete,
}: {
  report: ReportListItem;
  isActive: boolean;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const excerpt = report.summaryText?.trim().slice(0, 100);
  const hasExcerpt = excerpt && excerpt.length > 0;

  return (
    <button
      onClick={onLoad}
      className={cn(
        "group relative w-full rounded-lg border p-2.5 text-left text-xs transition-colors",
        isActive
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card hover:bg-muted/40"
      )}
    >
      {/* Top row: badge + delete */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-1.5">
          {report.isDraft ? (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-200 bg-amber-50 text-amber-700">
              Draft
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-emerald-200 bg-emerald-50 text-emerald-700">
              Final
            </Badge>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="hidden group-hover:flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Period label */}
      <p className="font-semibold text-foreground truncate leading-tight">
        {report.periodLabel}
      </p>

      {/* Date range */}
      <p className="text-muted-foreground/70 mb-1">
        {formatDate(report.periodStartDate)} – {formatDate(report.periodEndDate)}
      </p>

      {/* Text excerpt */}
      {hasExcerpt ? (
        <p className="text-muted-foreground leading-relaxed line-clamp-2">
          {excerpt}{(report.summaryText?.length ?? 0) > 100 ? "…" : ""}
        </p>
      ) : (
        <p className="text-muted-foreground/40 italic">No content yet</p>
      )}
    </button>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function ProgressReportsPage({ initialReports, students }: Props) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportListItem[]>(initialReports);

  const today = new Date().toISOString().split("T")[0];
  const [editor, setEditor] = useState<EditorState>({
    reportId: null,
    title: "",
    startDate: "",
    endDate: today,
    text: "",
    isAiGenerated: false,
    isDraft: true,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [metadata, setMetadata] = useState<GenerateMetadata | null>(null);

  const reportsByStudent = useMemo(() => {
    const map: Record<string, ReportListItem[]> = {};
    for (const r of reports) {
      if (!map[r.student.id]) map[r.student.id] = [];
      map[r.student.id].push(r);
    }
    return map;
  }, [reports]);

  const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? null;
  const studentReports = selectedStudentId ? (reportsByStudent[selectedStudentId] ?? []) : [];

  function resetEditor() {
    setEditor({ reportId: null, title: "", startDate: "", endDate: today, text: "", isAiGenerated: false, isDraft: true });
    setMetadata(null);
  }

  function handleSelectStudent(id: string) {
    if (selectedStudentId === id) return;
    setSelectedStudentId(id);
    resetEditor();
  }

  async function handleLoadReport(reportId: string) {
    setIsLoadingReport(true);
    try {
      const res = await fetch(`/api/progress-reports/${reportId}`);
      if (!res.ok) throw new Error("Failed to load");
      const { report } = await res.json();
      setEditor({
        reportId: report.id,
        title: report.periodLabel ?? "",
        startDate: new Date(report.periodStartDate).toISOString().split("T")[0],
        endDate: new Date(report.periodEndDate).toISOString().split("T")[0],
        text: report.summaryText ?? "",
        isAiGenerated: false,
        isDraft: report.isDraft,
      });
      setMetadata(null);
    } catch {
      toast.error("Failed to load report.");
    } finally {
      setIsLoadingReport(false);
    }
  }

  async function handleGenerate() {
    if (!selectedStudentId || !editor.startDate || !editor.endDate) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/progress-reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudentId,
          startDate: editor.startDate,
          endDate: editor.endDate,
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      setEditor((prev) => ({ ...prev, text: data.reportText, isAiGenerated: true }));
      setMetadata(data.metadata);
    } catch {
      toast.error("Failed to generate report. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave(finalize: boolean) {
    if (!editor.text.trim() || !selectedStudentId) return;
    setIsSaving(true);
    try {
      const label = editor.title.trim() || `${editor.startDate} – ${editor.endDate}`;

      if (editor.reportId) {
        const body: Record<string, unknown> = { summaryText: editor.text, periodLabel: label };
        if (finalize) body.finalize = true;
        const res = await fetch(`/api/progress-reports/${editor.reportId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Save failed");
        const { report: updated } = await res.json();
        setReports((prev) =>
          prev.map((r) =>
            r.id === editor.reportId
              ? {
                  ...r,
                  periodLabel: updated.periodLabel,
                  summaryText: updated.summaryText ?? null,
                  periodStartDate: new Date(updated.periodStartDate).toISOString(),
                  periodEndDate: new Date(updated.periodEndDate).toISOString(),
                  isDraft: updated.isDraft,
                  finalizedAt: updated.finalizedAt ? new Date(updated.finalizedAt).toISOString() : null,
                }
              : r
          )
        );
        if (finalize) {
          setEditor((prev) => ({ ...prev, isDraft: false }));
          toast.success("Report finalized.");
        } else {
          toast.success("Saved.");
        }
      } else {
        const createRes = await fetch("/api/progress-reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: selectedStudentId,
            periodLabel: label,
            periodStartDate: editor.startDate,
            periodEndDate: editor.endDate,
            summaryText: editor.text,
            goalSnapshots: metadata?.goalsUsed ?? null,
            isDraft: !finalize,
          }),
        });
        if (!createRes.ok) throw new Error("Save failed");
        const { report: created } = await createRes.json();

        let finalReport = created;
        if (finalize) {
          const patchRes = await fetch(`/api/progress-reports/${created.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ finalize: true }),
          });
          if (!patchRes.ok) throw new Error("Finalize failed");
          const { report } = await patchRes.json();
          finalReport = report;
          toast.success("Report finalized.");
        } else {
          toast.success("Draft saved.");
        }

        if (selectedStudent) {
          const newItem: ReportListItem = {
            id: finalReport.id,
            periodLabel: finalReport.periodLabel,
            periodStartDate: new Date(finalReport.periodStartDate).toISOString(),
            periodEndDate: new Date(finalReport.periodEndDate).toISOString(),
            summaryText: finalReport.summaryText ?? null,
            isDraft: finalReport.isDraft,
            finalizedAt: finalReport.finalizedAt ? new Date(finalReport.finalizedAt).toISOString() : null,
            createdAt: new Date(finalReport.createdAt).toISOString(),
            student: {
              id: selectedStudent.id,
              firstName: selectedStudent.firstName,
              lastName: selectedStudent.lastName,
            },
          };
          setReports((prev) => [newItem, ...prev]);
          setEditor((prev) => ({ ...prev, reportId: finalReport.id, isDraft: finalReport.isDraft }));
        }
      }
    } catch {
      toast.error("Failed to save report.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(reportId: string) {
    if (!window.confirm("Delete this progress report? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/progress-reports/${reportId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      if (editor.reportId === reportId) resetEditor();
      toast.success("Report deleted.");
    } catch {
      toast.error("Failed to delete report.");
    }
  }

  const canGenerate = !!selectedStudentId && !!editor.startDate && !!editor.endDate;
  const canSave = !!selectedStudentId && editor.text.trim().length > 0;

  return (
    <div className="flex flex-col h-full max-w-[1600px]">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Progress Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate and manage progress reports for your caseload
          </p>
        </div>
      </div>

      {/* Three-column layout: Caseload | Past Reports | Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_260px_1fr] gap-4 flex-1 min-h-0">

        {/* ── COL 1: Caseload ── */}
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
                const count = reportsByStudent[id]?.length ?? 0;
                return count > 0 ? `${count} report${count !== 1 ? "s" : ""}` : null;
              }}
            />
          </CardContent>
        </Card>

        {/* ── COL 2: Past Reports (vertical) ── */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              Past Reports
            </CardTitle>
            {selectedStudent && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedStudent.firstName} {selectedStudent.lastName}
              </p>
            )}
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-y-auto pt-0 flex flex-col gap-2 px-3">
            {!selectedStudentId ? (
              <div className="flex-1 flex items-center justify-center py-10 text-center">
                <p className="text-xs text-muted-foreground">
                  Select a student to see their reports
                </p>
              </div>
            ) : studentReports.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
                <FileText className="h-7 w-7 text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">No reports yet</p>
              </div>
            ) : (
              studentReports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  isActive={editor.reportId === report.id}
                  onLoad={() => handleLoadReport(report.id)}
                  onDelete={() => handleDelete(report.id)}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* ── COL 3: Editor Draft Box ── */}
        <div className="flex flex-col min-h-0 overflow-hidden rounded-xl border bg-card">
            {!selectedStudentId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <PenLine className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Select a student to start writing
                </p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Choose a student from the caseload to open the report editor.
                </p>
              </div>
            ) : isLoadingReport ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 bg-primary/5 border-b border-primary/10 shrink-0">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Progress Report Draft</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedStudent?.firstName} {selectedStudent?.lastName}
                      {editor.startDate && editor.endDate
                        ? ` · ${formatDate(editor.startDate)} – ${formatDate(editor.endDate)}`
                        : " · Set a date range below"}
                    </p>
                  </div>
                  {!editor.isDraft && editor.reportId && (
                    <Badge variant="outline" className="text-xs border-emerald-200 bg-emerald-50 text-emerald-700 shrink-0">
                      Finalized
                    </Badge>
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col flex-1 min-h-0 p-5 gap-4">

                  {/* Title + date range */}
                  <div className="shrink-0 flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="Report title — e.g. Q1 2026, Fall 2025"
                      value={editor.title}
                      onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))}
                      className="h-8 text-sm flex-1"
                      disabled={!editor.isDraft && !!editor.reportId}
                    />
                    <div className="flex gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                        <Input
                          type="date"
                          value={editor.startDate}
                          onChange={(e) => setEditor((prev) => ({ ...prev, startDate: e.target.value }))}
                          className="h-8 text-sm w-36"
                          disabled={!editor.isDraft && !!editor.reportId}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                        <Input
                          type="date"
                          value={editor.endDate}
                          onChange={(e) => setEditor((prev) => ({ ...prev, endDate: e.target.value }))}
                          className="h-8 text-sm w-36"
                          disabled={!editor.isDraft && !!editor.reportId}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="shrink-0 flex items-center gap-2 flex-wrap">
                    {(editor.isDraft || !editor.reportId) && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canGenerate || isGenerating}
                          onClick={handleGenerate}
                          className="gap-1.5 h-8 text-xs text-violet-500 hover:text-violet-700 hover:bg-violet-50"
                        >
                          {isGenerating
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                            : <><Sparkles className="h-3.5 w-3.5" /> {editor.text ? "Regenerate" : "Generate"}</>
                          }
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canSave || isSaving}
                          onClick={() => handleSave(false)}
                          className="gap-1.5 h-8 text-xs hover:bg-muted"
                        >
                          {isSaving ? "Saving…" : "Save Draft"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canSave || isSaving}
                          onClick={() => handleSave(true)}
                          className="gap-1.5 h-8 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        >
                          Finalize
                        </Button>
                      </>
                    )}
                    {metadata && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {metadata.sessionCount} session{metadata.sessionCount !== 1 ? "s" : ""} · {metadata.goalsUsed.length} goal{metadata.goalsUsed.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {/* Textarea + AI label + word count */}
                  <div className="flex-1 min-h-0 flex flex-col gap-1.5">
                    <Textarea
                      value={editor.text}
                      onChange={(e) => setEditor((prev) => ({ ...prev, text: e.target.value }))}
                      placeholder={
                        !editor.isDraft && editor.reportId
                          ? "This report has been finalized."
                          : "Start writing, or click Generate to create an AI-assisted draft from session data."
                      }
                      readOnly={!editor.isDraft && !!editor.reportId}
                      className={cn(
                        "flex-1 resize-none text-sm leading-relaxed font-sans min-h-0",
                        !editor.isDraft && !!editor.reportId && "opacity-75 cursor-default"
                      )}
                    />
                    <div className="flex items-center justify-between shrink-0">
                      {editor.isAiGenerated ? (
                        <span className="text-xs text-muted-foreground/70 italic flex items-center gap-1">
                          <Bot className="h-3 w-3" />
                          AI-generated — review and edit before saving
                        </span>
                      ) : <span />}
                      {editor.text && (
                        <span className="text-xs text-muted-foreground">
                          {editor.text.trim().split(/\s+/).filter(Boolean).length} words
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Warnings */}
                  {metadata && (metadata.dataWarnings.length > 0 || metadata.hasLimitedData) && (
                    <div className="shrink-0 border-t pt-3 space-y-1.5">
                      {metadata.dataWarnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> {w}
                        </div>
                      ))}
                      {metadata.hasLimitedData && (
                        <div className="flex items-start gap-1.5 text-xs text-blue-700">
                          <Info className="h-3 w-3 shrink-0 mt-0.5" /> Limited session data — consider extending the date range.
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </>
            )}
          </div>

      </div>
    </div>
  );
}
