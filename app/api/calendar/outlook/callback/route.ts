import { type NextRequest, NextResponse } from "next/server";
import { handleOutlookCallback } from "@/lib/services/outlook-calendar";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const settingsUrl = new URL("/settings", req.nextUrl.origin);

  if (error || !code || !state) {
    settingsUrl.searchParams.set("calendar_error", "outlook");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    await handleOutlookCallback(code, state);
    settingsUrl.searchParams.set("calendar_connected", "outlook");
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error("[outlook/callback]", err);
    settingsUrl.searchParams.set("calendar_error", "outlook");
    return NextResponse.redirect(settingsUrl);
  }
}
