"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createSessionSchema, type CreateSessionInput } from "@/lib/validations/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";

interface SessionStudent {
  id: string;
  firstName: string;
  lastName: string;
}

export function SessionForm({ students }: { students: SessionStudent[] }) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateSessionInput>({
    resolver: zodResolver(createSessionSchema),
    defaultValues: {
      sessionType: "INDIVIDUAL",
      sessionDate: format(new Date(), "yyyy-MM-dd"),
      durationMins: 30,
      studentIds: [],
    },
  });

  const selectedStudents = watch("studentIds") ?? [];

  function toggleStudent(id: string) {
    const current = selectedStudents;
    const updated = current.includes(id)
      ? current.filter((s) => s !== id)
      : [...current, id];
    setValue("studentIds", updated);
  }

  async function onSubmit(data: CreateSessionInput) {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create session");
      toast.success("Session created");
      router.push(`/sessions/${json.session.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader><CardTitle className="text-base">Session details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sessionDate">Date *</Label>
              <Input id="sessionDate" type="date" {...register("sessionDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>Session type</Label>
              <Select defaultValue="INDIVIDUAL" onValueChange={(v) => setValue("sessionType", v as never)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="GROUP">Group</SelectItem>
                  <SelectItem value="CONSULTATION">Consultation</SelectItem>
                  <SelectItem value="EVALUATION">Evaluation</SelectItem>
                  <SelectItem value="RE_EVALUATION">Re-evaluation</SelectItem>
                  <SelectItem value="PARENT_CONFERENCE">Parent conference</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="startTime">Start time</Label>
              <Input id="startTime" type="time" {...register("startTime")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="durationMins">Duration (min)</Label>
              <Input id="durationMins" type="number" min={1} {...register("durationMins")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" {...register("location")} placeholder="e.g. Speech room" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Students *</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {students.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <Checkbox
                  id={`s-${s.id}`}
                  checked={selectedStudents.includes(s.id)}
                  onCheckedChange={() => toggleStudent(s.id)}
                />
                <Label htmlFor={`s-${s.id}`} className="cursor-pointer font-normal">
                  {s.lastName}, {s.firstName}
                </Label>
              </div>
            ))}
          </div>
          {errors.studentIds && (
            <p className="text-xs text-destructive mt-2">{errors.studentIds.message}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create session"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
