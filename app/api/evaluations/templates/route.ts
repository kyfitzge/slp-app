import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { prisma } from "@/lib/db";
import mammoth from "mammoth";

export async function GET() {
  try {
    const user = await requireUser();
    const templates = await prisma.evaluationTemplate.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, fileName: true, createdAt: true },
    });
    return NextResponse.json(templates);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Unauthorized" || msg.includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string)?.trim() || "";

    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const fileName = file.name;
    const ext = fileName.split(".").pop()?.toLowerCase();
    let content = "";

    if (ext === "txt") {
      content = await file.text();
    } else if (ext === "docx") {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await mammoth.extractRawText({ buffer });
      content = result.value;
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Upload .txt or .docx" },
        { status: 400 }
      );
    }

    if (!content.trim()) {
      return NextResponse.json({ error: "File appears empty" }, { status: 400 });
    }

    const template = await prisma.evaluationTemplate.create({
      data: {
        userId: user.id,
        name: name || fileName.replace(/\.[^.]+$/, ""),
        fileName,
        content,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Unauthorized" || msg.includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to upload template" }, { status: 500 });
  }
}
