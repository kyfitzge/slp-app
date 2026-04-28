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
  FileText,
  ChevronLeft,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  CheckCircle2,
  Search,
  Check,
  X,
  Upload,
  ImageIcon,
  Save,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentSummary {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string | null;
  schoolName: string;
  disabilityCategory: string | null;
  reevaluationDue: string | Date | null;
}

interface ReportSummary {
  id: string;
  title: string;
  status: string;
  updatedAt: string | Date;
}

interface EvaluationsPageProps {
  students: StudentSummary[];
}

type CommAreaStatus = "assessed" | "not-assessed" | "na";

interface CommAreaData {
  status: CommAreaStatus;
  findings: string;
}

interface TestRow {
  id: string;
  testName: string;
  standardScore: string;
  percentile: string;
  descriptor: string;
}

interface UploadedFile {
  id: string;
  name: string;
  previewUrl: string; // empty string for PDFs
  base64: string;
  mediaType: string;
  isPdf: boolean;
}

type SectionId =
  | "referral"
  | "background"
  | "methods"
  | "behavioral"
  | "commAreas"
  | "testResults"
  | "informal"
  | "hearing"
  | "summary"
  | "impact"
  | "recommendations";

type SimpleTextSectionId =
  | "referral"
  | "background"
  | "behavioral"
  | "informal"
  | "hearing"
  | "summary"
  | "impact"
  | "recommendations";

type CommAreaId =
  | "articulation"
  | "receptive"
  | "expressive"
  | "pragmatics"
  | "fluency"
  | "voice";

// ─── Data ─────────────────────────────────────────────────────────────────────

const ALL_SECTION_META: Array<{
  id: SectionId;
  num: number;
  title: string;
  placeholder: string;
}> = [
  {
    id: "referral",
    num: 1,
    title: "Student & Referral Information",
    placeholder:
      "Student name, date of birth, grade, school name, referral source, reason for referral, evaluation dates, evaluator name and credentials…",
  },
  {
    id: "background",
    num: 2,
    title: "Background Information",
    placeholder:
      "Relevant history: developmental milestones, prior speech-language services, medical history, hearing/vision status, family and educational concerns, language background, prior evaluations…",
  },
  {
    id: "methods",
    num: 3,
    title: "Assessment Methods",
    placeholder: "",
  },
  {
    id: "behavioral",
    num: 4,
    title: "Behavioral Observations",
    placeholder:
      "Student's behavior, engagement, attention, and cooperation during testing. Describe rapport, response style, effort, and any factors that may have affected the validity of results…",
  },
  {
    id: "commAreas",
    num: 5,
    title: "Communication Areas Assessed",
    placeholder: "",
  },
  {
    id: "testResults",
    num: 6,
    title: "Test Results & Findings",
    placeholder: "",
  },
  {
    id: "informal",
    num: 7,
    title: "Informal Assessment & Language Sample",
    placeholder:
      "Language sample findings (MLU, sentence structures, vocabulary diversity), narrative retell, conversational observations, curriculum-based measures, dynamic assessment, or other informal procedures…",
  },
  {
    id: "hearing",
    num: 8,
    title: "Hearing, Vision & Related Factors",
    placeholder:
      "Current hearing and vision status, date of most recent screenings or audiological evaluation. Note any sensory, motor, or neurological factors relevant to communication…",
  },
  {
    id: "summary",
    num: 9,
    title: "Summary & Clinical Interpretation",
    placeholder:
      "Synthesize all assessment findings across areas. Describe this student's overall communication profile, areas of relative strength, and areas of concern. Integrate formal and informal data into a coherent clinical picture…",
  },
  {
    id: "impact",
    num: 10,
    title: "Educational Impact & Eligibility",
    placeholder:
      "Describe how communication difficulties adversely affect the student's access to the curriculum, academic performance, and participation in educational activities. State eligibility determination and which criteria are met…",
  },
  {
    id: "recommendations",
    num: 11,
    title: "Recommendations",
    placeholder:
      "Speech-language services (type, frequency, duration, setting), goal areas to target in therapy, strategies for the educational team and family, referrals to other professionals, assistive technology considerations, and re-evaluation timeline…",
  },
];

const COMM_AREA_IDS: CommAreaId[] = [
  "articulation",
  "receptive",
  "expressive",
  "pragmatics",
  "fluency",
  "voice",
];

const COMM_AREA_LABELS: Record<CommAreaId, string> = {
  articulation: "Articulation / Phonology",
  receptive: "Receptive Language",
  expressive: "Expressive Language",
  pragmatics: "Pragmatics / Social Communication",
  fluency: "Fluency",
  voice: "Voice",
};

const DEFAULT_COMM_AREAS: Record<CommAreaId, CommAreaData> = {
  articulation: { status: "na", findings: "" },
  receptive: { status: "na", findings: "" },
  expressive: { status: "na", findings: "" },
  pragmatics: { status: "na", findings: "" },
  fluency: { status: "na", findings: "" },
  voice: { status: "na", findings: "" },
};

const ASSESSMENT_METHODS_LIST = [
  "CELF-5",
  "CELF-5 Screener",
  "ROWPVT-4",
  "EOWPVT-4",
  "GFTA-3",
  "PPVT-5",
  "EVT-3",
  "PLS-5",
  "CASL-2",
  "SPELT-3",
  "OWLS-II",
  "TNL-2",
  "TOPS-3",
  "TAPS-4",
  "SLAM",
  "Clinical observation",
  "Language sample",
  "Informal assessment",
  "Curriculum-based assessment",
  "Standardized questionnaire",
  "Teacher/parent interview",
];

const SCORE_DESCRIPTORS = [
  "",
  "Within Normal Limits",
  "High Average",
  "Average",
  "Low Average",
  "Borderline",
  "Mild Delay",
  "Moderate Delay",
  "Severe Delay",
  "Above Average",
  "Below Average",
];

