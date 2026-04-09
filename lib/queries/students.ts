import { prisma } from "@/lib/db";
import type { CreateStudentInput, UpdateStudentInput } from "@/lib/validations/student";

/** Get all active students for a user (via caseload join). */
export async function getStudentsByUserId(userId: string) {
  return prisma.student.findMany({
    where: {
      caseloads: { some: { userId, removedAt: null } },
      isActive: true,
    },
    include: {
      ieps: {
        where: { status: { in: ["ACTIVE", "IN_REVIEW", "DRAFT"] } },
        orderBy: { reviewDate: "asc" },
        take: 1,
      },
      goals: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

/** Get a single student with full relations. Validates the user has caseload access. */
export async function getStudentById(studentId: string, userId: string) {
  return prisma.student.findFirst({
    where: {
      id: studentId,
      caseloads: { some: { userId, removedAt: null } },
    },
    include: {
      ieps: { orderBy: { effectiveDate: "desc" } },
      goals: {
        include: {
          dataPoints: {
            orderBy: { collectedAt: "desc" },
            take: 10,
          },
        },
        orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
}

/** Create a student and automatically add them to the user's caseload in a transaction. */
export async function createStudent(data: CreateStudentInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        ...data,
        dateOfBirth: new Date(data.dateOfBirth),
        eligibilityDate: data.eligibilityDate ? new Date(data.eligibilityDate) : undefined,
        reevaluationDue: data.reevaluationDue ? new Date(data.reevaluationDue) : undefined,
        parentGuardianEmail: data.parentGuardianEmail || undefined,
      },
    });

    await tx.caseload.create({
      data: { userId, studentId: student.id, isPrimary: true },
    });

    return student;
  });
}

/** Update a student's details. Validates caseload ownership. */
export async function updateStudent(
  studentId: string,
  userId: string,
  data: UpdateStudentInput
) {
  // Verify access
  const existing = await prisma.student.findFirst({
    where: { id: studentId, caseloads: { some: { userId } } },
  });
  if (!existing) throw new Error("Student not found");

  return prisma.student.update({
    where: { id: studentId },
    data: {
      ...data,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      eligibilityDate: data.eligibilityDate ? new Date(data.eligibilityDate) : undefined,
      reevaluationDue: data.reevaluationDue ? new Date(data.reevaluationDue) : undefined,
      parentGuardianEmail: data.parentGuardianEmail || undefined,
    },
  });
}

/** Soft-archive a student (sets isActive=false). */
export async function archiveStudent(studentId: string, userId: string) {
  const existing = await prisma.student.findFirst({
    where: { id: studentId, caseloads: { some: { userId } } },
  });
  if (!existing) throw new Error("Student not found");

  return prisma.student.update({
    where: { id: studentId },
    data: { isActive: false, archivedAt: new Date() },
  });
}
