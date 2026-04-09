import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

/**
 * Returns the verified Supabase user + their Prisma User record.
 * Uses getUser() so the session is validated server-side.
 * Returns null if unauthenticated.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const dbUser = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
  });

  return dbUser;
}

/**
 * Same as getCurrentUser but throws a redirect to /login if unauthenticated.
 * Use in server components / route handlers that require auth.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return user;
}
