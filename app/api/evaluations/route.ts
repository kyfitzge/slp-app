import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");

    const reports = await prisma.evaluationReport.findMany({
      where: { userId: user.id, ...(studentId ? { studentId } : {}) },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        studentId: true,
        template: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(reports);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Unauthorized" || msg.includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { studentId, title, content = "", templateId } = body;

    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }
    if (!title?.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    // Verify student is on this user's caseload
    const caseload = await prisma.caseload.findFirst({
      where: { userId: user.id, studentId },
    });
    if (!caseload) {
      return NextResponse.json({ error: "Student not on caseload" }, { status: 403 });
    }

    const report = await prisma.evaluationReport.create({
      data: {
        userId: user.id,
        studentId,
        title: title.trim(),
        content,
        templateId: templateId || null,
      },
    });
    return NextResponse.json(report, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Unauthorized" || msg.includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
