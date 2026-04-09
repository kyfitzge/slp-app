import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getGoalById, updateGoal } from "@/lib/queries/goals";
import { updateGoalSchema } from "@/lib/validations/goal";
import { z } from "zod";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ goalId: string }> }
) {
  try {
    await requireUser();
    const { goalId } = await params;
    const goal = await getGoalById(goalId);
    if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ goal });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ goalId: string }> }
) {
  try {
    await requireUser();
    const { goalId } = await params;
    const body = await request.json();
    const data = updateGoalSchema.parse(body);
    const goal = await updateGoal(goalId, data);
    return NextResponse.json({ goal });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
