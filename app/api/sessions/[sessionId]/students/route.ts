import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { prisma } from "@/lib/db";

/** POST /api/sessions/[sessionId]/students
 *  Body: { studentId: string }
 *  Adds a student to an existing session (idempotent — safe to call if already present).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { sessionId } = await params;
    const { studentId } = await request.json();

    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }

    // Verify the session belongs to this user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: user.id },
      select: { id: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Upsert — no-op if student is already in the session
    await prisma.sessionStudent.upsert({
      where: { sessionId_studentId: { sessionId, studentId } },
      create: { sessionId, studentId },
      update: {},
    });

    // Return the updated student list
    const updated = await prisma.session.findFirst({
      where: { id: sessionId },
      select: {
        sessionStudents: {
          select: { student: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    return NextResponse.json({ sessionStudents: updated?.sessionStudents ?? [] });
  } catch (err) {
    console.error("[POST /api/sessions/[sessionId]/students]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
