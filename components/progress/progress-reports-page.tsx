"use client";

import { useState, useMemo, useRef } from "react";
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
  ChevronDown,
  ChevronUp,
  Plus,
  Check,
  X,
  Pencil,
} from "lucide-react";

// ─── Report segment parser ──────────────────────────────────────────────────────
// Parses a report string containing three marker types into typed segments.

type ReportSegment =
  | { type: "text"; content: string }
  | { type: "inferred"; content: string; idx: number }
  | { type: "iep"; content: string }
  | { type: "note"; content: string };

function parseReportSegments(text: string): ReportSegment[] {
  const regex = /\*\*([^*]+)\*\*|\[IEP\]([\s\S]*?)\[\/IEP\]|\[NOTE\]([\s\S]*?)\[\/NOTE\]/g;
  const segments: ReportSegment[] = [];
  let lastIdx = 0;
  let inferIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) segments.push({ type: "text", content: text.slice(lastIdx, m.index) });
    if (m[1] !== undefined) segments.push({ type: "inferred", content: m[1], idx: inferIdx++ });
    else if (m[2] !== undefined) segments.push({ type: "iep", content: m[2] });
    else if (m[3] !== undefined) segments.push({ type: "note", content: m[3] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) segments.push({ type: "text", content: text.slice(lastIdx) });
  return segments;
}

function stripReportMarkers(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[IEP\]([\s\S]*?)\[\/IEP\]/g, "$1")
    .replace(/\[NOTE\]([\s\S]*?)\[\/NOTE\]/g, "$1")
    // Remove any orphaned / malformed marker tags left by imperfect AI output
    .replace(/\[\/?(IEP|NOTE)\]/g, "");
}