const SECTION_SHORT_TITLES: Record<SectionId, string> = {
  referral:        "Referral Info",
  background:      "Background",
  methods:         "Methods",
  behavioral:      "Behavioral Obs.",
  commAreas:       "Comm. Areas",
  testResults:     "Test Results",
  informal:        "Informal Assess.",
  hearing:         "Hearing & Vision",
  summary:         "Summary",
  impact:          "Impact & Eligibility",
  recommendations: "Recommendations",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGrade(g: string | null): string {
  if (!g) return "";
  if (g === "KINDERGARTEN") return "K";
  if (g === "PRE_K") return "Pre-K";
  return g.replace("GRADE_", "Gr. ");
}

function formatDisability(d: string | null): string {
  if (!d) return "";
  return d.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function newTestRow(): TestRow {
  return {
    id: Math.random().toString(36).slice(2),
    testName: "",
    standardScore: "",
    percentile: "",
    descriptor: "",
  };
}

/** Compress + resize an image to max 1600px, returns base64 JPEG */
function compressImage(
  file: File
): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Fallback: read raw base64
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve({
          base64: result.split(",")[1],
          mediaType: file.type || "image/jpeg",
        });
      };
      reader.readAsDataURL(file);
    };
    img.src = url;
  });
}

/** Read any file as raw base64 (used for PDFs) */
function readAsBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ base64: result.split(",")[1], mediaType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Serialize ────────────────────────────────────────────────────────────────

function serializeState(
  sectionText: Record<SimpleTextSectionId, string>,
  selectedMethods: string[],
  methodsNotes: string,
  commAreas: Record<CommAreaId, CommAreaData>,
  testRows: TestRow[],
  testInterpretation: string
): string {
  const parts: string[] = [];

  const addSection = (header: string, text: string) => {
    if (text.trim()) parts.push(`${header}:\n${text.trim()}`);
  };

  addSection("STUDENT & REFERRAL INFORMATION", sectionText.referral);
  addSection("BACKGROUND INFORMATION", sectionText.background);

  const methodLines: string[] = [];
  if (selectedMethods.length > 0)
    methodLines.push(`Methods: ${selectedMethods.join(", ")}`);
  if (methodsNotes.trim()) methodLines.push(`Notes: ${methodsNotes.trim()}`);
  if (methodLines.length > 0)
    parts.push(`ASSESSMENT METHODS:\n${methodLines.join("\n")}`);

  addSection("BEHAVIORAL OBSERVATIONS", sectionText.behavioral);

  const commLines: string[] = [];
  for (const id of COMM_AREA_IDS) {
    const area = commAreas[id];
    if (area.status !== "na" || area.findings.trim()) {
      const label = COMM_AREA_LABELS[id];
      const statusLabel =
        area.status === "assessed"
          ? "Assessed"
          : area.status === "not-assessed"
          ? "Not Assessed"
          : "N/A";
      commLines.push(`${label}: ${statusLabel}`);
      if (area.findings.trim()) commLines.push(`Findings: ${area.findings.trim()}`);
    }
  }
  if (commLines.length > 0)
    parts.push(`COMMUNICATION AREAS ASSESSED:\n${commLines.join("\n")}`);

  const testLines: string[] = [];
  const validRows = testRows.filter((r) => r.testName.trim());
  if (validRows.length > 0) {
    testLines.push("Test Scores:");
    for (const row of validRows) {
      testLines.push(
        `| ${row.testName} | ${row.standardScore} | ${row.percentile} | ${row.descriptor} |`
      );
    }
  }
  if (testInterpretation.trim())
    testLines.push(`Interpretation:\n${testInterpretation.trim()}`);
  if (testLines.length > 0)
    parts.push(`TEST RESULTS & FINDINGS:\n${testLines.join("\n")}`);

  addSection("INFORMAL ASSESSMENT & LANGUAGE SAMPLE", sectionText.informal);
  addSection("HEARING, VISION & RELATED FACTORS", sectionText.hearing);
  addSection("SUMMARY & CLINICAL INTERPRETATION", sectionText.summary);
  addSection("EDUCATIONAL IMPACT & ELIGIBILITY", sectionText.impact);
  addSection("RECOMMENDATIONS", sectionText.recommendations);

  return parts.join("\n\n");
}

// ─── Parse ────────────────────────────────────────────────────────────────────

interface ParsedEditorState {
  sectionText: Record<SimpleTextSectionId, string>;
  selectedMethods: string[];
  methodsNotes: string;
  commAreas: Record<CommAreaId, CommAreaData>;
  testRows: TestRow[];
  testInterpretation: string;
}

