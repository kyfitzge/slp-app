"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createIEPSchema, type CreateIEPInput } from "@/lib/validations/iep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format, addYears } from "date-fns";
import { cn } from "@/lib/utils";

// ─── PLAAFP helpers ────────────────────────────────────────────────────────────

export const PLAAFP_SECTIONS = [
  {
    key: "strengths",
    heading: "Strengths",
    placeholder: "Communication strengths and positive attributes…",
  },
  {
    key: "areasOfNeed",
    heading: "Areas of Need",
    placeholder: "Specific areas requiring support — articulation, language, fluency, pragmatics…",
  },
  {
    key: "functionalImpact",
    heading: "Academic & Functional Impact",
    placeholder: "How communication needs affect academics, participation, and daily functioning…",
  },
  {
    key: "baselinePerformance",
    heading: "Baseline Performance",
    placeholder: "Assessment scores, probes, and standardized test results…",
  },
  {
    key: "communicationProfile",
    heading: "Communication Profile",
    placeholder: "Speech intelligibility, language levels, AAC use, pragmatic skills…",
  },
] as const;

export type PLAAFPKey = (typeof PLAAFP_SECTIONS)[number]["key"];
export type PLAAFPState = Record<PLAAFPKey, string>;

export function parsePLAAFPForForm(raw?: string | null): PLAAFPState {
  const empty: PLAAFPState = {
    strengths: "", areasOfNeed: "", functionalImpact: "",
    baselinePerformance: "", communicationProfile: "",
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

  if (positions.length === 0) return empty;

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

// ─── Layout helpers ────────────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card shadow-sm overflow-hidden", className)}>
      <div className="px-5 py-3.5 border-b bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-sm font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

// ─── Main form ─────────────────────────────────────────────────────────────────

interface IEPFormProps {
  studentId: string;
  iepId?: string;
  defaultValues?: Partial<CreateIEPInput>;
  plaafp?: PLAAFPState;
  onPlaafpChange?: (state: PLAAFPState) => void;
  parentConcerns?: string;
  onParentConcernsChange?: (text: string) => void;
}

export function IEPForm({ studentId, iepId, defaultValues, plaafp: plaafpProp, onPlaafpChange, parentConcerns: parentConcernsProp, onParentConcernsChange }: IEPFormProps) {
  const router = useRouter();
  const isEditing = !!iepId;

  const today = format(new Date(), "yyyy-MM-dd");
  const oneYearFromNow = format(addYears(new Date(), 1), "yyyy-MM-dd");

  // Internal state — used when parent doesn't lift state (e.g. "new IEP" page)
  const [internalPlaafp, setInternalPlaafp] = useState<PLAAFPState>(() =>
    parsePLAAFPForForm(defaultValues?.presentLevels)
  );
  const [internalParentConcerns, setInternalParentConcerns] = useState(
    defaultValues?.parentConcerns ?? ""
  );

  // When the parent pushes a new plaafp (e.g. from AI assistant), sync internal
  // state so textareas always display the latest value.
  useEffect(() => {
    if (plaafpProp !== undefined) setInternalPlaafp(plaafpProp);
  }, [plaafpProp]);

  useEffect(() => {
    if (parentConcernsProp !== undefined) setInternalParentConcerns(parentConcernsProp);
  }, [parentConcernsProp]);

  const plaafp = plaafpProp ?? internalPlaafp;
  const parentConcerns = parentConcernsProp ?? internalParentConcerns;
  const handlePlaafpChange = onPlaafpChange ?? setInternalPlaafp;
  const handleParentConcernsChange = onParentConcernsChange ?? setInternalParentConcerns;

  const [showTransition, setShowTransition] = useState(!!defaultValues?.transitionNotes);

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
      const composed = composePLAAFP(plaafp);
      data.presentLevels = composed || data.presentLevels;
      data.parentConcerns = parentConcerns;

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
      router.push(`/students/${studentId}/ieps/${isEditing ? iepId : json.iep.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <input type="hidden" {...register("studentId")} value={studentId} />

      {/* ── Status & Dates ───────────────────────────────────────────────── */}
      <SectionCard title="Status & Dates">
        <div className="space-y-4">
          {/* Status */}
          <Field label="Status">
            <Select
              defaultValue={defaultValues?.status ?? "DRAFT"}
              onValueChange={(v) => setValue("status", v as CreateIEPInput["status"])}
            >
              <SelectTrigger id="status" className="max-w-[200px]">
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
          </Field>

          {/* Dates — 3-column grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Effective date" required error={errors.effectiveDate?.message}>
              <Input id="effectiveDate" type="date" {...register("effectiveDate")} />
            </Field>
            <Field label="Annual review date" required error={errors.reviewDate?.message}>
              <Input id="reviewDate" type="date" {...register("reviewDate")} />
            </Field>
            <Field label="Expiration date" required error={errors.expirationDate?.message}>
              <Input id="expirationDate" type="date" {...register("expirationDate")} />
            </Field>
            <Field label="IEP meeting date">
              <Input id="meetingDate" type="date" {...register("meetingDate")} />
            </Field>
            <Field label="Next evaluation date">
              <Input id="nextEvalDate" type="date" {...register("nextEvalDate")} />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* ── Services ─────────────────────────────────────────────────────── */}
      <SectionCard title="Speech-Language Services">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Total min / week">
              <Input id="minutesPerWeek" type="number" min={0} placeholder="60" {...register("minutesPerWeek")} />
            </Field>
            <Field label="Individual min / week">
              <Input id="individualMinutes" type="number" min={0} placeholder="30" {...register("individualMinutes")} />
            </Field>
            <Field label="Group min / week">
              <Input id="groupMinutes" type="number" min={0} placeholder="30" {...register("groupMinutes")} />
            </Field>
          </div>
          <Field label="Service location">
            <Input
              id="serviceLocation"
              placeholder="e.g. Pull-out resource room, general education classroom"
              {...register("serviceLocation")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── Present Levels (PLAAFP) ───────────────────────────────────────── */}
      <SectionCard title="Present Levels of Academic Achievement & Functional Performance (PLAAFP)">
        <div className="space-y-4">
          {PLAAFP_SECTIONS.map(({ key, heading, placeholder }) => (
            <Field key={key} label={heading}>
              <Textarea
                value={plaafp[key]}
                onChange={(e) => handlePlaafpChange({ ...plaafp, [key]: e.target.value })}
                placeholder={placeholder}
                rows={3}
                className="text-sm resize-y"
              />
            </Field>
          ))}
        </div>
      </SectionCard>

      {/* ── Parent & Guardian Input ───────────────────────────────────────── */}
      <SectionCard title="Parent & Guardian Input">
        <Textarea
          value={parentConcerns}
          onChange={(e) => handleParentConcernsChange(e.target.value)}
          placeholder="Concerns, priorities, and questions raised by parents or guardians…"
          rows={3}
          className="text-sm resize-y"
        />
      </SectionCard>

      {/* ── Transition Notes (optional) ──────────────────────────────────── */}
      {!showTransition ? (
        <button
          type="button"
          onClick={() => setShowTransition(true)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          + Add transition notes (age 16+)
        </button>
      ) : (
        <SectionCard title="Transition Notes">
          <Textarea
            {...register("transitionNotes")}
            placeholder="Post-secondary goals, vocational planning, agency involvement…"
            rows={3}
            className="text-sm resize-y"
          />
          <button
            type="button"
            onClick={() => setShowTransition(false)}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Remove transition notes
          </button>
        </SectionCard>
      )}

      {/* ── Submit ───────────────────────────────────────────────────────── */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isEditing ? "Save Changes" : "Create IEP"}
        </Button>
        {!isEditing && (
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
