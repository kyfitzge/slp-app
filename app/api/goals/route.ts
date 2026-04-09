import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { createGoal, getGoalsByStudentId } from "@/lib/queries/goals";
import { createGoalSchema } from "@/lib/validations/goal";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });
    const goals = await getGoalsByStudentId(studentId);
    return NextResponse.json({ goals });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json();
    const data = createGoalSchema.parse(body);
    const goal = await createGoal(data);
    return NextResponse.json({ goal }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
