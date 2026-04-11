"use client";

import { useState } from "react";
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

// ─── PLAAFP helpers ────────────────────────────────────────────────────────────

const PLAAFP_SECTIONS = [
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

type PLAAFPKey = (typeof PLAAFP_SECTIONS)[number]["key"];
type PLAAFPState = Record<PLAAFPKey, string>;

function parsePLAAFPForForm(raw?: string | null): PLAAFPState {
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

// ─── Small helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
      {children}
    </p>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}

// ─── Main form ─────────────────────────────────────────────────────────────────

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

  const [plaafp, setPlaafp] = useState<PLAAFPState>(() =>
    parsePLAAFPForForm(defaultValues?.presentLevels)
  );
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
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-8">
      <input type="hidden" {...register("studentId")} value={studentId} />

      {/* ── Status + Dates ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionLabel>Status &amp; Dates</SectionLabel>

        {/* Status */}
        <div className="max-w-[180px]">
          <Label htmlFor="status" className="mb-1.5 block text-sm">Status</Label>
          <Select
            defaultValue={defaultValues?.status ?? "DRAFT"}
            onValueChange={(v) => setValue("status", v as CreateIEPInput["status"])}
          >
            <SelectTrigger id="status">
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

        {/* Dates — 2-column grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <Label htmlFor="effectiveDate" className="mb-1.5 block text-sm">
              Effective date <span className="text-destructive">*</span>
            </Label>
            <Input id="effectiveDate" type="date" {...register("effectiveDate")} />
            <FieldError message={errors.effectiveDate?.message} />
          </div>
          <div>
            <Label htmlFor="reviewDate" className="mb-1.5 block text-sm">
              Annual review date <span className="text-destructive">*</span>
            </Label>
            <Input id="reviewDate" type="date" {...register("reviewDate")} />
            <FieldError message={errors.reviewDate?.message} />
          </div>
          <div>
            <Label htmlFor="expirationDate" className="mb-1.5 block text-sm">
              Expiration date <span className="text-destructive">*</span>
            </Label>
            <Input id="expirationDate" type="date" {...register("expirationDate")} />
            <FieldError message={errors.expirationDate?.message} />
          </div>
          <div>
            <Label htmlFor="meetingDate" className="mb-1.5 block text-sm">
              IEP meeting date
            </Label>
            <Input id="meetingDate" type="date" {...register("meetingDate")} />
          </div>
          <div>
            <Label htmlFor="nextEvalDate" className="mb-1.5 block text-sm">
              Next evaluation date
            </Label>
            <Input id="nextEvalDate" type="date" {...register("nextEvalDate")} />
          </div>
        </div>
      </div>

      {/* ── Services ─────────────────────────────────────────────────────── */}
      <div className="space-y-4 border-t pt-8">
        <SectionLabel>Services</SectionLabel>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="minutesPerWeek" className="mb-1.5 block text-sm">Total min/week</Label>
            <Input id="minutesPerWeek" type="number" min={0} placeholder="60" {...register("minutesPerWeek")} />
          </div>
          <div>
            <Label htmlFor="individualMinutes" className="mb-1.5 block text-sm">Individual min/week</Label>
            <Input id="individualMinutes" type="number" min={0} placeholder="30" {...register("individualMinutes")} />
          </div>
          <div>
            <Label htmlFor="groupMinutes" className="mb-1.5 block text-sm">Group min/week</Label>
            <Input id="groupMinutes" type="number" min={0} placeholder="30" {...register("groupMinutes")} />
          </div>
        </div>
        <div>
          <Label htmlFor="serviceLocation" className="mb-1.5 block text-sm">Service location</Label>
          <Input
            id="serviceLocation"
            placeholder="e.g. Pull-out resource room, general education classroom"
            {...register("serviceLocation")}
          />
        </div>
      </div>

      {/* ── Present Levels (PLAAFP) ───────────────────────────────────────── */}
      <div className="space-y-5 border-t pt-8">
        <SectionLabel>Present Levels (PLAAFP)</SectionLabel>
        {PLAAFP_SECTIONS.map(({ key, heading, placeholder }) => (
          <div key={key}>
            <Label className="mb-1.5 block text-sm">{heading}</Label>
            <Textarea
              value={plaafp[key]}
              onChange={(e) => setPlaafp((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={placeholder}
              rows={3}
              className="text-sm resize-y"
            />
          </div>
        ))}
      </div>

      {/* ── Parent & Guardian Input ───────────────────────────────────────── */}
      <div className="space-y-3 border-t pt-8">
        <SectionLabel>Parent &amp; Guardian Input</SectionLabel>
        <Textarea
          {...register("parentConcerns")}
          placeholder="Concerns, priorities, and questions raised by parents or guardians…"
          rows={3}
          className="text-sm resize-y"
        />
      </div>

      {/* ── Transition Notes (optional) ──────────────────────────────────── */}
      <div className="border-t pt-8">
        {!showTransition ? (
          <button
            type="button"
            onClick={() => setShowTransition(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            + Add transition notes (age 16+)
          </button>
        ) : (
          <div className="space-y-3">
            <SectionLabel>Transition Notes</SectionLabel>
            <Textarea
              {...register("transitionNotes")}
              placeholder="Post-secondary goals, vocational planning, agency involvement…"
              rows={3}
              className="text-sm resize-y"
            />
            <button
              type="button"
              onClick={() => setShowTransition(false)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Remove transition notes
            </button>
          </div>
        )}
      </div>

      {/* ── Submit ───────────────────────────────────────────────────────── */}
      <div className="flex gap-3 border-t pt-6">
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
