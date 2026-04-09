import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { createDataPoint, getDataPointsByGoalId } from "@/lib/queries/goals";
import { createDataPointSchema } from "@/lib/validations/goal-data-point";
import { z } from "zod";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ goalId: string }> }
) {
  try {
    await requireUser();
    const { goalId } = await params;
    const dataPoints = await getDataPointsByGoalId(goalId);
    return NextResponse.json({ dataPoints });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ goalId: string }> }
) {
  try {
    await requireUser();
    const { goalId } = await params;
    const body = await request.json();
    const data = createDataPointSchema.parse({ ...body, goalId });
    const dataPoint = await createDataPoint(data);
    return NextResponse.json({ dataPoint }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
