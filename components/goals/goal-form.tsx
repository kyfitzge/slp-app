"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createGoalSchema, type CreateGoalInput } from "@/lib/validations/goal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DOMAIN_OPTIONS = [
  { value: "ARTICULATION", label: "Articulation" },
  { value: "PHONOLOGY", label: "Phonology" },
  { value: "LANGUAGE_EXPRESSION", label: "Language Expression" },
  { value: "LANGUAGE_COMPREHENSION", label: "Language Comprehension" },
  { value: "FLUENCY", label: "Fluency" },
  { value: "VOICE", label: "Voice" },
  { value: "PRAGMATICS", label: "Pragmatics" },
  { value: "AUGMENTATIVE_COMMUNICATION", label: "Augmentative Communication (AAC)" },
  { value: "LITERACY", label: "Literacy" },
  { value: "SOCIAL_COMMUNICATION", label: "Social Communication" },
];

interface GoalFormProps {
  studentId: string;
  goalId?: string;
  defaultValues?: Partial<CreateGoalInput>;
}

export function GoalForm({ studentId, goalId, defaultValues }: GoalFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const iepIdFromQuery = searchParams.get("iepId");
  const isEditing = !!goalId;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateGoalInput>({
    resolver: zodResolver(createGoalSchema),
    defaultValues: {
      studentId,
      iepId: iepIdFromQuery ?? undefined,
      status: "ACTIVE",
      targetAccuracy: 80,
      ...defaultValues,
    },
  });

  async function onSubmit(data: CreateGoalInput) {
    try {
      const url = isEditing ? `/api/goals/${goalId}` : "/api/goals";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save goal");

      toast.success(isEditing ? "Goal updated" : "Goal created");
      const returnTo = iepIdFromQuery
        ? `/students/${studentId}/ieps/${iepIdFromQuery}`
        : `/students/${studentId}/goals`;
      router.push(returnTo);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <input type="hidden" {...register("studentId")} />
      <input type="hidden" {...register("iepId")} />

      <Card>
        <CardHeader><CardTitle className="text-base">Goal details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Domain *</Label>
            <Select
              defaultValue={defaultValues?.domain}
              onValueChange={(v) => setValue("domain", v as never)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select domain" />
              </SelectTrigger>
              <SelectContent>
                {DOMAIN_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.domain && <p className="text-xs text-destructive">{errors.domain.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shortName">Short name / label</Label>
            <Input
              id="shortName"
              {...register("shortName")}
              placeholder="e.g. /r/ Articulation"
            />
            <p className="text-xs text-muted-foreground">Used in session views and progress charts</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goalText">Goal statement *</Label>
            <Textarea
              id="goalText"
              {...register("goalText")}
              placeholder="[Student] will [action] [condition] with [accuracy]% accuracy across [trials] in [setting]…"
              rows={4}
            />
            {errors.goalText && <p className="text-xs text-destructive">{errors.goalText.message}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Criteria</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="targetAccuracy">Target accuracy (%) *</Label>
              <Input
                id="targetAccuracy"
                type="number"
                min={1}
                max={100}
                {...register("targetAccuracy")}
              />
              {errors.targetAccuracy && (
                <p className="text-xs text-destructive">{errors.targetAccuracy.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="targetTrials">Trials</Label>
              <Input id="targetTrials" type="number" min={1} {...register("targetTrials")} placeholder="e.g. 5" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="targetConsecutive">Consecutive sessions</Label>
              <Input id="targetConsecutive" type="number" min={1} {...register("targetConsecutive")} placeholder="e.g. 3" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              defaultValue={defaultValues?.status ?? "ACTIVE"}
              onValueChange={(v) => setValue("status", v as never)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="MASTERED">Mastered</SelectItem>
                <SelectItem value="ON_HOLD">On Hold</SelectItem>
                <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Baseline</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="baselineDate">Baseline date</Label>
              <Input id="baselineDate" type="date" {...register("baselineDate")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="baselineScore">Baseline score (%)</Label>
              <Input id="baselineScore" type="number" min={0} max={100} {...register("baselineScore")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="baselineNotes">Baseline notes</Label>
            <Textarea id="baselineNotes" {...register("baselineNotes")} rows={2} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isEditing ? "Update goal" : "Create goal"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
