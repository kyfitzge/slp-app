"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  FileText, Calendar, Wrench, BookOpen, Users,
  ChevronDown, ChevronUp, Lightbulb, Target, Zap, BarChart2, MessageSquare,
} from "lucide-react";
import { createIEPSchema, type CreateIEPInput } from "@/lib/validations/iep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { format, addYears } from "date-fns";

// ─── PLAAFP helpers ───────────────────────────────────────────────────────────

const PLAAFP_SECTIONS = [
  {
    key: "strengths",
    heading: "Strengths",
    icon: Lightbulb,
    placeholder:
      "Describe the student's communication strengths, what they do well, and positive attributes that will support growth…",
  },
  {
    key: "areasOfNeed",
    heading: "Areas of Need",
    icon: Target,
    placeholder:
      "Describe specific areas where the student requires support — articulation, language, fluency, pragmatics, etc.…",
  },
  {
    key: "functionalImpact",
    heading: "Academic & Functional Impact",
    icon: Zap,
    placeholder:
      "How do the student's communication needs affect academic performance, classroom participation, and daily functioning?…",
  },
  {
    key: "baselinePerformance",
    heading: "Baseline Performance",
    icon: BarChart2,
    placeholder:
      "Current measurable performance data — assessment scores, probes, standardized test results — used to set annual goals…",
  },
  {
    key: "communicationProfile",
    heading: "Communication Profile",
    icon: MessageSquare,
    placeholder:
      "Overall communication profile: speech intelligibility, language age equivalents, pragmatic skills, AAC use, etc.…",
  },
] as const;

type PLAAFPKey = (typeof PLAAFP_SECTIONS)[number]["key"];
type PLAAFPState = Record<PLAAFPKey, string>;

function parsePLAAFPForForm(raw?: string | null): PLAAFPState {
  const empty: PLAAFPState = {
    strengths: "",
    areasOfNeed: "",
    functionalImpact: "",
    baselinePerformance: "",
    communicationProfile: "",
  };
  if (!raw) return empty;

  const headingMap: Record<string, PLAAFPKey> = {
    "Strengths": "strengths",
    "Areas of Need": "areasOfNeed",
    "Academic & Functional Impact": "functionalImpact",
    "Baseline Performance": "baselinePerformance",
    "Communication Profile": "communicationProfile",
  };

  const sectionRegex = /^## (.+)$/gm;
  let match: RegExpExecArray | null;
  const positions: Array<{ heading: string; start: number; contentStart: number }> = [];

  while ((match = sectionRegex.exec(raw)) !== null) {
    positions.push({
      heading: match[1].trim(),
      start: match.index,
      contentStart: match.index + match[0].length + 1,
    });
  }

  if (positions.length === 0) return empty; // raw / unstructured — leave fields empty

  for (let i = 0; i < positions.length; i++) {
    const { heading, contentStart } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : raw.length;
    const content = raw.slice(contentStart, end).trim();
    const key = headingMap[heading];
    if (key) empty[key] = content;
  }

  return empty;
}

function composePLAAFP(state: PLAAFPState): string {
  return PLAAFP_SECTIONS.filter((s) => state[s.key].trim())
    .map((s) => `## ${s.heading}\n${state[s.key].trim()}`)
    .join("\n\n");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground mt-1">{children}</p>;
}

