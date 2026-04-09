import { z } from "zod";

export const createScheduleEntrySchema = z.object({
  title: z.string().optional(),
  sessionType: z.enum([
    "INDIVIDUAL", "GROUP", "CONSULTATION",
    "EVALUATION", "RE_EVALUATION", "PARENT_CONFERENCE",
  ] as const).default("INDIVIDUAL"),
  frequency: z.enum(["ONCE", "WEEKLY", "BIWEEKLY"] as const).default("WEEKLY"),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  startTime: z.string().min(1, "Start time is required"),
  durationMins: z.coerce.number().int().min(5).max(180).default(30),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  specificDate: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  studentIds: z.array(z.string()).min(1, "Select at least one student"),
});

export const updateScheduleEntrySchema = createScheduleEntrySchema.partial().omit({ studentIds: true });

export type CreateScheduleEntryInput = z.infer<typeof createScheduleEntrySchema>;
export type UpdateScheduleEntryInput = z.infer<typeof updateScheduleEntrySchema>;
