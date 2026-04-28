import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { seedDemoData } from "@/lib/demo-seed";

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
    const isNewUser = !(await prisma.user.findUnique({ where: { email: data.email } }));

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

    // Populate demo caseload for brand-new accounts so new users see a
    // fully-featured example immediately after signing up.
    if (isNewUser) {
      seedDemoData(user.id).catch((err) =>
        console.error("[demo-seed] Failed to seed demo data:", err)
      );
    }

    return NextResponse.json({ user }, { status: 200 });
  } catch (err) {
    console.error("Register user error:", err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
