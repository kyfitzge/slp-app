import { z } from "zod";

export const createGoalSchema = z.object({
  studentId: z.string().min(1),
  iepId: z.string().optional(),
  domain: z.enum([
    "ARTICULATION", "PHONOLOGY", "LANGUAGE_EXPRESSION",
    "LANGUAGE_COMPREHENSION", "FLUENCY", "VOICE",
    "PRAGMATICS", "AUGMENTATIVE_COMMUNICATION", "LITERACY", "SOCIAL_COMMUNICATION",
  ] as const),
  goalText: z.string().min(10, "Goal text must be at least 10 characters"),
  shortName: z.string().max(50).optional(),
  // Input as 0–100, stored as 0–1
  targetAccuracy: z.coerce.number().min(1).max(100, "Max 100%"),
  targetTrials: z.coerce.number().int().min(1).optional(),
  targetConsecutive: z.coerce.number().int().min(1).optional(),
  baselineDate: z.string().optional(),
  baselineScore: z.coerce.number().min(0).max(100).optional(),
  baselineNotes: z.string().optional(),
  reportingPeriod: z.string().optional(),
  status: z.enum(["ACTIVE", "MASTERED", "DISCONTINUED", "ON_HOLD"] as const).default("ACTIVE"),
});

export const updateGoalSchema = createGoalSchema.partial().omit({ studentId: true });

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
