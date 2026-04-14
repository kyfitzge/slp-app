import { prisma } from "@/lib/db";

export async function getLessonPlansByStudent(studentId: string, userId: string) {
  return prisma.lessonPlan.findMany({
    where: { studentId, userId },
    select: {
      id: true,
      studentId: true,
      additionalStudentIds: true,
      sessionDate: true,
      sessionType: true,
      durationMins: true,
      slpNotes: true,
      planText: true,
      isDraft: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLessonPlanById(planId: string, userId: string) {
  return prisma.lessonPlan.findFirst({
    where: { id: planId, userId },
    select: {
      id: true,
      studentId: true,
      additionalStudentIds: true,
      sessionDate: true,
      sessionType: true,
      durationMins: true,
      slpNotes: true,
      planText: true,
      isDraft: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createLessonPlan(data: {
  userId: string;
  studentId: string;
  additionalStudentIds?: string[];
  sessionDate: string;
  sessionType: string;
  durationMins?: number | null;
  slpNotes?: string | null;
  planText: string;
  isDraft?: boolean;
}) {
  return prisma.lessonPlan.create({ data });
}

export async function updateLessonPlan(
  planId: string,
  userId: string,
  data: {
    planText?: string;
    sessionDate?: string;
    sessionType?: string;
    durationMins?: number | null;
    slpNotes?: string | null;
    additionalStudentIds?: string[];
    isDraft?: boolean;
  }
) {
  return prisma.lessonPlan.updateMany({
    where: { id: planId, userId },
    data,
  });
}

export async function deleteLessonPlan(planId: string, userId: string) {
  return prisma.lessonPlan.deleteMany({ where: { id: planId, userId } });
}

/** Fetch the clinical data needed to generate a lesson plan for one student. */
async function fetchStudentPlanData(userId: string, studentId: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const [student, sessions] = await Promise.all([
    prisma.student.findFirst({
      where: {
        id: studentId,
        caseloads: { some: { userId, removedAt: null } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gradeLevel: true,
        schoolName: true,
        goals: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            shortName: true,
            goalText: true,
            domain: true,
            targetAccuracy: true,
            baselineScore: true,
            status: true,
            dataPoints: {
              where: { collectedAt: { gte: cutoff } },
              select: {
                accuracy: true,
                collectedAt: true,
                cueingLevel: true,
                trialsCorrect: true,
                trialsTotal: true,
              },
              orderBy: { collectedAt: "asc" },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
        ieps: {
          where: { status: { in: ["ACTIVE", "IN_REVIEW"] } },
          select: {
            id: true,
            status: true,
            effectiveDate: true,
            reviewDate: true,
            minutesPerWeek: true,
            presentLevels: true,
            serviceLocation: true,
          },
          orderBy: { effectiveDate: "desc" },
          take: 1,
        },
      },
    }),

    prisma.session.findMany({
      where: {
        userId,
        sessionStudents: { some: { studentId } },
        isCancelled: false,
      },
      select: {
        id: true,
        sessionDate: true,
        sessionType: true,
        durationMins: true,
        notes: {
          select: { noteText: true },
          where: { noteText: { not: "" } },
          orderBy: { createdAt: "asc" },
        },
        dataPoints: {
          where: { goal: { studentId } },
          select: {
            accuracy: true,
            cueingLevel: true,
            trialsCorrect: true,
            trialsTotal: true,
            goal: { select: { shortName: true, domain: true } },
          },
        },
      },
      orderBy: { sessionDate: "desc" },
      take: 6,
    }),
  ]);

  return { student, sessions: sessions.reverse() };
}

/** Fetch clinical data for a primary student and any number of additional students. */
export async function getDataForLessonPlan(
  userId: string,
  studentId: string,
  additionalStudentIds: string[] = []
) {
  const ids = additionalStudentIds.filter(Boolean);

  const [primary, ...additionalResults] = await Promise.all([
    fetchStudentPlanData(userId, studentId),
    ...ids.map(id => fetchStudentPlanData(userId, id)),
  ]);

  return {
    student: primary.student,
    sessions: primary.sessions,
    additionalStudents: additionalResults,
  };
}
