import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { updateAttendance } from "@/lib/queries/sessions";
import { updateAttendanceSchema } from "@/lib/validations/session";
import { z } from "zod";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireUser();
    const { sessionId } = await params;
    const body = await request.json();
    const { students } = updateAttendanceSchema.parse(body);
    await updateAttendance(sessionId, students);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