function extractSectionText(content: string, headerPattern: string): string {
  const esc = headerPattern.replace(/[+*?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(?:^|\\n\\n)${esc}[^\\n]*:\\n([\\s\\S]*?)(?=\\n\\n[A-Z][A-Z ,\\/()&]+:|$)`,
    "i"
  );
  return content.match(re)?.[1]?.trim() ?? "";
}

function parseContent(content: string): ParsedEditorState {
  const result: ParsedEditorState = {
    sectionText: {
      referral: "",
      background: "",
      behavioral: "",
      informal: "",
      hearing: "",
      summary: "",
      impact: "",
      recommendations: "",
    },
    selectedMethods: [],
    methodsNotes: "",
    commAreas: {
      articulation: { status: "na", findings: "" },
      receptive: { status: "na", findings: "" },
      expressive: { status: "na", findings: "" },
      pragmatics: { status: "na", findings: "" },
      fluency: { status: "na", findings: "" },
      voice: { status: "na", findings: "" },
    },
    testRows: [],
    testInterpretation: "",
  };

  if (!content.trim()) return result;

  result.sectionText.referral = extractSectionText(
    content,
    "STUDENT & REFERRAL INFORMATION"
  );
  result.sectionText.background = extractSectionText(
    content,
    "BACKGROUND INFORMATION"
  );
  result.sectionText.behavioral = extractSectionText(
    content,
    "BEHAVIORAL OBSERVATIONS"
  );
  result.sectionText.informal = extractSectionText(
    content,
    "INFORMAL ASSESSMENT"
  );
  result.sectionText.hearing = extractSectionText(content, "HEARING, VISION");
  result.sectionText.summary = extractSectionText(
    content,
    "SUMMARY & CLINICAL"
  );
  result.sectionText.impact = extractSectionText(
    content,
    "EDUCATIONAL IMPACT"
  );
  result.sectionText.recommendations = extractSectionText(
    content,
    "RECOMMENDATIONS"
  );

  const methodsSec = extractSectionText(content, "ASSESSMENT METHODS");
  if (methodsSec) {
    const mLine = methodsSec.match(/^Methods: (.+)$/m);
    if (mLine)
      result.selectedMethods = mLine[1]
        .split(", ")
        .map((s) => s.trim())
        .filter(Boolean);
    const nLine = methodsSec.match(/^Notes: ([\s\S]+)$/m);
    if (nLine) result.methodsNotes = nLine[1].trim();
  }

  const commSec = extractSectionText(content, "COMMUNICATION AREAS ASSESSED");
  if (commSec) {
    for (const id of COMM_AREA_IDS) {
      const label = COMM_AREA_LABELS[id];
      const esc = label.replace(/[+*?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "\\/");
      const statusRe = new RegExp(
        `^${esc}: (Assessed|Not Assessed|N\\/A)`,
        "im"
      );
      const sm = commSec.match(statusRe);
      if (sm) {
        const status: CommAreaStatus =
          sm[1] === "Assessed"
            ? "assessed"
            : sm[1] === "Not Assessed"
            ? "not-assessed"
            : "na";
        const findingsRe = new RegExp(
          `${esc}: [^\\n]+\\nFindings: ([^\\n]+)`,
          "i"
        );
        const fm = commSec.match(findingsRe);
        result.commAreas[id] = { status, findings: fm?.[1]?.trim() ?? "" };
      }
    }
  }

  const testSec = extractSectionText(content, "TEST RESULTS & FINDINGS");
  if (testSec) {
    const rowRe = /\| (.+?) \| (.+?) \| (.+?) \| (.+?) \|/g;
    let m;
    while ((m = rowRe.exec(testSec)) !== null) {
      result.testRows.push({
        id: Math.random().toString(36).slice(2),
        testName: m[1].trim(),
        standardScore: m[2].trim(),
        percentile: m[3].trim(),
        descriptor: m[4].trim(),
      });
    }
    const im = testSec.match(/Interpretation:\n?([\s\S]+?)(?=\n[A-Z]|$)/i);
    if (im) result.testInterpretation = im[1].trim();
  }

  const hasStructure = /\n\n[A-Z][A-Z &\/(),]+:\n/.test(content);
  if (!hasStructure && !result.sectionText.background) {
    result.sectionText.background = content.trim();
  }

  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EvaluationsPage({ students }: EvaluationsPageProps) {
  // ── Left panel
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // ── Report list
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // ── Report metadata
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const [reportStatus, setReportStatus] = useState("draft");

  // ── Section 1, 2, 4, 7, 8, 9, 10, 11 — simple text
  const [sectionText, setSectionText] = useState<Record<SimpleTextSectionId, string>>({
    referral: "",
    background: "",
    behavioral: "",
    informal: "",
    hearing: "",
    summary: "",
    impact: "",
    recommendations: "",
  });

  // ── Section 3 — Assessment Methods
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [methodsNotes, setMethodsNotes] = useState("");
  const [customMethod, setCustomMethod] = useState("");

  // ── Section 5 — Communication Areas
  const [commAreas, setCommAreas] =
    useState<Record<CommAreaId, CommAreaData>>({ ...DEFAULT_COMM_AREAS });

  // ── Section 6 — Test Results
  const [testRows, setTestRows] = useState<TestRow[]>([newTestRow()]);
  const [testInterpretation, setTestInterpretation] = useState("");

  // ── Upload state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // ── UI
  const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(
    new Set(ALL_SECTION_META.map((s) => s.id))
  );
  const [activeSection, setActiveSection] = useState<SectionId>("referral");
  const [showUpload, setShowUpload] = useState(false);

  // ── Async / save state
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // ── Refs
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedReportIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement>>>({});

  useEffect(() => {
    selectedReportIdRef.current = selectedReportId;
  }, [selectedReportId]);

  // ── Derived
  const selectedStudent =
    students.find((s) => s.id === selectedStudentId) ?? null;

  const filteredStudents = students.filter((s) => {
    const q = search.toLowerCase();
    return !q || `${s.firstName} ${s.lastName}`.toLowerCase().includes(q);
  });

  // ── Section completion
  function hasSectionContent(id: SectionId): boolean {
    switch (id) {
      case "referral":        return !!sectionText.referral.trim();
      case "background":      return !!sectionText.background.trim();
      case "methods":         return selectedMethods.length > 0 || !!methodsNotes.trim();
      case "behavioral":      return !!sectionText.behavioral.trim();
      case "commAreas":       return COMM_AREA_IDS.some((a) => commAreas[a].status !== "na");
      case "testResults":     return testRows.some((r) => r.testName.trim()) || !!testInterpretation.trim();
      case "informal":        return !!sectionText.informal.trim();
      case "hearing":         return !!sectionText.hearing.trim();
      case "summary":         return !!sectionText.summary.trim();
      case "impact":          return !!sectionText.impact.trim();
      case "recommendations": return !!sectionText.recommendations.trim();
    }
  }

  const completedCount = ALL_SECTION_META.filter((s) =>
    hasSectionContent(s.id)
  ).length;

  // ── Load reports when student changes
  useEffect(() => {
    if (!selectedStudentId) {
      setReports([]);
      return;
    }
    setLoadingReports(true);
    setSelectedReportId(null);
    setReportTitle("");
    setReportStatus("draft");
    resetEditorState();

    fetch(`/api/evaluations?studentId=${selectedStudentId}`)
      .then((r) => r.json())
      .then((data) => setReports(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Failed to load reports"))
      .finally(() => setLoadingReports(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId]);

  // ── Auto-save whenever structured content changes
  useEffect(() => {
    if (!selectedReportId || isLoadingRef.current) return;
    setHasUnsavedChanges(true);
    const serialized = serializeState(
      sectionText,
      selectedMethods,
      methodsNotes,
      commAreas,
      testRows,
      testInterpretation
    );
    scheduleContentSave(serialized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionText, selectedMethods, methodsNotes, commAreas, testRows, testInterpretation]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function resetEditorState() {
    setSectionText({
      referral: "",
      background: "",
      behavioral: "",
      informal: "",
      hearing: "",
      summary: "",
      impact: "",
      recommendations: "",
    });
    setSelectedMethods([]);
    setMethodsNotes("");
    setCommAreas({ ...DEFAULT_COMM_AREAS });
    setTestRows([newTestRow()]);
    setTestInterpretation("");
    setExpandedSections(new Set(ALL_SECTION_META.map((s) => s.id)));
    setUploadedFiles([]);
    setHasUnsavedChanges(false);
    setLastSavedAt(null);
    setActiveSection("referral");
    setShowUpload(false);
  }

  function loadParsedState(parsed: ParsedEditorState) {
    isLoadingRef.current = true;
    setSectionText(parsed.sectionText);
    setSelectedMethods(parsed.selectedMethods);
    setMethodsNotes(parsed.methodsNotes);
    setCommAreas(parsed.commAreas);
    setTestRows(parsed.testRows.length > 0 ? parsed.testRows : [newTestRow()]);
    setTestInterpretation(parsed.testInterpretation);

    const filledIds = ALL_SECTION_META.filter((s) => {
      switch (s.id) {
        case "referral":        return !!parsed.sectionText.referral.trim();
        case "background":      return !!parsed.sectionText.background.trim();
        case "methods":         return parsed.selectedMethods.length > 0 || !!parsed.methodsNotes.trim();
        case "behavioral":      return !!parsed.sectionText.behavioral.trim();
        case "commAreas":       return COMM_AREA_IDS.some((a) => parsed.commAreas[a].status !== "na");
        case "testResults":     return parsed.testRows.some((r) => r.testName.trim()) || !!parsed.testInterpretation.trim();
        case "informal":        return !!parsed.sectionText.informal.trim();
        case "hearing":         return !!parsed.sectionText.hearing.trim();
        case "summary":         return !!parsed.sectionText.summary.trim();
        case "impact":          return !!parsed.sectionText.impact.trim();
        case "recommendations": return !!parsed.sectionText.recommendations.trim();
        default: return false;
      }
    }).map((s) => s.id);

    setExpandedSections(
      filledIds.length === 0
        ? new Set(ALL_SECTION_META.map((s) => s.id))
        : new Set(filledIds)
    );

    setTimeout(() => {
      isLoadingRef.current = false;
    }, 200);
  }

  const scheduleContentSave = useCallback((content: string) => {
    const rid = selectedReportIdRef.current;
    if (!rid) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await fetch(`/api/evaluations/${rid}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        const now = new Date();
        setLastSavedAt(now);
        setHasUnsavedChanges(false);
        setReports((prev) =>
          prev.map((r) =>
            r.id === rid ? { ...r, updatedAt: now.toISOString() } : r
          )
        );
      } catch {
        toast.error("Failed to save");
      } finally {
        setIsSaving(false);
      }
    }, 1500);
  }, []);

  function toggleSection(id: SectionId) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function scrollToSection(id: SectionId) {
    const el = sectionRefs.current[id];
    const container = contentRef.current;
    if (!el || !container) return;
    const elTop = el.getBoundingClientRect().top;
    const containerTop = container.getBoundingClientRect().top;
    container.scrollBy({ top: elTop - containerTop - 24, behavior: "smooth" });
    setActiveSection(id);
  }

  function handleContentScroll() {
    const container = contentRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    let closestId: SectionId = "referral";
    let closestDist = Infinity;
    for (const { id } of ALL_SECTION_META) {
      const el = sectionRefs.current[id];
      if (!el) continue;
      const dist = Math.abs(el.getBoundingClientRect().top - containerTop - 64);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }
    setActiveSection(closestId);
  }

  // ── Manual save ──────────────────────────────────────────────────────────
  const saveNow = useCallback(async () => {
    const rid = selectedReportIdRef.current;
    if (!rid) return;
    // Cancel pending debounced save
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const serialized = serializeState(
      sectionText,
      selectedMethods,
      methodsNotes,
      commAreas,
      testRows,
      testInterpretation
    );
    setIsSaving(true);
    try {
      await fetch(`/api/evaluations/${rid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: serialized }),
      });
      const now = new Date();
      setLastSavedAt(now);
      setHasUnsavedChanges(false);
      setReports((prev) =>
        prev.map((r) =>
          r.id === rid ? { ...r, updatedAt: now.toISOString() } : r
        )
      );
    } catch {
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [sectionText, selectedMethods, methodsNotes, commAreas, testRows, testInterpretation]);

  // Cmd/Ctrl + S keyboard shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveNow();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveNow]);

  // ── File upload ──────────────────────────────────────────────────────────
  async function handleFileUpload(files: FileList | null) {
    if (!files) return;
    const MAX_FILES = 10;
    const remaining = MAX_FILES - uploadedFiles.length;
    if (remaining <= 0) {
      toast.error("Maximum 10 images allowed");
      return;
    }

    const accepted = Array.from(files)
      .filter((f) => f.type.startsWith("image/") || f.type === "application/pdf")
      .slice(0, remaining);

    if (accepted.length === 0) {
      toast.error("Please upload image or PDF files");
      return;
    }

    const newFiles: UploadedFile[] = await Promise.all(
      accepted.map(async (file) => {
        const isPdf = file.type === "application/pdf";
        const { base64, mediaType } = isPdf
          ? await readAsBase64(file)
          : await compressImage(file);
        return {
          id: Math.random().toString(36).slice(2),
          name: file.name,
          previewUrl: isPdf ? "" : URL.createObjectURL(file),
          base64,
          mediaType,
          isPdf,
        };
      })
    );

    setUploadedFiles((prev) => [...prev, ...newFiles]);
  }

  function removeUploadedFile(id: string) {
    setUploadedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) URL.revokeObjectURL(file.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }

  // ── Extract from images ──────────────────────────────────────────────────
  async function extractFromImages() {
    if (uploadedFiles.length === 0 || !selectedReportId) return;
    setIsExtracting(true);

    try {
      const res = await fetch("/api/evaluations/extract-from-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: uploadedFiles.map((f) => ({
            base64: f.base64,
            mediaType: f.mediaType,
          })),
          studentContext: selectedStudent
            ? `${selectedStudent.firstName} ${selectedStudent.lastName}, Grade: ${selectedStudent.gradeLevel ?? "unknown"}, School: ${selectedStudent.schoolName}`
            : "",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to extract information");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ext = data.extracted as Record<string, any>;

      // ── Merge extracted data (populate empty fields, append to lists) ──
      let fieldsPopulated = 0;

      // Simple text sections — only fill if currently empty
      const simpleKeys: SimpleTextSectionId[] = [
        "referral",
        "background",
        "behavioral",
        "informal",
        "hearing",
        "summary",
        "impact",
        "recommendations",
      ];
      const nextSectionText = { ...sectionText };
      for (const key of simpleKeys) {
        if (!nextSectionText[key].trim() && ext[key]?.trim()) {
          nextSectionText[key] = String(ext[key]);
          fieldsPopulated++;
        }
      }

      // Methods — union (add newly found ones)
      let nextMethods = [...selectedMethods];
      if (Array.isArray(ext.selectedMethods) && ext.selectedMethods.length > 0) {
        for (const m of ext.selectedMethods as string[]) {
          if (m && !nextMethods.includes(m)) nextMethods.push(m);
        }
        if (nextMethods.length > selectedMethods.length) fieldsPopulated++;
      }

      // Methods notes — fill if empty
      let nextMethodsNotes = methodsNotes;
      if (!methodsNotes.trim() && ext.methodsNotes?.trim()) {
        nextMethodsNotes = String(ext.methodsNotes);
        fieldsPopulated++;
      }

      // Comm areas — update if currently "na"
      const nextCommAreas = { ...commAreas };
      if (ext.commAreas && typeof ext.commAreas === "object") {
        for (const id of COMM_AREA_IDS) {
          const extArea = ext.commAreas[id];
          if (!extArea) continue;
          const current = nextCommAreas[id];
          if (
            current.status === "na" &&
            (extArea.status === "assessed" || extArea.status === "not-assessed")
          ) {
            nextCommAreas[id] = {
              status: extArea.status as CommAreaStatus,
              findings: extArea.findings?.trim() ?? "",
            };
            fieldsPopulated++;
          } else if (
            current.status === "assessed" &&
            !current.findings.trim() &&
            extArea.findings?.trim()
          ) {
            nextCommAreas[id] = {
              ...current,
              findings: String(extArea.findings).trim(),
            };
            fieldsPopulated++;
          }
        }
      }

      // Test rows — add extracted rows, dedup by name
      let nextTestRows = [...testRows];
      const existingNames = new Set(
        nextTestRows.map((r) => r.testName.trim().toLowerCase()).filter(Boolean)
      );
      if (Array.isArray(ext.testRows) && ext.testRows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const incoming = (ext.testRows as any[]).filter(
          (r) =>
            r.testName?.trim() &&
            !existingNames.has(r.testName.trim().toLowerCase())
        );
        if (incoming.length > 0) {
          const newRows: TestRow[] = incoming.map((r) => ({
            id: Math.random().toString(36).slice(2),
            testName: String(r.testName ?? "").trim(),
            standardScore: String(r.standardScore ?? "").trim(),
            percentile: String(r.percentile ?? "").trim(),
            descriptor: String(r.descriptor ?? "").trim(),
          }));
          // Replace blank placeholder row if it's the only one
          const isOnlyBlank =
            nextTestRows.length === 1 && !nextTestRows[0].testName.trim();
          nextTestRows = isOnlyBlank ? newRows : [...nextTestRows, ...newRows];
          fieldsPopulated++;
        }
      }

      // Test interpretation — fill if empty
      let nextTestInterpretation = testInterpretation;
      if (!testInterpretation.trim() && ext.testInterpretation?.trim()) {
        nextTestInterpretation = String(ext.testInterpretation).trim();
        fieldsPopulated++;
      }

      // ── Apply all changes atomically ──
      isLoadingRef.current = true;
      setSectionText(nextSectionText);
      setSelectedMethods(nextMethods);
      if (nextMethodsNotes !== methodsNotes) setMethodsNotes(nextMethodsNotes);
      setCommAreas(nextCommAreas);
      setTestRows(nextTestRows);
      if (nextTestInterpretation !== testInterpretation)
        setTestInterpretation(nextTestInterpretation);

      // Expand sections that received new content
      const toExpand = new Set(expandedSections);
      if (nextSectionText.referral !== sectionText.referral)        toExpand.add("referral");
      if (nextSectionText.background !== sectionText.background)    toExpand.add("background");
      if (nextMethodsNotes !== methodsNotes ||
          nextMethods.length > selectedMethods.length)              toExpand.add("methods");
      if (nextSectionText.behavioral !== sectionText.behavioral)    toExpand.add("behavioral");
      if (JSON.stringify(nextCommAreas) !== JSON.stringify(commAreas)) toExpand.add("commAreas");
      if (nextTestRows.length !== testRows.length ||
          nextTestInterpretation !== testInterpretation)             toExpand.add("testResults");
      if (nextSectionText.informal !== sectionText.informal)         toExpand.add("informal");
      if (nextSectionText.hearing !== sectionText.hearing)           toExpand.add("hearing");
      if (nextSectionText.summary !== sectionText.summary)           toExpand.add("summary");
      if (nextSectionText.impact !== sectionText.impact)             toExpand.add("impact");
      if (nextSectionText.recommendations !== sectionText.recommendations) toExpand.add("recommendations");
      setExpandedSections(toExpand);

      setTimeout(() => {
        isLoadingRef.current = false;
      }, 200);

      if (fieldsPopulated === 0) {
        toast.info("No new information found in the images");
      } else {
        toast.success(
          `Populated ${fieldsPopulated} section${fieldsPopulated === 1 ? "" : "s"} from your images — review each one`
        );
      }
    } catch {
      toast.error("Failed to extract information");
    } finally {
      setIsExtracting(false);
    }
  }

  // ── Open report ──────────────────────────────────────────────────────────
  async function openReport(reportId: string) {
    try {
      const res = await fetch(`/api/evaluations/${reportId}`);
      const data = await res.json();
      setSelectedReportId(reportId);
      setReportTitle(data.title ?? "");
      setReportStatus(data.status ?? "draft");
      setLastSavedAt(data.updatedAt ? new Date(data.updatedAt) : null);
      setHasUnsavedChanges(false);
      loadParsedState(parseContent(data.content ?? ""));
    } catch {
      toast.error("Failed to load report");
    }
  }

  // ── Create new report ────────────────────────────────────────────────────
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
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to create report");
        return;
      }
      const data = await res.json();
      setReports((prev) => [
        { id: data.id, title: data.title, status: data.status, updatedAt: data.updatedAt },
        ...prev,
      ]);
      setSelectedReportId(data.id);
      setReportTitle(data.title);
      setReportStatus(data.status ?? "draft");
      isLoadingRef.current = true;
      resetEditorState();
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 200);
    } catch {
      toast.error("Failed to create report");
    }
  }

  // ── Save title on blur ───────────────────────────────────────────────────
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

  // ── Update status ────────────────────────────────────────────────────────
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

  // ── Delete report ────────────────────────────────────────────────────────
  async function deleteReport(reportId: string) {
    if (!confirm("Delete this report? This cannot be undone.")) return;
    try {
      await fetch(`/api/evaluations/${reportId}`, { method: "DELETE" });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      if (selectedReportId === reportId) {
        setSelectedReportId(null);
        setReportTitle("");
        setReportStatus("draft");
        resetEditorState();
      }
      toast.success("Report deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  // ── Section text helpers ─────────────────────────────────────────────────
  function handleSectionTextChange(id: SimpleTextSectionId, value: string) {
    setSectionText((prev) => ({ ...prev, [id]: value }));
  }

  function setCommAreaStatus(id: CommAreaId, status: CommAreaStatus) {
    setCommAreas((prev) => ({ ...prev, [id]: { ...prev[id], status } }));
  }

  function setCommAreaFindings(id: CommAreaId, findings: string) {
    setCommAreas((prev) => ({ ...prev, [id]: { ...prev[id], findings } }));
  }

  function updateTestRow(id: string, field: keyof TestRow, value: string) {
    setTestRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  function addTestRow() {
    setTestRows((prev) => [...prev, newTestRow()]);
  }

  function removeTestRow(id: string) {
    setTestRows((prev) => prev.filter((r) => r.id !== id));
  }

  function toggleMethod(method: string) {
    setSelectedMethods((prev) =>
      prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method]
    );
  }

  function addCustomMethod() {
    const m = customMethod.trim();
    if (!m) return;
    if (!selectedMethods.includes(m)) setSelectedMethods((prev) => [...prev, m]);
    setCustomMethod("");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const isFinal = reportStatus === "final";

  return (
    <div className="flex flex-col h-full max-w-[1600px]">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Evaluations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Draft and manage evaluation reports
          </p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border bg-card">

        {/* ── Left: Caseload ── */}
        <aside className="w-56 shrink-0 flex flex-col border-r bg-sidebar overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Caseload</span>
              <Badge variant="secondary" className="text-xs">{students.length}</Badge>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col px-2 py-2">
            <div className="relative mb-2 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students…"
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredStudents.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-6 text-center">No students found</p>
              )}
              {filteredStudents.map((student) => {
                const active = student.id === selectedStudentId;
                const reevalSoon = isReevalSoon(student.reevaluationDue);
                return (
                  <button
                    key={student.id}
                    onClick={() => setSelectedStudentId(student.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors border-l-2 rounded-r-lg",
                      active ? "bg-primary/10 border-primary" : "border-transparent hover:bg-sidebar-accent"
                    )}
                  >
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                    )}>
                      {getInitials(student.firstName, student.lastName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className={cn("text-xs font-medium truncate", active ? "text-primary" : "text-foreground")}>
                          {student.firstName} {student.lastName}
                        </span>
                        {reevalSoon && (
                          <span className="shrink-0 inline-block w-1.5 h-1.5 rounded-full bg-amber-500" title="Re-evaluation due soon" />
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
          </div>
        </aside>

        {/* ── Right: Workspace ── */}
        <main className="flex flex-col flex-1 min-h-0 overflow-hidden">

          {/* ── State 1: No student selected ── */}
          {!selectedStudent ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <ClipboardCheck className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-base font-semibold text-foreground">Evaluation Reports</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Select a student from the caseload to draft, edit, or view their evaluation reports.
              </p>
            </div>

          /* ── State 2: Student selected, no report open ── */
          ) : !selectedReportId ? (
            <div className="flex-1 overflow-y-auto">
              <div className="p-5 space-y-4 max-w-3xl mx-auto">
                {/* Student header */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h1 className="text-lg font-semibold text-foreground">
                      {selectedStudent.firstName} {selectedStudent.lastName}
                    </h1>
                    <p className="text-xs text-muted-foreground">
                      {formatGrade(selectedStudent.gradeLevel)} · {selectedStudent.schoolName}
                      {selectedStudent.reevaluationDue && (
                        <span className={cn("ml-2", isReevalSoon(selectedStudent.reevaluationDue) ? "text-amber-600 font-medium" : "")}>
                          · Re-eval due {formatDate(selectedStudent.reevaluationDue)}
                        </span>
                      )}
                    </p>
                  </div>
                  <Button size="sm" onClick={createReport} className="shrink-0">
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> New Report
                  </Button>
                </div>

                {/* Reports list */}
                <div className="rounded-xl border bg-card">
                  <div className="flex items-center px-4 py-3 border-b">
                    <span className="text-sm font-medium text-foreground flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                      Reports
                      {reports.length > 0 && (
                        <Badge variant="secondary" className="text-xs">{reports.length}</Badge>
                      )}
                    </span>
                  </div>
                  {loadingReports ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : reports.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-sm text-muted-foreground">No reports yet for this student.</p>
                      <Button size="sm" variant="ghost" className="mt-2" onClick={createReport}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Create first report
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {reports.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => openReport(r.id)}
                        >
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 text-sm font-medium text-foreground truncate">{r.title}</span>
                          <Badge variant="outline" className={cn("text-xs shrink-0",
                            r.status === "final"
                              ? "border-green-300 bg-green-50 text-green-700"
                              : "border-amber-300 bg-amber-50 text-amber-700"
                          )}>
                            {r.status === "final" ? "Final" : "Draft"}
                          </Badge>
                          <span className="text-xs text-muted-foreground shrink-0">{formatDate(r.updatedAt)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteReport(r.id); }}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

          /* ── State 3: Report open — full editor ── */
          ) : (
            <>
              {/* ── Sticky top bar ── */}
              <div className="flex items-center gap-2 px-3 h-11 border-b bg-card shrink-0 min-w-0">
                <button
                  onClick={() => {
                    setSelectedReportId(null);
                    setReportTitle("");
                    setReportStatus("draft");
                    resetEditorState();
                  }}
                  className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reports</span>
                </button>
                <div className="w-px h-4 bg-border shrink-0" />
                <Input
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  onBlur={saveTitle}
                  className="flex-1 border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0 h-auto min-w-0"
                  placeholder="Report title…"
                  disabled={isFinal}
                />
                {/* Save status */}
                <div className="shrink-0">
                  {isSaving ? (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="hidden sm:inline">Saving…</span>
                    </span>
                  ) : hasUnsavedChanges ? (
                    <span className="text-xs text-amber-600 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block shrink-0" />
                      <span className="hidden sm:inline">Unsaved</span>
                    </span>
                  ) : lastSavedAt ? (
                    <span className="text-xs text-emerald-600 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      <span className="hidden sm:inline">Saved</span>
                    </span>
                  ) : null}
                </div>
                {/* Status badge */}
                <Badge variant="outline" className={cn("text-xs shrink-0",
                  isFinal
                    ? "border-green-300 bg-green-50 text-green-700"
                    : "border-amber-300 bg-amber-50 text-amber-700"
                )}>
                  {isFinal ? <><CheckCircle2 className="h-3 w-3 mr-1" />Final</> : "Draft"}
                </Badge>
                {/* Action buttons */}
                <Button
                  size="sm"
                  variant={showUpload ? "secondary" : "ghost"}
                  onClick={() => setShowUpload((v) => !v)}
                  className="h-7 px-2.5 gap-1.5 text-xs shrink-0"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Upload</span>
                </Button>
                {!isFinal && (
                  <Button
                    size="sm"
                    variant={hasUnsavedChanges ? "default" : "outline"}
                    onClick={saveNow}
                    disabled={isSaving}
                    className="h-7 px-2.5 gap-1.5 text-xs shrink-0"
                    title="Save (⌘S / Ctrl+S)"
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">{isSaving ? "Saving…" : "Save"}</span>
                  </Button>
                )}
                {!isFinal ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 border-green-300 text-green-700 hover:bg-green-50 gap-1.5 text-xs shrink-0"
                    onClick={() => updateStatus("final")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Finalize</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs shrink-0"
                    onClick={() => updateStatus("draft")}
                  >
                    Reopen
                  </Button>
                )}
              </div>

              {/* ── Upload panel (collapsible) ── */}
              {showUpload && !isFinal && (
                <div className="border-b px-4 py-3 shrink-0 bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">Upload Assessment Documents</span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">— photos or scans auto-populate the form</span>
                    </div>
                    <button onClick={() => setShowUpload(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {/* Drop zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files); }}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-4 cursor-pointer transition-colors",
                      isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    <p className="text-xs font-medium text-foreground">
                      Drag files here or <span className="text-primary">browse</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">JPG, PNG, WEBP, PDF · up to 10 files</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => { handleFileUpload(e.target.files); e.target.value = ""; }}
                  />
                  {/* Thumbnails + extract */}
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap gap-2">
                        {uploadedFiles.map((file) => (
                          <div key={file.id} className="relative group h-14 w-14 rounded-md overflow-hidden border bg-muted shrink-0">
                            {file.isPdf ? (
                              <div className="h-full w-full flex flex-col items-center justify-center gap-0.5 bg-red-50">
                                <FileText className="h-5 w-5 text-red-400" />
                                <span className="text-[9px] font-medium text-red-500">PDF</span>
                              </div>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={file.previewUrl} alt={file.name} className="h-full w-full object-cover" />
                            )}
                            <button
                              onClick={() => removeUploadedFile(file.id)}
                              className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                        {uploadedFiles.length < 10 && (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="h-14 w-14 rounded-md border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors shrink-0"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <Button size="sm" onClick={extractFromImages} disabled={isExtracting} className="gap-1.5">
                        {isExtracting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {isExtracting ? "Extracting information…" : "Extract & Populate Form"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Editor: section nav + content ── */}
              <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* Section nav */}
                <nav className="w-44 shrink-0 border-r overflow-y-auto py-2 bg-sidebar">
                  <div className="px-3 pb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Sections — {completedCount}/11
                    </span>
                  </div>
                  {ALL_SECTION_META.map(({ id, num }) => {
                    const isActive = activeSection === id;
                    const hasContent = hasSectionContent(id);
                    return (
                      <button
                        key={id}
                        onClick={() => scrollToSection(id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                        )}
                      >
                        <div className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                          hasContent
                            ? "bg-emerald-100 text-emerald-700"
                            : isActive
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground/60"
                        )}>
                          {hasContent ? <Check className="h-2.5 w-2.5" /> : num}
                        </div>
                        <span className="text-xs truncate leading-snug">{SECTION_SHORT_TITLES[id]}</span>
                      </button>
                    );
                  })}
                </nav>

                {/* Scrollable content */}
                <div
                  ref={contentRef}
                  onScroll={handleContentScroll}
                  className="flex-1 overflow-y-auto"
                >
                  <div className="px-6 py-5 max-w-3xl">
                    {ALL_SECTION_META.map(({ id, num, title, placeholder }, idx) => (
                      <div
                        key={id}
                        ref={(el) => { if (el) sectionRefs.current[id] = el; }}
                        className={cn("py-5", idx > 0 && "border-t border-border/60")}
                      >
                        {/* Section header */}
                        <div className="flex items-center gap-2.5 mb-4">
                          <div className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                            hasSectionContent(id)
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-primary/10 text-primary"
                          )}>
                            {hasSectionContent(id) ? <Check className="h-3.5 w-3.5" /> : num}
                          </div>
                          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                        </div>

                        {/* ── Section 3: Assessment Methods ── */}
                        {id === "methods" && (
                          <div className="space-y-4">
                            <p className="text-xs text-muted-foreground">Select all assessment methods used:</p>
                            <div className="flex flex-wrap gap-2">
                              {ASSESSMENT_METHODS_LIST.map((method) => {
                                const selected = selectedMethods.includes(method);
                                return (
                                  <button
                                    key={method}
                                    onClick={() => !isFinal && toggleMethod(method)}
                                    disabled={isFinal}
                                    className={cn(
                                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                      selected
                                        ? "bg-primary/10 border-primary/30 text-primary"
                                        : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted/40",
                                      isFinal && "opacity-60 cursor-default"
                                    )}
                                  >
                                    {selected && <Check className="h-3 w-3" />}
                                    {method}
                                  </button>
                                );
                              })}
                            </div>
                            {!isFinal && (
                              <div className="flex gap-2">
                                <Input
                                  value={customMethod}
                                  onChange={(e) => setCustomMethod(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMethod(); } }}
                                  placeholder="Add a custom assessment tool…"
                                  className="h-8 text-xs flex-1"
                                />
                                <Button size="sm" variant="outline" onClick={addCustomMethod} className="h-8 px-3">
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                            {selectedMethods.filter((m) => !ASSESSMENT_METHODS_LIST.includes(m)).length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {selectedMethods
                                  .filter((m) => !ASSESSMENT_METHODS_LIST.includes(m))
                                  .map((m) => (
                                    <span key={m} className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs text-primary">
                                      {m}
                                      {!isFinal && (
                                        <button onClick={() => toggleMethod(m)} className="hover:text-destructive transition-colors">
                                          <X className="h-3 w-3" />
                                        </button>
                                      )}
                                    </span>
                                  ))}
                              </div>
                            )}
                            <div>
                              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                                Additional notes on assessment approach:
                              </label>
                              <Textarea
                                value={methodsNotes}
                                onChange={(e) => setMethodsNotes(e.target.value)}
                                placeholder="Assessment conditions, modifications made, interpreter used, number of sessions, informal measures administered…"
                                className="min-h-[80px] text-sm resize-none"
                                disabled={isFinal}
                              />
                            </div>
                          </div>
                        )}

                        {/* ── Section 5: Communication Areas ── */}
                        {id === "commAreas" && (
                          <div className="space-y-3">
                            {COMM_AREA_IDS.map((areaId) => {
                              const area = commAreas[areaId];
                              return (
                                <div key={areaId} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-xs font-semibold text-foreground">{COMM_AREA_LABELS[areaId]}</span>
                                    <div className="flex items-center gap-1">
                                      {(["assessed", "not-assessed", "na"] as CommAreaStatus[]).map((status) => (
                                        <button
                                          key={status}
                                          disabled={isFinal}
                                          onClick={() => setCommAreaStatus(areaId, status)}
                                          className={cn(
                                            "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                                            area.status === status
                                              ? status === "assessed"
                                                ? "bg-primary/10 border-primary/30 text-primary"
                                                : status === "not-assessed"
                                                ? "bg-muted border-muted-foreground/30 text-muted-foreground"
                                                : "bg-muted border-muted-foreground/20 text-muted-foreground/60"
                                              : "border-border text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50",
                                            isFinal && "cursor-default"
                                          )}
                                        >
                                          {status === "assessed" ? "Assessed" : status === "not-assessed" ? "Not Assessed" : "N/A"}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  {area.status === "assessed" && (
                                    <Textarea
                                      value={area.findings}
                                      onChange={(e) => setCommAreaFindings(areaId, e.target.value)}
                                      placeholder={`Findings for ${COMM_AREA_LABELS[areaId].toLowerCase()}…`}
                                      className="min-h-[70px] text-sm resize-none bg-background"
                                      disabled={isFinal}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Section 6: Test Results ── */}
                        {id === "testResults" && (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <div className="grid grid-cols-[1fr_90px_90px_150px_32px] gap-2 px-1">
                                <span className="text-[11px] font-medium text-muted-foreground">Test / Subtest Name</span>
                                <span className="text-[11px] font-medium text-muted-foreground">Std. Score</span>
                                <span className="text-[11px] font-medium text-muted-foreground">Percentile</span>
                                <span className="text-[11px] font-medium text-muted-foreground">Range / Descriptor</span>
                                <span />
                              </div>
                              {testRows.map((row) => (
                                <div key={row.id} className="grid grid-cols-[1fr_90px_90px_150px_32px] gap-2">
                                  <Input
                                    value={row.testName}
                                    onChange={(e) => updateTestRow(row.id, "testName", e.target.value)}
                                    placeholder="e.g., CELF-5 Core Language"
                                    className="h-8 text-xs"
                                    disabled={isFinal}
                                  />
                                  <Input
                                    value={row.standardScore}
                                    onChange={(e) => updateTestRow(row.id, "standardScore", e.target.value)}
                                    placeholder="e.g., 72"
                                    className="h-8 text-xs"
                                    disabled={isFinal}
                                  />
                                  <Input
                                    value={row.percentile}
                                    onChange={(e) => updateTestRow(row.id, "percentile", e.target.value)}
                                    placeholder="e.g., 3rd"
                                    className="h-8 text-xs"
                                    disabled={isFinal}
                                  />
                                  <select
                                    value={row.descriptor}
                                    onChange={(e) => updateTestRow(row.id, "descriptor", e.target.value)}
                                    disabled={isFinal}
                                    className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {SCORE_DESCRIPTORS.map((d) => (
                                      <option key={d} value={d}>{d || "Select descriptor…"}</option>
                                    ))}
                                  </select>
                                  {!isFinal && (
                                    <button
                                      onClick={() => removeTestRow(row.id)}
                                      disabled={testRows.length === 1}
                                      className="flex items-center justify-center h-8 w-8 rounded text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {!isFinal && (
                                <Button size="sm" variant="ghost" onClick={addTestRow} className="gap-1.5 h-8 text-xs text-muted-foreground">
                                  <Plus className="h-3.5 w-3.5" /> Add row
                                </Button>
                              )}
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                                Interpretation & narrative findings:
                              </label>
                              <Textarea
                                value={testInterpretation}
                                onChange={(e) => setTestInterpretation(e.target.value)}
                                placeholder="Interpret standardized scores in context. Describe what the scores mean for this student's communication development — note patterns across subtests, areas of relative strength or weakness, and how scores compare to same-age peers…"
                                className="min-h-[120px] text-sm resize-none"
                                disabled={isFinal}
                              />
                            </div>
                          </div>
                        )}

                        {/* ── All other sections: textarea ── */}
                        {id !== "methods" && id !== "commAreas" && id !== "testResults" && (
                          <Textarea
                            value={sectionText[id as SimpleTextSectionId] ?? ""}
                            onChange={(e) => handleSectionTextChange(id as SimpleTextSectionId, e.target.value)}
                            placeholder={placeholder}
                            className="min-h-[140px] w-full text-sm resize-none border-0 shadow-none focus-visible:ring-0 p-0 leading-relaxed"
                            disabled={isFinal}
                          />
                        )}
                      </div>
                    ))}
                    {/* Bottom breathing room */}
                    <div className="h-12" />
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
