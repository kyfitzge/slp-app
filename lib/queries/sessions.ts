import { prisma } from "@/lib/db";
import type { CreateSessionInput } from "@/lib/validations/session";

export async function getSessionsByUserId(
  userId: string,
  options?: { limit?: number; studentId?: string }
) {
  return prisma.session.findMany({
    where: {
      userId,
      ...(options?.studentId && {
        sessionStudents: { some: { studentId: options.studentId } },
      }),
    },
    include: {
      sessionStudents: {
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              goals: {
                where: { status: "ACTIVE" },
                select: { id: true, shortName: true, domain: true },
                orderBy: { sortOrder: "asc" },
                take: 3,
              },
            },
          },
        },
      },
      notes: {
        select: { id: true, noteText: true, isLocked: true, isAiGenerated: true },
        orderBy: { createdAt: "asc" },
      },
      dataPoints: {
        select: {
          id: true,
          accuracy: true,
          goalId: true,
          goal: { select: { shortName: true, domain: true } },
        },
      },
    },
    orderBy: { sessionDate: "desc" },
    take: options?.limit,
  });
}

export async function getSessionById(sessionId: string, userId: string) {
  return prisma.session.findFirst({
    where: { id: sessionId, userId },
    include: {
      sessionStudents: {
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              goals: {
                where: { status: "ACTIVE" },
                select: { id: true, shortName: true, goalText: true, domain: true },
              },
            },
          },
        },
      },
      notes: { orderBy: { createdAt: "asc" } },
      dataPoints: {
        include: { goal: { select: { id: true, shortName: true, goalText: true } } },
        orderBy: { collectedAt: "asc" },
      },
      scheduleEntry: { select: { id: true, title: true } },
    },
  });
}

export async function createSession(data: CreateSessionInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        userId,
        scheduleEntryId: data.scheduleEntryId || undefined,
        sessionType: data.sessionType,
        sessionDate: new Date(data.sessionDate),
        startTime: data.startTime,
        durationMins: data.durationMins,
        location: data.location,
        generalNotes: data.generalNotes,
      },
    });

    // Create SessionStudent records (all PRESENT by default)
    await tx.sessionStudent.createMany({
      data: data.studentIds.map((studentId) => ({
        sessionId: session.id,
        studentId,
        attendance: "PRESENT" as const,
      })),
    });

    return session;
  });
}

export async function updateAttendance(
  sessionId: string,
  updates: Array<{ studentId: string; attendance: string; attendanceNote?: string }>
) {
  return prisma.$transaction(
    updates.map(({ studentId, attendance, attendanceNote }) =>
      prisma.sessionStudent.updateMany({
        where: { sessionId, studentId },
        data: { attendance: attendance as never, attendanceNote },
      })
    )
  );
}

export async function upsertSessionNote(
  sessionId: string,
  noteText: string,
  studentId?: string
) {
  // Upsert: create or update note for this session (+ optional studentId)
  const existing = await prisma.sessionNote.findFirst({
    where: { sessionId, studentId: studentId ?? null },
  });

  if (existing) {
    if (existing.isLocked) throw new Error("Note is locked and cannot be edited");
    return prisma.sessionNote.update({
      where: { id: existing.id },
      data: { noteText },
    });
  }

  return prisma.sessionNote.create({
    data: { sessionId, studentId: studentId ?? null, noteText },
  });
}

/** Get sessions within a date range (for calendar view). */
export async function getSessionsForDateRange(
  userId: string,
  from: Date,
  to: Date
) {
  return prisma.session.findMany({
    where: {
      userId,
      sessionDate: { gte: from, lte: to },
      isCancelled: false,
    },
    select: {
      id: true,
      sessionDate: true,
      sessionType: true,
      sessionStudents: {
        select: { student: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { sessionDate: "asc" },
  });
}

/** Full session data for a report: one student, date range. */
export async function getSessionsForReport(
  userId: string,
  options: { studentId: string; startDate: Date; endDate: Date }
) {
  const [student, sessions] = await Promise.all([
    prisma.student.findFirst({
      where: {
        id: options.studentId,
        caseloads: { some: { userId, removedAt: null } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gradeLevel: true,
        schoolName: true,
        goals: {
          where: { status: { in: ["ACTIVE", "MASTERED"] } },
          select: {
            id: true,
            shortName: true,
            goalText: true,
            domain: true,
            status: true,
            targetAccuracy: true,
            baselineScore: true,
            baselineDate: true,
            masteryDate: true,
            dataPoints: {
              where: {
                collectedAt: { gte: options.startDate, lte: options.endDate },
              },
              select: {
                id: true,
                accuracy: true,
                collectedAt: true,
                sessionId: true,
                cueingLevel: true,
                trialsCorrect: true,
                trialsTotal: true,
              },
              orderBy: { collectedAt: "asc" },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    prisma.session.findMany({
      where: {
        userId,
        sessionDate: { gte: options.startDate, lte: options.endDate },
        sessionStudents: { some: { studentId: options.studentId } },
      },
      include: {
        sessionStudents: {
          where: { studentId: options.studentId },
          select: { attendance: true, attendanceNote: true },
        },
        notes: {
          select: {
            id: true,
            noteText: true,
            isLocked: true,
            isAiGenerated: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        dataPoints: {
          where: { goal: { studentId: options.studentId } },
          select: {
            id: true,
            accuracy: true,
            goalId: true,
            cueingLevel: true,
            trialsCorrect: true,
            trialsTotal: true,
            goal: {
              select: {
                shortName: true,
                goalText: true,
                domain: true,
                targetAccuracy: true,
              },
            },
          },
        },
      },
      orderBy: { sessionDate: "asc" },
    }),
  ]);

  return { student, sessions };
}

/** Get today's sessions for the dashboard. */
export async function getTodaysSessions(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return prisma.session.findMany({
    where: {
      userId,
      sessionDate: { gte: today, lt: tomorrow },
      isCancelled: false,
    },
    include: {
      sessionStudents: {
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });
}
