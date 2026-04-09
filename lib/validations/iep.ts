import { z } from "zod";

export const createIEPSchema = z.object({
  studentId: z.string().min(1),
  effectiveDate: z.string().min(1, "Effective date is required"),
  reviewDate: z.string().min(1, "Review date is required"),
  expirationDate: z.string().min(1, "Expiration date is required"),
  meetingDate: z.string().optional(),
  nextEvalDate: z.string().optional(),
  minutesPerWeek: z.coerce.number().int().min(0).optional(),
  groupMinutes: z.coerce.number().int().min(0).optional(),
  individualMinutes: z.coerce.number().int().min(0).optional(),
  serviceLocation: z.string().optional(),
  presentLevels: z.string().optional(),
  parentConcerns: z.string().optional(),
  transitionNotes: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "IN_REVIEW", "EXPIRED", "DISCONTINUED"] as const).default("DRAFT"),
});

export const updateIEPSchema = createIEPSchema.partial().omit({ studentId: true });

export type CreateIEPInput = z.infer<typeof createIEPSchema>;
export type UpdateIEPInput = z.infer<typeof updateIEPSchema>;
