"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createScheduleEntrySchema, type CreateScheduleEntryInput } from "@/lib/validations/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";

interface ScheduleStudent {
  id: string;
  firstName: string;
  lastName: string;
}

interface ScheduleEntryFormProps {
  students: ScheduleStudent[];
}

const DAY_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
];

export function ScheduleEntryForm({ students }: ScheduleEntryFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateScheduleEntryInput>({
    resolver: zodResolver(createScheduleEntrySchema),
    defaultValues: {
      sessionType: "INDIVIDUAL",
      frequency: "WEEKLY",
      startTime: "09:00",
      durationMins: 30,
      startDate: format(new Date(), "yyyy-MM-dd"),
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

  async function onSubmit(data: CreateScheduleEntryInput) {
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create schedule entry");
      toast.success("Schedule entry created");
      router.push("/schedule");
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
              <Label>Session type</Label>
              <Select defaultValue="INDIVIDUAL" onValueChange={(v) => setValue("sessionType", v as never)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="GROUP">Group</SelectItem>
                  <SelectItem value="CONSULTATION">Consultation</SelectItem>
                  <SelectItem value="EVALUATION">Evaluation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select defaultValue="WEEKLY" onValueChange={(v) => setValue("frequency", v as never)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="BIWEEKLY">Biweekly</SelectItem>
                  <SelectItem value="ONCE">One-time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Day of week</Label>
              <Select onValueChange={(v) => setValue("dayOfWeek", Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="startTime">Start time *</Label>
              <Input id="startTime" type="time" {...register("startTime")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="durationMins">Duration (min)</Label>
              <Input id="durationMins" type="number" min={5} max={180} {...register("durationMins")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start date *</Label>
              <Input id="startDate" type="date" {...register("startDate")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" {...register("endDate")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" {...register("location")} placeholder="e.g. Speech room, Room 104" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Students *</CardTitle></CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students on your caseload yet.</p>
          ) : (
            <div className="space-y-2">
              {students.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`student-${s.id}`}
                    checked={selectedStudents.includes(s.id)}
                    onCheckedChange={() => toggleStudent(s.id)}
                  />
                  <Label htmlFor={`student-${s.id}`} className="cursor-pointer font-normal">
                    {s.lastName}, {s.firstName}
                  </Label>
                </div>
              ))}
            </div>
          )}
          {errors.studentIds && (
            <p className="text-xs text-destructive mt-2">{errors.studentIds.message}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Create schedule entry"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
