import { z } from "zod";

export const createSessionSchema = z.object({
  sessionDate: z.string().min(1, "Date is required"),
  sessionType: z.enum([
    "INDIVIDUAL", "GROUP", "CONSULTATION",
    "EVALUATION", "RE_EVALUATION", "PARENT_CONFERENCE",
  ] as const).default("INDIVIDUAL"),
  startTime: z.string().optional(),
  durationMins: z.coerce.number().int().min(1).optional(),
  location: z.string().optional(),
  generalNotes: z.string().optional(),
  studentIds: z.array(z.string()).min(1, "Select at least one student"),
  scheduleEntryId: z.string().optional(),
});

export const updateSessionSchema = createSessionSchema.partial().omit({ studentIds: true });

export const updateAttendanceSchema = z.object({
  students: z.array(z.object({
    studentId: z.string(),
    attendance: z.enum([
      "PRESENT", "ABSENT_EXCUSED", "ABSENT_UNEXCUSED",
      "CANCELLED_SLP", "CANCELLED_SCHOOL", "MAKEUP",
    ] as const),
    attendanceNote: z.string().optional(),
  })),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;
