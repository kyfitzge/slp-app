import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  credentials: z.string().optional(),
  schoolDistrict: z.string().optional(),
  licenseNumber: z.string().optional(),
  phone: z.string().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const user = await requireUser();
    const { userId } = await params;

    // Users may only update their own profile
    if (user.id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const data = updateUserSchema.parse(body);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        credentials: data.credentials || null,
        schoolDistrict: data.schoolDistrict || null,
        licenseNumber: data.licenseNumber || null,
        phone: data.phone || null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        credentials: true,
        schoolDistrict: true,
        licenseNumber: true,
        phone: true,
      },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
