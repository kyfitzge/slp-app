import { z } from "zod";

// ── Cueing levels match the DB enum ──────────────────────────────────────────
export const cueingLevelEnum = z.enum([
  "INDEPENDENT",
  "GESTURAL",
  "INDIRECT_VERBAL",
  "DIRECT_VERBAL",
  "MODELING",
  "PHYSICAL",
  "MAXIMUM_ASSISTANCE",
]);

export const participationEnum = z.enum([
  "excellent",
  "good",
  "fair",
  "poor",
  "refused",
]);

// ── One goal addressed in this session ───────────────────────────────────────
export const goalAddressedSchema = z.object({
  shortDescription: z.string().describe("Brief label for the goal (3–8 words)"),
  accuracyPercent: z.number().min(0).max(100).nullable(),
  cueingLevel: cueingLevelEnum.nullable(),
  trialsCorrect: z.number().int().nonnegative().nullable(),
  trialsTotal: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
});

export type GoalAddressed = z.infer<typeof goalAddressedSchema>;

// ── Full structured output from the LLM ──────────────────────────────────────
export const structuredNoteSchema = z.object({
  /** Professional prose note in past tense, suitable for IEP documentation */
  cleanedNote: z.string().min(10),

  /** Goals explicitly mentioned in the transcript */
  goalsAddressed: z.array(goalAddressedSchema),

  /** Overall student engagement during the session */
  participation: participationEnum.nullable(),

  /** Session length in minutes if mentioned */
  sessionDurationMins: z.number().int().positive().nullable(),

  /** Materials or activities mentioned */
  materials: z.string().nullable(),

  /** SLP's stated plan for the next session */
  nextStepPlan: z.string().nullable(),

  /**
   * Items that were unclear, ambiguous, or missing from the transcript.
   * Surfaces these to the SLP for manual review rather than guessing.
   */
  uncertaintyFlags: z.array(z.string()),
});

export type StructuredNote = z.infer<typeof structuredNoteSchema>;

// ── Save-note request body ────────────────────────────────────────────────────
export const saveVoiceNoteSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().optional(),
  editedNote: z.string().min(1, "Note text is required"),
  structuredData: structuredNoteSchema.optional(),
});

export type SaveVoiceNoteInput = z.infer<typeof saveVoiceNoteSchema>;