function hasReportMarkers(text: string): boolean {
  return /\*\*[^*]+\*\*|\[IEP\][\s\S]*?\[\/IEP\]|\[NOTE\][\s\S]*?\[\/NOTE\]/.test(text);
}

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
  const [showHistory, setShowHistory] = useState(false);
  const [isEditingFinalized, setIsEditingFinalized] = useState(false);
  /** true when AI-generated report contains source/inference markers and preview is active */
  const [reportPreviewMode, setReportPreviewMode] = useState(false);
  const [editingInferIdx, setEditingInferIdx] = useState(-1);
  const [editingInferValue, setEditingInferValue] = useState("");
  const editingInferRef = useRef<HTMLSpanElement>(null);

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
    setShowHistory(false);
    setIsEditingFinalized(false);
    setReportPreviewMode(false);
    setEditingInferIdx(-1);
  }

  function handleSelectStudent(id: string) {
    if (selectedStudentId === id) return;
    setSelectedStudentId(id);
    resetEditor();
  }

  async function handleLoadReport(reportId: string) {
    setIsLoadingReport(true);
    setShowHistory(false);
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
      setIsEditingFinalized(false);
      setReportPreviewMode(false);
      setEditingInferIdx(-1);
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
      setReportPreviewMode(hasReportMarkers(data.reportText));
      setEditingInferIdx(-1);
    } catch {
      toast.error("Failed to generate report. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave(finalize: boolean) {
    if (!editor.text.trim() || !selectedStudentId) return;
    setIsSaving(true);
    // Always save clean text — strip all source/inference markers before persisting
    const cleanText = stripReportMarkers(editor.text);
    try {
      const label = editor.title.trim() || `${editor.startDate} – ${editor.endDate}`;

      if (editor.reportId) {
        const body: Record<string, unknown> = { summaryText: cleanText, periodLabel: label };
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
            summaryText: cleanText,
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

  // ── Inference manipulation ────────────────────────────────────────────────────

  function afterInferenceChange(newText: string) {
    // If no more inferred (**) spans remain, strip any leftover IEP/NOTE markers too
    // before exiting preview mode — the source labels are visual only, not part of the text.
    const hasInferred = /\*\*[^*]+\*\*/.test(newText);
    const cleanText = hasInferred ? newText : stripReportMarkers(newText);
    setEditor((prev) => ({ ...prev, text: cleanText }));
    if (!hasInferred) {
      setReportPreviewMode(false);
      setEditingInferIdx(-1);
    }
  }

  function acceptInference(idx: number) {
    let count = 0;
    const newText = editor.text.replace(/\*\*([^*]+)\*\*/g, (match, content) => {
      const result = count === idx ? content : match;
      count++;
      return result;
    });
    afterInferenceChange(newText);
  }

  function denyInference(idx: number) {
    const text = editor.text;
    let count = 0;
    let markerStart = -1;
    let markerEnd = -1;
    text.replace(/\*\*([^*]+)\*\*/g, (match, _c, offset) => {
      if (count === idx) { markerStart = offset; markerEnd = offset + match.length; }
      count++;
      return match;
    });
    if (markerStart === -1) return;

    // Find sentence start (scan backward for .!? or \n)
    let sentStart = 0;
    for (let i = markerStart - 1; i >= 0; i--) {
      if (/[.!?]/.test(text[i])) {
        let j = i + 1;
        while (j < markerStart && text[j] === " ") j++;
        sentStart = j;
        break;
      }
      if (text[i] === "\n") { sentStart = i + 1; break; }
    }

    // Find sentence end (scan forward from markerStart for .!? or \n)
    let sentEnd = text.length;
    for (let i = markerStart; i < text.length; i++) {
      if (/[.!?]/.test(text[i])) {
        sentEnd = i + 1;
        while (sentEnd < text.length && text[sentEnd] === " ") sentEnd++;
        if (sentEnd < markerEnd) sentEnd = markerEnd;
        break;
      }
      if (text[i] === "\n" && i >= markerEnd) { sentEnd = i + 1; break; }
    }

    const newText = (text.slice(0, sentStart) + text.slice(sentEnd))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    afterInferenceChange(newText);
  }

  function startEditInference(idx: number, currentText: string) {
    setEditingInferIdx(idx);
    setEditingInferValue(currentText);
  }

  function confirmEditInference(idx: number, textOverride?: string) {
    const replacement = (textOverride ?? editingInferRef.current?.textContent ?? editingInferValue).trim();
    let count = 0;
    const newText = editor.text.replace(/\*\*([^*]+)\*\*/g, (match) => {
      const result = count === idx ? replacement : match;
      count++;
      return result;
    });
    setEditingInferIdx(-1);
    setEditingInferValue("");
    afterInferenceChange(newText);
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

  // A report is editable if it's a draft OR if the user has clicked "Edit" on a finalized one
  const isEditable = editor.isDraft || isEditingFinalized || !editor.reportId;
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

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 flex-1 min-h-0">

        {/* ── LEFT: Caseload ── */}
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
            />
          </CardContent>
        </Card>

        {/* ── RIGHT: Editor ── */}
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
              {/* ── Header ── */}
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
                <div className="flex items-center gap-2 shrink-0">
                  {!editor.isDraft && editor.reportId && (
                    <Badge variant="outline" className="text-xs border-emerald-200 bg-emerald-50 text-emerald-700">
                      Finalized
                    </Badge>
                  )}
                  {/* History toggle — only shown when past reports exist */}
                  {studentReports.length > 0 && (
                    <button
                      onClick={() => setShowHistory((v) => !v)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors border",
                        showHistory
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <History className="h-3.5 w-3.5" />
                      {studentReports.length} past
                      {showHistory
                        ? <ChevronUp className="h-3 w-3" />
                        : <ChevronDown className="h-3 w-3" />}
                    </button>
                  )}
                  {/* New report — only shown when a report is loaded */}
                  {editor.reportId && (
                    <button
                      onClick={resetEditor}
                      className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground border border-border hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New
                    </button>
                  )}
                </div>
              </div>

              {/* ── History dropdown panel ── */}
              {showHistory && (
                <div className="shrink-0 border-b bg-muted/20 max-h-56 overflow-y-auto">
                  <div className="flex flex-col divide-y divide-border/60">
                    {studentReports.map((report) => (
                      <button
                        key={report.id}
                        onClick={() => handleLoadReport(report.id)}
                        className={cn(
                          "group flex items-start gap-3 px-5 py-3 text-left text-xs transition-colors hover:bg-muted/50",
                          editor.reportId === report.id && "bg-primary/5"
                        )}
                      >
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            {report.isDraft ? (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-200 bg-amber-50 text-amber-700 shrink-0">
                                Draft
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 shrink-0">
                                Final
                              </Badge>
                            )}
                            <span className="font-medium text-foreground truncate">{report.periodLabel}</span>
                          </div>
                          <p className="text-muted-foreground">
                            {formatDate(report.periodStartDate)} – {formatDate(report.periodEndDate)}
                          </p>
                          {report.summaryText && (
                            <p className="text-muted-foreground/70 line-clamp-1">
                              {report.summaryText.trim().slice(0, 120)}{report.summaryText.length > 120 ? "…" : ""}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(report.id); }}
                          className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 mt-0.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Content ── */}
              <div className="flex flex-col flex-1 min-h-0 p-5 gap-4">

                {/* Title + date range */}
                <div className="shrink-0 flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="Report title — e.g. Q1 2026, Fall 2025"
                    value={editor.title}
                    onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))}
                    className="h-8 text-sm flex-1"
                    disabled={!isEditable}
                  />
                  <div className="flex gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                      <Input
                        type="date"
                        value={editor.startDate}
                        onChange={(e) => setEditor((prev) => ({ ...prev, startDate: e.target.value }))}
                        className="h-8 text-sm w-36"
                        disabled={!isEditable}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                      <Input
                        type="date"
                        value={editor.endDate}
                        onChange={(e) => setEditor((prev) => ({ ...prev, endDate: e.target.value }))}
                        className="h-8 text-sm w-36"
                        disabled={!isEditable}
                      />
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="shrink-0 flex items-center gap-2 flex-wrap">
                  {isEditable ? (
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
                      {(editor.reportId || editor.text.trim()) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (editor.reportId) {
                              handleDelete(editor.reportId);
                            } else {
                              resetEditor();
                            }
                          }}
                          className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete draft
                        </Button>
                      )}
                    </>
                  ) : (
                    /* Finalized and not editing — show Edit button */
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsEditingFinalized(true)}
                      className="gap-1.5 h-8 text-xs hover:bg-muted"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  )}
                  {metadata && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {metadata.sessionCount} session{metadata.sessionCount !== 1 ? "s" : ""} · {metadata.goalsUsed.length} goal{metadata.goalsUsed.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Report text: preview mode (markers) or plain textarea */}
                <div className="flex-1 min-h-0 flex flex-col gap-1.5">
                  {reportPreviewMode && editor.text ? (
                    <>
                      {/* ── Rendered preview with source + inference highlights ── */}
                      <div className="flex-1 text-sm leading-relaxed font-sans rounded-md border border-input bg-background px-3 py-2 overflow-y-auto whitespace-pre-wrap" style={{ minHeight: "14rem" }}>
                        {parseReportSegments(editor.text).map((seg, i) => {
                          if (seg.type === "text") return <span key={i}>{seg.content}</span>;

                          if (seg.type === "iep") return (
                            <span key={i} className="inline">
                              <mark className="bg-blue-100 text-blue-900 rounded px-0.5 font-medium not-italic">
                                {seg.content}
                              </mark>
                              <span className="inline-flex items-center ml-0.5 align-middle">
                                <span className="text-[9px] font-bold text-blue-600 bg-blue-100 border border-blue-200 rounded px-1 py-px leading-none">IEP</span>
                              </span>
                            </span>
                          );

                          if (seg.type === "note") return (
                            <span key={i} className="inline">
                              <mark className="bg-emerald-100 text-emerald-900 rounded px-0.5 font-medium not-italic">
                                {seg.content}
                              </mark>
                              <span className="inline-flex items-center ml-0.5 align-middle">
                                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 rounded px-1 py-px leading-none">NOTE</span>
                              </span>
                            </span>
                          );

                          // type === "inferred"
                          const isEditing = editingInferIdx === seg.idx;
                          return (
                            <span key={i} className="inline">
                              {isEditing ? (
                                <>
                                  <span
                                    ref={editingInferRef}
                                    contentEditable
                                    suppressContentEditableWarning
                                    dangerouslySetInnerHTML={{ __html: editingInferValue }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { e.preventDefault(); confirmEditInference(seg.idx, e.currentTarget.textContent ?? ""); }
                                      if (e.key === "Escape") { setEditingInferIdx(-1); setEditingInferValue(""); }
                                    }}
                                    className="bg-amber-50 text-amber-900 font-semibold rounded px-0.5 border-b-2 border-amber-400 focus:border-amber-600 focus:outline-none cursor-text"
                                  />
                                  <span className="inline-flex items-center gap-0.5 ml-0.5 align-middle">
                                    <button title="Confirm" onClick={(e) => { e.stopPropagation(); confirmEditInference(seg.idx, editingInferRef.current?.textContent ?? ""); }} className="inline-flex items-center justify-center h-4 w-4 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200 transition-colors"><Check className="h-2.5 w-2.5" /></button>
                                    <button title="Cancel" onClick={(e) => { e.stopPropagation(); setEditingInferIdx(-1); setEditingInferValue(""); }} className="inline-flex items-center justify-center h-4 w-4 rounded bg-muted text-muted-foreground border border-border hover:bg-muted/80 transition-colors"><X className="h-2.5 w-2.5" /></button>
                                  </span>
                                </>
                              ) : (
                                <>
                                  <mark className="bg-amber-100 text-amber-900 rounded px-0.5 font-semibold not-italic">{seg.content}</mark>
                                  <span className="inline-flex items-center gap-0.5 ml-0.5 align-middle">
                                    <button title="Accept" onClick={(e) => { e.stopPropagation(); acceptInference(seg.idx); }} className="inline-flex items-center justify-center h-4 w-4 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-colors"><Check className="h-2.5 w-2.5" /></button>
                                    <button title="Edit" onClick={(e) => { e.stopPropagation(); startEditInference(seg.idx, seg.content); }} className="inline-flex items-center justify-center h-4 w-4 rounded bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors"><Pencil className="h-2.5 w-2.5" /></button>
                                    <button title="Deny" onClick={(e) => { e.stopPropagation(); denyInference(seg.idx); }} className="inline-flex items-center justify-center h-4 w-4 rounded bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 transition-colors"><X className="h-2.5 w-2.5" /></button>
                                  </span>
                                </>
                              )}
                            </span>
                          );
                        })}
                      </div>
                      {/* Preview action row */}
                      <div className="flex items-center gap-3 shrink-0 flex-wrap">
                        <span className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-200" /> AI inferred</span>
                          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-200" /> From IEP</span>
                          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-200" /> From session notes</span>
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                            onClick={() => { setEditor((prev) => ({ ...prev, text: stripReportMarkers(prev.text) })); setReportPreviewMode(false); }}
                          >
                            <Check className="h-3 w-3" /> Accept all
                          </button>
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                            onClick={() => {
                              // Strip IEP/NOTE source markers when entering plain edit mode —
                              // they're visual annotations only, not part of the report text.
                              setEditor((prev) => ({
                                ...prev,
                                text: prev.text
                                  .replace(/\[IEP\]([\s\S]*?)\[\/IEP\]/g, "$1")
                                  .replace(/\[NOTE\]([\s\S]*?)\[\/NOTE\]/g, "$1")
                                  .replace(/\[\/?(IEP|NOTE)\]/g, ""),
                              }));
                              setReportPreviewMode(false);
                            }}
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <Textarea
                        value={editor.text}
                        onChange={(e) => setEditor((prev) => ({ ...prev, text: e.target.value }))}
                        placeholder={
                          !isEditable
                            ? "This report has been finalized."
                            : "Start writing, or click Generate to create an AI-assisted draft from session data."
                        }
                        readOnly={!isEditable}
                        className={cn(
                          "flex-1 resize-none text-sm leading-relaxed font-sans min-h-0",
                          !isEditable && "opacity-75 cursor-default"
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
                            {stripReportMarkers(editor.text).trim().split(/\s+/).filter(Boolean).length} words
                          </span>
                        )}
                      </div>
                    </>
                  )}
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
