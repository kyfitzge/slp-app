import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { createIEP, getIEPsByStudentId } from "@/lib/queries/ieps";
import { createIEPSchema } from "@/lib/validations/iep";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });
    const ieps = await getIEPsByStudentId(studentId);
    return NextResponse.json({ ieps });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json();
    const data = createIEPSchema.parse(body);
    const iep = await createIEP(data);
    return NextResponse.json({ iep }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
