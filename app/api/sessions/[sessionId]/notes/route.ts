import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { upsertSessionNote } from "@/lib/queries/sessions";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireUser();
    const { sessionId } = await params;
    const notes = await prisma.sessionNote.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ notes });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireUser();
    const { sessionId } = await params;
    const { noteText, studentId } = await request.json();
    if (!noteText?.trim()) {
      return NextResponse.json({ error: "Note text required" }, { status: 400 });
    }
    const note = await upsertSessionNote(sessionId, noteText, studentId);
    return NextResponse.json({ note });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