function ErrorMsg({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}

// ─── Main form ────────────────────────────────────────────────────────────────

interface IEPFormProps {
  studentId: string;
  iepId?: string;
  defaultValues?: Partial<CreateIEPInput>;
}

export function IEPForm({ studentId, iepId, defaultValues }: IEPFormProps) {
  const router = useRouter();
  const isEditing = !!iepId;

  const today = format(new Date(), "yyyy-MM-dd");
  const oneYearFromNow = format(addYears(new Date(), 1), "yyyy-MM-dd");

  // PLAAFP sub-fields (local state, composed into presentLevels on submit)
  const [plaafp, setPlaafp] = useState<PLAAFPState>(() =>
    parsePLAAFPForForm(defaultValues?.presentLevels)
  );
  const [plaafpOpen, setPlaafpOpen] = useState(true);

  // Transition notes toggle
  const [showTransition, setShowTransition] = useState(
    !!defaultValues?.transitionNotes
  );

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateIEPInput>({
    resolver: zodResolver(createIEPSchema),
    defaultValues: {
      studentId,
      status: "DRAFT",
      effectiveDate: today,
      reviewDate: oneYearFromNow,
      expirationDate: oneYearFromNow,
      ...defaultValues,
    },
  });

  async function onSubmit(data: CreateIEPInput) {
    try {
      // Compose structured PLAAFP before submitting
      const composed = composePLAAFP(plaafp);
      data.presentLevels = composed || data.presentLevels;

      const url = isEditing ? `/api/ieps/${iepId}` : "/api/ieps";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save IEP");

      toast.success(isEditing ? "IEP updated" : "IEP created");
      router.push(
        `/students/${studentId}/ieps/${isEditing ? iepId : json.iep.id}`
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function updatePlaafp(key: PLAAFPKey, value: string) {
    setPlaafp((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">
      <input type="hidden" {...register("studentId")} value={studentId} />

      {/* ── Status ── */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader
            icon={FileText}
            title="IEP Status"
            subtitle="Set the current status of this IEP document."
          />
          <div className="max-w-xs">
            <Label className="mb-1.5 block">Status</Label>
            <Select
              defaultValue={defaultValues?.status ?? "DRAFT"}
              onValueChange={(v) => setValue("status", v as CreateIEPInput["status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="IN_REVIEW">In Review</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Dates ── */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader
            icon={Calendar}
            title="Dates & Compliance"
            subtitle="Key dates that determine IEP validity and upcoming deadlines."
          />
          <div className="space-y-4">
            {/* Row 1 — required dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="effectiveDate" className="mb-1.5 block">
                  Effective date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="effectiveDate"
                  type="date"
                  {...register("effectiveDate")}
                />
                <FieldHint>The date this IEP goes into effect.</FieldHint>
                <ErrorMsg message={errors.effectiveDate?.message} />
              </div>
              <div>
                <Label htmlFor="reviewDate" className="mb-1.5 block">
                  Annual review date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="reviewDate"
                  type="date"
                  {...register("reviewDate")}
                />
                <FieldHint>Must be within 12 months of effective date.</FieldHint>
                <ErrorMsg message={errors.reviewDate?.message} />
              </div>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="expirationDate" className="mb-1.5 block">
                  Expiration date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="expirationDate"
                  type="date"
                  {...register("expirationDate")}
                />
                <ErrorMsg message={errors.expirationDate?.message} />
              </div>
              <div>
                <Label htmlFor="meetingDate" className="mb-1.5 block">
                  IEP meeting date
                </Label>
                <Input
                  id="meetingDate"
                  type="date"
                  {...register("meetingDate")}
                />
                <FieldHint>Date the IEP team convened.</FieldHint>
              </div>
            </div>

            {/* Row 3 */}
            <div className="max-w-xs">
              <Label htmlFor="nextEvalDate" className="mb-1.5 block">
                Next evaluation date
              </Label>
              <Input
                id="nextEvalDate"
                type="date"
                {...register("nextEvalDate")}
              />
              <FieldHint>Triennial re-evaluation due date.</FieldHint>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Services ── */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader
            icon={Wrench}
            title="Speech-Language Services"
            subtitle="Document mandated service minutes and delivery location."
          />
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="minutesPerWeek" className="mb-1.5 block">
                  Total min/week
                </Label>
                <Input
                  id="minutesPerWeek"
                  type="number"
                  min={0}
                  placeholder="e.g. 60"
                  {...register("minutesPerWeek")}
                />
              </div>
              <div>
                <Label htmlFor="individualMinutes" className="mb-1.5 block">
                  Individual min/week
                </Label>
                <Input
                  id="individualMinutes"
                  type="number"
                  min={0}
                  placeholder="e.g. 30"
                  {...register("individualMinutes")}
                />
              </div>
              <div>
                <Label htmlFor="groupMinutes" className="mb-1.5 block">
                  Group min/week
                </Label>
                <Input
                  id="groupMinutes"
                  type="number"
                  min={0}
                  placeholder="e.g. 30"
                  {...register("groupMinutes")}
                />
              </div>
            </div>
            <FieldHint>Individual + Group should equal Total.</FieldHint>
            <div>
              <Label htmlFor="serviceLocation" className="mb-1.5 block">
                Service location
              </Label>
              <Input
                id="serviceLocation"
                placeholder="e.g. Pull-out resource room, general education classroom"
                {...register("serviceLocation")}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Present Levels (PLAAFP) ── */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between mb-5">
            <SectionHeader
              icon={BookOpen}
              title="Present Levels (PLAAFP)"
              subtitle="Document the student's current performance across key areas. Each section feeds directly into the IEP detail view."
            />
            <button
              type="button"
              onClick={() => setPlaafpOpen((o) => !o)}
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={plaafpOpen ? "Collapse PLAAFP" : "Expand PLAAFP"}
            >
              {plaafpOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>

          {plaafpOpen && (
            <div className="space-y-5">
              {PLAAFP_SECTIONS.map(({ key, heading, icon: Icon, placeholder }) => (
                <div key={key}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <Label className="text-xs font-medium text-foreground/80">
                      {heading}
                    </Label>
                  </div>
                  <Textarea
                    value={plaafp[key]}
                    onChange={(e) => updatePlaafp(key, e.target.value)}
                    placeholder={placeholder}
                    rows={3}
                    className="resize-none text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {!plaafpOpen && (
            <p className="text-xs text-muted-foreground italic">
              {PLAAFP_SECTIONS.filter((s) => plaafp[s.key].trim()).length} of{" "}
              {PLAAFP_SECTIONS.length} sections filled in
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Parent Concerns ── */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader
            icon={Users}
            title="Parent & Guardian Input"
            subtitle="Document concerns and priorities expressed by the family at the IEP meeting."
          />
          <Textarea
            {...register("parentConcerns")}
            placeholder="Note concerns, priorities, and questions raised by parents or guardians during the IEP meeting…"
            rows={3}
            className="resize-none text-sm"
          />
        </CardContent>
      </Card>

      {/* ── Transition Notes (optional / toggle) ── */}
      {!showTransition ? (
        <button
          type="button"
          onClick={() => setShowTransition(true)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          + Add transition notes (secondary transition, age 16+)
        </button>
      ) : (
        <Card>
          <CardContent className="pt-5">
            <SectionHeader
              icon={FileText}
              title="Transition Notes"
              subtitle="For students age 16+: post-secondary goals, transition services, and agency coordination."
            />
            <Textarea
              {...register("transitionNotes")}
              placeholder="Post-secondary transition goals, vocational planning, agency involvement…"
              rows={3}
              className="resize-none text-sm"
            />
            <button
              type="button"
              onClick={() => setShowTransition(false)}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Remove transition notes
            </button>
          </CardContent>
        </Card>
      )}

      {/* ── Actions ── */}
      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isEditing ? "Save Changes" : "Create IEP"}
        </Button>
        {!isEditing && (
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
