"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createStudentSchema, type CreateStudentInput } from "@/lib/validations/student";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const GRADE_OPTIONS = [
  { value: "PRE_K", label: "Pre-K" },
  { value: "KINDERGARTEN", label: "Kindergarten" },
  { value: "GRADE_1", label: "1st Grade" },
  { value: "GRADE_2", label: "2nd Grade" },
  { value: "GRADE_3", label: "3rd Grade" },
  { value: "GRADE_4", label: "4th Grade" },
  { value: "GRADE_5", label: "5th Grade" },
  { value: "GRADE_6", label: "6th Grade" },
  { value: "GRADE_7", label: "7th Grade" },
  { value: "GRADE_8", label: "8th Grade" },
  { value: "GRADE_9", label: "9th Grade" },
  { value: "GRADE_10", label: "10th Grade" },
  { value: "GRADE_11", label: "11th Grade" },
  { value: "GRADE_12", label: "12th Grade" },
];

const DISABILITY_OPTIONS = [
  { value: "SPEECH_LANGUAGE_IMPAIRMENT", label: "Speech-Language Impairment" },
  { value: "AUTISM_SPECTRUM_DISORDER", label: "Autism Spectrum Disorder" },
  { value: "INTELLECTUAL_DISABILITY", label: "Intellectual Disability" },
  { value: "EMOTIONAL_BEHAVIORAL_DISORDER", label: "Emotional/Behavioral Disorder" },
  { value: "LEARNING_DISABILITY", label: "Learning Disability" },
  { value: "TRAUMATIC_BRAIN_INJURY", label: "Traumatic Brain Injury" },
  { value: "HEARING_IMPAIRMENT", label: "Hearing Impairment" },
  { value: "VISUAL_IMPAIRMENT", label: "Visual Impairment" },
  { value: "DEVELOPMENTAL_DELAY", label: "Developmental Delay" },
  { value: "OTHER_HEALTH_IMPAIRMENT", label: "Other Health Impairment" },
  { value: "MULTIPLE_DISABILITIES", label: "Multiple Disabilities" },
  { value: "OTHER", label: "Other" },
];

interface StudentFormProps {
  defaultValues?: Partial<CreateStudentInput>;
  studentId?: string; // if provided, PUT to update
}

export function StudentForm({ defaultValues, studentId }: StudentFormProps) {
  const router = useRouter();
  const isEditing = !!studentId;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateStudentInput>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: {
      primaryLanguage: "English",
      ...defaultValues,
    },
  });

  async function onSubmit(data: CreateStudentInput) {
    try {
      const url = isEditing ? `/api/students/${studentId}` : "/api/students";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save student");

      toast.success(isEditing ? "Student updated" : "Student added to caseload");
      router.push(`/students/${isEditing ? studentId : json.student.id}/overview`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      {/* Demographics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name *</Label>
              <Input id="firstName" {...register("firstName")} placeholder="Jane" />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name *</Label>
              <Input id="lastName" {...register("lastName")} placeholder="Doe" />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dateOfBirth">Date of birth *</Label>
              <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} />
              {errors.dateOfBirth && <p className="text-xs text-destructive">{errors.dateOfBirth.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gender">Gender</Label>
              <Input id="gender" {...register("gender")} placeholder="e.g. Female" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pronouns">Pronouns</Label>
            <Input id="pronouns" {...register("pronouns")} placeholder="e.g. she/her" />
          </div>
        </CardContent>
      </Card>

      {/* School */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">School placement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="schoolName">School name *</Label>
              <Input id="schoolName" {...register("schoolName")} placeholder="Lincoln Elementary" />
              {errors.schoolName && <p className="text-xs text-destructive">{errors.schoolName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schoolDistrict">School district</Label>
              <Input id="schoolDistrict" {...register("schoolDistrict")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Grade level *</Label>
              <Select
                defaultValue={defaultValues?.gradeLevel}
                onValueChange={(v) => setValue("gradeLevel", v as never)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {GRADE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.gradeLevel && <p className="text-xs text-destructive">{errors.gradeLevel.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="teacherName">Teacher</Label>
              <Input id="teacherName" {...register("teacherName")} placeholder="Ms. Johnson" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="classroom">Classroom</Label>
            <Input id="classroom" {...register("classroom")} placeholder="Room 104" />
          </div>
        </CardContent>
      </Card>

      {/* Eligibility */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eligibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Disability category *</Label>
            <Select
              defaultValue={defaultValues?.disabilityCategory}
              onValueChange={(v) => setValue("disabilityCategory", v as never)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {DISABILITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.disabilityCategory && (
              <p className="text-xs text-destructive">{errors.disabilityCategory.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="eligibilityDate">Eligibility date</Label>
              <Input id="eligibilityDate" type="date" {...register("eligibilityDate")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reevaluationDue">Re-evaluation due</Label>
              <Input id="reevaluationDue" type="date" {...register("reevaluationDue")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parent / guardian contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="parentGuardianName">Name</Label>
            <Input id="parentGuardianName" {...register("parentGuardianName")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="parentGuardianEmail">Email</Label>
              <Input id="parentGuardianEmail" type="email" {...register("parentGuardianEmail")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parentGuardianPhone">Phone</Label>
              <Input id="parentGuardianPhone" type="tel" {...register("parentGuardianPhone")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clinical notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clinical notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="primaryLanguage">Primary language</Label>
              <Input id="primaryLanguage" {...register("primaryLanguage")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secondaryLanguage">Secondary language</Label>
              <Input id="secondaryLanguage" {...register("secondaryLanguage")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accommodations">Accommodations</Label>
            <Textarea
              id="accommodations"
              {...register("accommodations")}
              placeholder="List any accommodations or modifications…"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="medicalAlerts">Medical alerts</Label>
            <Textarea
              id="medicalAlerts"
              {...register("medicalAlerts")}
              placeholder="Any medical conditions, allergies, or alerts…"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="externalProviders">External providers</Label>
            <Input
              id="externalProviders"
              {...register("externalProviders")}
              placeholder="e.g. OT with Smith Therapy, private SLP"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isEditing ? "Update student" : "Add student"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
