import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getScheduleForWeek, createScheduleEntry } from "@/lib/queries/schedule";
import { createScheduleEntrySchema } from "@/lib/validations/schedule";
import { startOfWeek } from "date-fns";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get("week");
    const weekStart = weekParam
      ? startOfWeek(new Date(weekParam), { weekStartsOn: 1 })
      : startOfWeek(new Date(), { weekStartsOn: 1 });
    const entries = await getScheduleForWeek(user.id, weekStart);
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const data = createScheduleEntrySchema.parse(body);
    const entry = await createScheduleEntry(data, user.id);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
