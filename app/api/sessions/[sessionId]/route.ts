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

    const session = await prisma.session.updateMany({
      where: { id: sessionId, userId: user.id },
      data: {
        generalNotes: body.generalNotes,
        location: body.location,
        isCancelled: body.isCancelled,
        cancellationReason: body.cancellationReason,
      },
    });
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
