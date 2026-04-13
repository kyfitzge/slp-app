import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import {
  getProgressReportsByStudent,
  createProgressReport,
} from "@/lib/queries/progress-reports";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }

    const reports = await getProgressReportsByStudent(studentId, user.id);
    return NextResponse.json({ reports });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();

    const {
      studentId,
      iepId,
      periodLabel,
      periodStartDate,
      periodEndDate,
      summaryText,
      goalSnapshots,
      isDraft,
    } = body;

    if (!studentId || !periodLabel || !periodStartDate || !periodEndDate || !summaryText) {
      return NextResponse.json(
        { error: "studentId, periodLabel, periodStartDate, periodEndDate, and summaryText are required" },
        { status: 400 }
      );
    }

    const report = await createProgressReport({
      userId: user.id,
      studentId,
      iepId: iepId ?? null,
      periodLabel,
      periodStartDate: new Date(periodStartDate),
      periodEndDate: new Date(periodEndDate),
      summaryText,
      goalSnapshots: goalSnapshots ?? undefined,
      isDraft: isDraft ?? true,
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/progress-reports]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
