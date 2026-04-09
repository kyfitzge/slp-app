import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  supabaseUserId: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = schema.parse(body);

    // Upsert by email: handles re-registration after Supabase user deletion,
    // and is idempotent on repeat calls (e.g. page refresh mid-signup).
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: { supabaseUserId: data.supabaseUserId },
      create: {
        supabaseUserId: data.supabaseUserId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
      },
    });

    return NextResponse.json({ user }, { status: 200 });
  } catch (err) {
    console.error("Register user error:", err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
