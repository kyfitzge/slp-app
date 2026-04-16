import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { getOutlookOAuthUrl } from "@/lib/services/outlook-calendar";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = getOutlookOAuthUrl(user.id);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ error: "Failed to initiate Outlook auth" }, { status: 500 });
  }
}
