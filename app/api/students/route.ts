import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getStudentsByUserId, createStudent } from "@/lib/queries/students";
import { createStudentSchema } from "@/lib/validations/student";
import { z } from "zod";

export async function GET() {
  try {
    const user = await requireUser();
    const students = await getStudentsByUserId(user.id);
    return NextResponse.json({ students });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const data = createStudentSchema.parse(body);
    const student = await createStudent(data, user.id);
    return NextResponse.json({ student }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", issues: err.issues }, { status: 400 });
    }
    console.error("Create student error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
