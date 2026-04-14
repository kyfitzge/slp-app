import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getLessonPlanById, updateLessonPlan, deleteLessonPlan } from "@/lib/queries/lesson-plans";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const user = await requireUser();
    const { planId } = await params;
    const plan = await getLessonPlanById(planId, user.id);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ plan });
  } catch (err) {
    console.error("[GET /api/lesson-plans/[planId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const user = await requireUser();
    const { planId } = await params;
    const body = await req.json();
    await updateLessonPlan(planId, user.id, body);
    const updated = await getLessonPlanById(planId, user.id);
    return NextResponse.json({ plan: updated });
  } catch (err) {
    console.error("[PATCH /api/lesson-plans/[planId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const user = await requireUser();
    const { planId } = await params;
    await deleteLessonPlan(planId, user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/lesson-plans/[planId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
