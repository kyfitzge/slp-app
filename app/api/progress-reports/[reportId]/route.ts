import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import {
  getProgressReportById,
  updateProgressReport,
  deleteProgressReport,
} from "@/lib/queries/progress-reports";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const user = await requireUser();
    const { reportId } = await params;

    const report = await getProgressReportById(reportId, user.id);
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json({ report });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const user = await requireUser();
    const { reportId } = await params;
    const body = await request.json();

    const { summaryText, periodLabel, isDraft, finalize } = body;

    const updateData: Parameters<typeof updateProgressReport>[2] = {};

    if (summaryText !== undefined) updateData.summaryText = summaryText;
    if (periodLabel !== undefined) updateData.periodLabel = periodLabel;
    if (isDraft !== undefined) updateData.isDraft = isDraft;

    if (finalize === true) {
      updateData.isDraft = false;
      updateData.finalizedAt = new Date();
    }

    const result = await updateProgressReport(reportId, user.id, updateData);

    if (result.count === 0) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const updated = await getProgressReportById(reportId, user.id);
    return NextResponse.json({ report: updated });
  } catch (err) {
    console.error("[PATCH /api/progress-reports/[reportId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const user = await requireUser();
    const { reportId } = await params;

    const result = await deleteProgressReport(reportId, user.id);

    if (result.count === 0) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/progress-reports/[reportId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
