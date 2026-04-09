import { prisma } from "@/lib/db";
import type { CreateIEPInput, UpdateIEPInput } from "@/lib/validations/iep";

export async function getIEPsByStudentId(studentId: string) {
  return prisma.iEP.findMany({
    where: { studentId },
    include: {
      goals: {
        where: { status: { not: "DISCONTINUED" } },
        orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
      },
    },
    orderBy: { effectiveDate: "desc" },
  });
}

export async function getIEPById(iepId: string) {
  return prisma.iEP.findUnique({
    where: { id: iepId },
    include: {
      goals: {
        include: {
          dataPoints: { orderBy: { collectedAt: "desc" }, take: 5 },
        },
        orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
}

export async function createIEP(data: CreateIEPInput) {
  return prisma.iEP.create({
    data: {
      studentId: data.studentId,
      status: data.status ?? "DRAFT",
      effectiveDate: new Date(data.effectiveDate),
      reviewDate: new Date(data.reviewDate),
      expirationDate: new Date(data.expirationDate),
      meetingDate: data.meetingDate ? new Date(data.meetingDate) : undefined,
      nextEvalDate: data.nextEvalDate ? new Date(data.nextEvalDate) : undefined,
      minutesPerWeek: data.minutesPerWeek,
      groupMinutes: data.groupMinutes,
      individualMinutes: data.individualMinutes,
      serviceLocation: data.serviceLocation,
      presentLevels: data.presentLevels,
      parentConcerns: data.parentConcerns,
      transitionNotes: data.transitionNotes,
    },
  });
}

export async function updateIEP(iepId: string, data: UpdateIEPInput) {
  return prisma.iEP.update({
    where: { id: iepId },
    data: {
      ...data,
      effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : undefined,
      reviewDate: data.reviewDate ? new Date(data.reviewDate) : undefined,
      expirationDate: data.expirationDate ? new Date(data.expirationDate) : undefined,
      meetingDate: data.meetingDate ? new Date(data.meetingDate) : undefined,
      nextEvalDate: data.nextEvalDate ? new Date(data.nextEvalDate) : undefined,
    },
  });
}

/** Get IEPs expiring/due for review within the next N days for dashboard alerts. */
export async function getUpcomingIEPReviews(userId: string, days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  return prisma.iEP.findMany({
    where: {
      status: { in: ["ACTIVE", "IN_REVIEW"] },
      reviewDate: { lte: cutoff },
      student: {
        caseloads: { some: { userId, removedAt: null } },
        isActive: true,
      },
    },
    include: { student: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { reviewDate: "asc" },
  });
}
