import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const user = await requireUser();
    const { templateId } = await params;
    await prisma.evaluationTemplate.deleteMany({
      where: { id: templateId, userId: user.id },
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Unauthorized" || msg.includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
