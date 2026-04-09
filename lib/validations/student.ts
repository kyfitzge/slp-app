import { z } from "zod";

export const createStudentSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  gender: z.string().optional(),
  pronouns: z.string().optional(),
  schoolName: z.string().min(1, "School name is required"),
  schoolDistrict: z.string().optional(),
  gradeLevel: z.enum([
    "PRE_K", "KINDERGARTEN",
    "GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5",
    "GRADE_6", "GRADE_7", "GRADE_8",
    "GRADE_9", "GRADE_10", "GRADE_11", "GRADE_12",
  ] as const),
  teacherName: z.string().optional(),
  classroom: z.string().optional(),
  disabilityCategory: z.enum([
    "SPEECH_LANGUAGE_IMPAIRMENT", "AUTISM_SPECTRUM_DISORDER",
    "INTELLECTUAL_DISABILITY", "EMOTIONAL_BEHAVIORAL_DISORDER",
    "LEARNING_DISABILITY", "TRAUMATIC_BRAIN_INJURY",
    "HEARING_IMPAIRMENT", "VISUAL_IMPAIRMENT",
    "DEVELOPMENTAL_DELAY", "OTHER_HEALTH_IMPAIRMENT",
    "MULTIPLE_DISABILITIES", "OTHER",
  ] as const),
  eligibilityDate: z.string().optional(),
  reevaluationDue: z.string().optional(),
  parentGuardianName: z.string().optional(),
  parentGuardianEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  parentGuardianPhone: z.string().optional(),
  primaryLanguage: z.string().default("English"),
  secondaryLanguage: z.string().optional(),
  accommodations: z.string().optional(),
  medicalAlerts: z.string().optional(),
  externalProviders: z.string().optional(),
});

export const updateStudentSchema = createStudentSchema.partial();

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
