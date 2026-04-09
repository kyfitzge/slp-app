"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createDataPointSchema, type CreateDataPointInput } from "@/lib/validations/goal-data-point";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { format } from "date-fns";

interface QuickDataEntryProps {
  goalId: string;
  goalName: string;
  sessionId?: string;
  sessionDate?: Date | string;
  onSuccess?: () => void;
}

export function QuickDataEntry({
  goalId,
  goalName,
  sessionId,
  sessionDate,
  onSuccess,
}: QuickDataEntryProps) {
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { isSubmitting },
  } = useForm<CreateDataPointInput>({
    resolver: zodResolver(createDataPointSchema),
    defaultValues: {
      goalId,
      sessionId,
      cueingLevel: "INDEPENDENT",
      collectedAt: sessionDate
        ? format(new Date(sessionDate), "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd"),
    },
  });

  async function onSubmit(data: CreateDataPointInput) {
    try {
      const res = await fetch(`/api/goals/${goalId}/data-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save data");

      toast.success("Data recorded");
      reset();
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" />Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Record data</DialogTitle>
          <p className="text-xs text-muted-foreground">{goalName}</p>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register("goalId")} />
          {sessionId && <input type="hidden" {...register("sessionId")} />}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="accuracy">Accuracy (%) *</Label>
              <Input
                id="accuracy"
                type="number"
                min={0}
                max={100}
                {...register("accuracy")}
                placeholder="e.g. 80"
                className="text-lg font-medium"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="collectedAt">Date *</Label>
              <Input id="collectedAt" type="date" {...register("collectedAt")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trialsCorrect">Correct</Label>
              <Input id="trialsCorrect" type="number" min={0} {...register("trialsCorrect")} placeholder="e.g. 4" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trialsTotal">Total</Label>
              <Input id="trialsTotal" type="number" min={1} {...register("trialsTotal")} placeholder="e.g. 5" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cueing level</Label>
            <Select
              defaultValue="INDEPENDENT"
              onValueChange={(v) => setValue("cueingLevel", v as never)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INDEPENDENT">Independent</SelectItem>
                <SelectItem value="GESTURAL">Gestural</SelectItem>
                <SelectItem value="INDIRECT_VERBAL">Indirect Verbal</SelectItem>
                <SelectItem value="DIRECT_VERBAL">Direct Verbal</SelectItem>
                <SelectItem value="MODELING">Modeling</SelectItem>
                <SelectItem value="PHYSICAL">Physical</SelectItem>
                <SelectItem value="MAXIMUM_ASSISTANCE">Maximum Assistance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="targetItem">Target item</Label>
            <Input
              id="targetItem"
              {...register("targetItem")}
              placeholder="e.g. /r/ in initial position"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} rows={2} placeholder="Optional notes…" />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Record"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
