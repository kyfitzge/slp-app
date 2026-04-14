import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getLessonPlansByStudent, createLessonPlan } from "@/lib/queries/lesson-plans";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const studentId = req.nextUrl.searchParams.get("studentId");
    if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });

    const plans = await getLessonPlansByStudent(studentId, user.id);
    return NextResponse.json({ plans });
  } catch (err) {
    console.error("[GET /api/lesson-plans]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { studentId, studentId2, sessionDate, sessionType, durationMins, slpNotes, planText } = body;

    if (!studentId || !sessionDate || !sessionType || !planText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const plan = await createLessonPlan({
      userId: user.id,
      studentId,
      studentId2: studentId2 ?? null,
      sessionDate,
      sessionType,
      durationMins: durationMins ?? null,
      slpNotes: slpNotes ?? null,
      planText,
      isDraft: true,
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/lesson-plans]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
