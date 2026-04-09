import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getSessionsByUserId, getSessionsForCalendar, createSession } from "@/lib/queries/sessions";
import { createSessionSchema } from "@/lib/validations/session";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Calendar date-range query (used by DashboardCalendar)
    if (startDate && endDate) {
      const sessions = await getSessionsForCalendar(
        user.id,
        new Date(startDate + "T00:00:00"),
        new Date(endDate + "T23:59:59"),
      );
      return NextResponse.json({ sessions });
    }

    const studentId = searchParams.get("studentId") ?? undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
    const sessions = await getSessionsByUserId(user.id, { studentId, limit });
    return NextResponse.json({ sessions });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const data = createSessionSchema.parse(body);
    const session = await createSession(data, user.id);
    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
