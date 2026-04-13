import { prisma } from "@/lib/db";

/** Get all progress reports across the user's entire caseload, with student name. */
export async function getAllProgressReports(userId: string) {
  return prisma.progressSummary.findMany({
    where: { userId },
    select: {
      id: true,
      periodLabel: true,
      periodStartDate: true,
      periodEndDate: true,
      isDraft: true,
      finalizedAt: true,
      createdAt: true,
      student: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProgressReportsByStudent(studentId: string, userId: string) {
  return prisma.progressSummary.findMany({
    where: { studentId, userId },
    select: {
      id: true,
      periodLabel: true,
      periodStartDate: true,
      periodEndDate: true,
      isDraft: true,
      finalizedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProgressReportById(reportId: string, userId: string) {
  return prisma.progressSummary.findFirst({
    where: { id: reportId, userId },
  });
}

export async function createProgressReport(data: {
  userId: string;
  studentId: string;
  iepId?: string | null;
  periodLabel: string;
  periodStartDate: Date;
  periodEndDate: Date;
  summaryText: string;
  goalSnapshots?: unknown;
  isDraft?: boolean;
}) {
  return prisma.progressSummary.create({
    data: {
      userId: data.userId,
      studentId: data.studentId,
      iepId: data.iepId ?? null,
      periodLabel: data.periodLabel,
      periodStartDate: data.periodStartDate,
      periodEndDate: data.periodEndDate,
      summaryText: data.summaryText,
      goalSnapshots: data.goalSnapshots ?? undefined,
      isDraft: data.isDraft ?? true,
    },
  });
}

export async function updateProgressReport(
  reportId: string,
  userId: string,
  data: {
    summaryText?: string;
    periodLabel?: string;
    isDraft?: boolean;
    finalizedAt?: Date | null;
    goalSnapshots?: unknown;
  }
) {
  const result = await prisma.progressSummary.updateMany({
    where: { id: reportId, userId },
    data: {
      ...(data.summaryText !== undefined && { summaryText: data.summaryText }),
      ...(data.periodLabel !== undefined && { periodLabel: data.periodLabel }),
      ...(data.isDraft !== undefined && { isDraft: data.isDraft }),
      ...(data.finalizedAt !== undefined && { finalizedAt: data.finalizedAt }),
      ...(data.goalSnapshots !== undefined && { goalSnapshots: data.goalSnapshots as never }),
    },
  });
  return result;
}

export async function deleteProgressReport(reportId: string, userId: string) {
  return prisma.progressSummary.deleteMany({
    where: { id: reportId, userId },
  });
}
