import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const user = await requireUser();
    const { reportId } = await params;
    const report = await prisma.evaluationReport.findFirst({
      where: { id: reportId, userId: user.id },
      include: { template: { select: { id: true, name: true } } },
    });
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Unauthorized" || msg.includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const user = await requireUser();
    const { reportId } = await params;
    const body = await request.json();
    const { title, content, status } = body;

    const updated = await prisma.evaluationReport.updateMany({
      where: { id: reportId, userId: user.id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Unauthorized" || msg.includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const user = await requireUser();
    const { reportId } = await params;
    await prisma.evaluationReport.deleteMany({
      where: { id: reportId, userId: user.id },
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Unauthorized" || msg.includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
