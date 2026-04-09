import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek } from "date-fns";
import type { CreateScheduleEntryInput } from "@/lib/validations/schedule";

/** Get all schedule entries for a given week (Mon–Fri). */
export async function getScheduleForWeek(userId: string, weekStart: Date) {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  return prisma.scheduleEntry.findMany({
    where: {
      userId,
      isActive: true,
      OR: [
        // Recurring entries active during this week
        {
          frequency: { in: ["WEEKLY", "BIWEEKLY"] },
          startDate: { lte: weekEnd },
          OR: [{ endDate: null }, { endDate: { gte: weekStart } }],
        },
        // One-off entries in this week
        {
          frequency: "ONCE",
          specificDate: { gte: weekStart, lte: weekEnd },
        },
      ],
    },
    include: {
      scheduleStudents: true,
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

/** Get student IDs for a schedule entry. */
export async function getScheduleEntryStudentIds(entryId: string): Promise<string[]> {
  const records = await prisma.scheduleEntryStudent.findMany({
    where: { scheduleEntryId: entryId },
    select: { studentId: true },
  });
  return records.map((r) => r.studentId);
}

export async function createScheduleEntry(
  data: CreateScheduleEntryInput,
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.scheduleEntry.create({
      data: {
        userId,
        title: data.title,
        sessionType: data.sessionType,
        frequency: data.frequency,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        durationMins: data.durationMins,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        specificDate: data.specificDate ? new Date(data.specificDate) : undefined,
        location: data.location,
        notes: data.notes,
      },
    });

    await tx.scheduleEntryStudent.createMany({
      data: data.studentIds.map((studentId) => ({
        scheduleEntryId: entry.id,
        studentId,
      })),
    });

    return entry;
  });
}

export async function deleteScheduleEntry(entryId: string, userId: string) {
  // Soft-delete: set isActive = false
  return prisma.scheduleEntry.updateMany({
    where: { id: entryId, userId },
    data: { isActive: false },
  });
}
