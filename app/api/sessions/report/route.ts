import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getSessionsForReport } from "@/lib/queries/sessions";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const { searchParams } = req.nextUrl;

  const studentId = searchParams.get("studentId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!studentId || !startDate || !endDate) {
    return Response.json(
      { error: "studentId, startDate, and endDate are required" },
      { status: 400 }
    );
  }

  const { student, sessions } = await getSessionsForReport(user!.id, {
    studentId,
    startDate: new Date(startDate + "T00:00:00"),
    endDate: new Date(endDate + "T23:59:59"),
  });

  if (!student) {
    return Response.json({ error: "Student not found" }, { status: 404 });
  }

  // Derive summary statistics
  const nonCancelled = sessions.filter((s) => !s.isCancelled);
  const attended = nonCancelled.filter(
    (s) => s.sessionStudents[0]?.attendance === "PRESENT"
  ).length;
  const allDp = sessions.flatMap((s) => s.dataPoints);
  const goalIds = new Set(allDp.map((dp) => dp.goalId));
  const avgAccuracy =
    allDp.length > 0
      ? Math.round((allDp.reduce((sum, dp) => sum + dp.accuracy, 0) / allDp.length) * 100)
      : null;

  return Response.json({
    student,
    sessions,
    period: { start: startDate, end: endDate },
    summary: {
      totalSessions: sessions.length,
      attendedSessions: attended,
      cancelledSessions: sessions.filter((s) => s.isCancelled).length,
      goalsTracked: goalIds.size,
      avgAccuracy,
      sessionsNeedingNotes: nonCancelled.filter((s) => s.notes.length === 0).length,
    },
  });
}
