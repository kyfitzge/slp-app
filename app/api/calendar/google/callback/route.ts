import { type NextRequest, NextResponse } from "next/server";
import { handleGoogleCallback } from "@/lib/services/google-calendar";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const settingsUrl = new URL("/settings", req.nextUrl.origin);

  if (error || !code || !state) {
    settingsUrl.searchParams.set("calendar_error", "google");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    await handleGoogleCallback(code, state);
    settingsUrl.searchParams.set("calendar_connected", "google");
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error("[google/callback]", err);
    settingsUrl.searchParams.set("calendar_error", "google");
    return NextResponse.redirect(settingsUrl);
  }
}
