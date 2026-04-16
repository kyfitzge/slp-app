import { type NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { disconnectCalendar } from "@/lib/services/calendar-sync";
import type { CalendarProvider } from "@/app/generated/prisma/client";

const VALID_PROVIDERS: CalendarProvider[] = ["GOOGLE", "OUTLOOK"];

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { provider } = (await req.json()) as { provider: CalendarProvider };

    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    await disconnectCalendar(user.id, provider);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[calendar/disconnect]", err);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
