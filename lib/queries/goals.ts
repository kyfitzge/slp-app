import { prisma } from "@/lib/db";
import type { CreateGoalInput, UpdateGoalInput } from "@/lib/validations/goal";
import type { CreateDataPointInput } from "@/lib/validations/goal-data-point";

export async function getGoalsByStudentId(studentId: string) {
  return prisma.goal.findMany({
    where: { studentId },
    include: {
      dataPoints: { orderBy: { collectedAt: "asc" } },
    },
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getGoalById(goalId: string) {
  return prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
      iep: { select: { id: true, effectiveDate: true, reviewDate: true } },
      dataPoints: { orderBy: { collectedAt: "asc" } },
    },
  });
}

export async function createGoal(data: CreateGoalInput) {
  return prisma.goal.create({
    data: {
      studentId: data.studentId,
      iepId: data.iepId || undefined,
      domain: data.domain,
      status: data.status ?? "ACTIVE",
      goalText: data.goalText,
      shortName: data.shortName || undefined,
      targetAccuracy: data.targetAccuracy / 100, // convert % to decimal
      targetTrials: data.targetTrials,
      targetConsecutive: data.targetConsecutive,
      baselineDate: data.baselineDate ? new Date(data.baselineDate) : undefined,
      baselineScore: data.baselineScore != null ? data.baselineScore / 100 : undefined,
      baselineNotes: data.baselineNotes,
      reportingPeriod: data.reportingPeriod,
    },
  });
}

export async function updateGoal(goalId: string, data: UpdateGoalInput) {
  return prisma.goal.update({
    where: { id: goalId },
    data: {
      ...data,
      targetAccuracy: data.targetAccuracy != null ? data.targetAccuracy / 100 : undefined,
      baselineScore: data.baselineScore != null ? data.baselineScore / 100 : undefined,
      baselineDate: data.baselineDate ? new Date(data.baselineDate) : undefined,
      iepId: data.iepId || undefined,
    },
  });
}

export async function createDataPoint(data: CreateDataPointInput) {
  return prisma.goalDataPoint.create({
    data: {
      goalId: data.goalId,
      sessionId: data.sessionId || undefined,
      accuracy: data.accuracy / 100, // convert % to decimal
      trialsCorrect: data.trialsCorrect,
      trialsTotal: data.trialsTotal,
      cueingLevel: data.cueingLevel,
      targetItem: data.targetItem,
      setting: data.setting,
      notes: data.notes,
      collectedAt: new Date(data.collectedAt),
    },
  });
}

export async function getDataPointsByGoalId(goalId: string) {
  return prisma.goalDataPoint.findMany({
    where: { goalId },
    orderBy: { collectedAt: "asc" },
  });
}

/** Get recent data points for all active goals of a student (for dashboard). */
export async function getActiveGoalSummaries(studentId: string) {
  return prisma.goal.findMany({
    where: { studentId, status: "ACTIVE" },
    include: {
      dataPoints: {
        orderBy: { collectedAt: "desc" },
        take: 10,
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}
