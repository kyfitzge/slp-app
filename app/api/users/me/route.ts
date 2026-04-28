import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-user";
import { prisma } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * DELETE /api/users/me
 *
 * Permanently deletes the authenticated user's account:
 *  1. Finds all students exclusively on this user's caseload and deletes them
 *     (cascades IEPs, goals, data points, etc.).
 *  2. Deletes the Prisma User record (cascades sessions, schedule entries,
 *     progress summaries, evaluation reports, caseload entries).
 *  3. Removes the user from Supabase Auth via the admin client.
 */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── 1. Delete students that belong exclusively to this caseload ──────────
    // Find students where this user is the only caseload member.
    const exclusiveStudents = await prisma.student.findMany({
      where: {
        caseloads: {
          every: { userId: user.id },
          some:  { userId: user.id },
        },
      },
      select: { id: true },
    });

    if (exclusiveStudents.length > 0) {
      await prisma.student.deleteMany({
        where: { id: { in: exclusiveStudents.map((s) => s.id) } },
      });
    }

    // ── 2. Delete the Prisma user record (cascades everything else) ───────────
    const supabaseUserId = user.supabaseUserId;
    await prisma.user.delete({ where: { id: user.id } });

    // ── 3. Remove from Supabase Auth ──────────────────────────────────────────
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(supabaseUserId);
    if (error) {
      // Log but don't fail — Prisma data is already gone; Supabase session
      // will expire naturally and the user can't log back in without a DB record.
      console.error("[delete-account] Supabase auth deletion failed:", error.message);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[delete-account] Error:", err);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
