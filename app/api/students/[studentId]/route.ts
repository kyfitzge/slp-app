import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getStudentById, updateStudent, archiveStudent } from "@/lib/queries/students";
import { updateStudentSchema } from "@/lib/validations/student";
import { z } from "zod";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const user = await requireUser();
    const { studentId } = await params;
    const student = await getStudentById(studentId, user.id);
    if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ student });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const user = await requireUser();
    const { studentId } = await params;
    const body = await request.json();
    const data = updateStudentSchema.parse(body);
    const student = await updateStudent(studentId, user.id, data);
    return NextResponse.json({ student });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const user = await requireUser();
    const { studentId } = await params;
    await archiveStudent(studentId, user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
