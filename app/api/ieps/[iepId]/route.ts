import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getIEPById, updateIEP } from "@/lib/queries/ieps";
import { updateIEPSchema } from "@/lib/validations/iep";
import { z } from "zod";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ iepId: string }> }
) {
  try {
    await requireUser();
    const { iepId } = await params;
    const iep = await getIEPById(iepId);
    if (!iep) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ iep });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ iepId: string }> }
) {
  try {
    await requireUser();
    const { iepId } = await params;
    const body = await request.json();
    const data = updateIEPSchema.parse(body);
    const iep = await updateIEP(iepId, data);
    return NextResponse.json({ iep });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
