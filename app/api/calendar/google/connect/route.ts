import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getGoogleOAuthUrl } from "@/lib/services/google-calendar";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = getGoogleOAuthUrl(user.id);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ error: "Failed to initiate Google auth" }, { status: 500 });
  }
}
