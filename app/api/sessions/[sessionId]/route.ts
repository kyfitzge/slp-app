import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getSessionById } from "@/lib/queries/sessions";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireUser();
    const { sessionId } = await params;
    const session = await getSessionById(sessionId, user.id);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireUser();
    const { sessionId } = await params;
    const body = await request.json();

    // Build update payload — only include fields that were explicitly sent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (body.sessionDate    !== undefined) data.sessionDate    = new Date(body.sessionDate + "T12:00:00");
    if (body.startTime      !== undefined) data.startTime      = body.startTime;
    if (body.sessionType    !== undefined) data.sessionType    = body.sessionType;
    if (body.durationMins   !== undefined) data.durationMins   = Number(body.durationMins);
    if (body.generalNotes   !== undefined) data.generalNotes   = body.generalNotes;
    if (body.location       !== undefined) data.location       = body.location;
    if (body.isCancelled    !== undefined) data.isCancelled    = body.isCancelled;
    if (body.cancellationReason !== undefined) data.cancellationReason = body.cancellationReason;

    const session = await prisma.session.updateMany({
      where: { id: sessionId, userId: user.id },
      data,
    });
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireUser();
    const { sessionId } = await params;

    // Verify ownership before deleting
    const existing = await prisma.session.findFirst({
      where: { id: sessionId, userId: user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.session.delete({ where: { id: sessionId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
