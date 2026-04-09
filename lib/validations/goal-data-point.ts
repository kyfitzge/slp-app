import { z } from "zod";

export const createDataPointSchema = z.object({
  goalId: z.string().min(1),
  sessionId: z.string().optional(),
  // Input as 0–100, stored as 0–1
  accuracy: z.coerce.number().min(0, "Min 0%").max(100, "Max 100%"),
  trialsCorrect: z.coerce.number().int().min(0).optional(),
  trialsTotal: z.coerce.number().int().min(1).optional(),
  cueingLevel: z.enum([
    "INDEPENDENT", "GESTURAL", "INDIRECT_VERBAL",
    "DIRECT_VERBAL", "MODELING", "PHYSICAL", "MAXIMUM_ASSISTANCE",
  ] as const).default("INDEPENDENT"),
  targetItem: z.string().optional(),
  setting: z.string().optional(),
  notes: z.string().optional(),
  collectedAt: z.string().min(1, "Date is required"),
});

export type CreateDataPointInput = z.infer<typeof createDataPointSchema>;
