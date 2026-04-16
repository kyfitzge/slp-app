/**
 * Calendar sync orchestrator.
 *
 * The single entry-point called by session API routes after create / update /
 * delete. Loops over every active CalendarIntegration for the user and pushes
 * the change to each provider. Failures are caught per-provider so one broken
 * integration never blocks the others.
 */

import { prisma } from "@/lib/db";
import { upsertGoogleEvent, deleteGoogleEvent } from "./google-calendar";
import { upsertOutlookEvent, deleteOutlookEvent } from "./outlook-calendar";
import type { CalendarProvider } from "@/app/generated/prisma/client";

// ─── Sync a single session to all connected calendars ────────────────────────

export async function syncSessionToCalendars(
  sessionId: string,
  userId: string,
  action: "upsert" | "delete"
): Promise<void> {
  const integrations = await prisma.calendarIntegration.findMany({
    where: { userId },
  });

  if (integrations.length === 0) return;

  // For upsert we need the session with students
  const session =
    action === "upsert"
      ? await prisma.session.findUnique({
          where: { id: sessionId },
          include: {
            sessionStudents: {
              include: { student: { select: { firstName: true, lastName: true } } },
            },
          },
        })
      : null;

  await Promise.allSettled(
    integrations.map(async (integration) => {
      try {
        if (action === "delete") {
          if (integration.provider === "GOOGLE") {
            await deleteGoogleEvent(integration, sessionId);
          } else if (integration.provider === "OUTLOOK") {
            await deleteOutlookEvent(integration, sessionId);
          }
        } else if (session) {
          if (integration.provider === "GOOGLE") {
            await upsertGoogleEvent(integration, session);
          } else if (integration.provider === "OUTLOOK") {
            await upsertOutlookEvent(integration, session);
          }
        }
      } catch (err) {
        console.error(
          `[calendar-sync] ${action} failed for provider=${integration.provider} session=${sessionId}:`,
          err
        );
      }
    })
  );
}

// ─── Integration status (for settings UI) ────────────────────────────────────

export async function getCalendarIntegrations(userId: string) {
  const rows = await prisma.calendarIntegration.findMany({
    where: { userId },
    select: { provider: true, connectedAt: true, calendarId: true },
    orderBy: { connectedAt: "asc" },
  });
  return rows as { provider: CalendarProvider; connectedAt: Date; calendarId: string }[];
}

// ─── Disconnect a provider ────────────────────────────────────────────────────

export async function disconnectCalendar(
  userId: string,
  provider: CalendarProvider
): Promise<void> {
  // Cascade delete also removes all SessionExternalEvent rows for this integration
  await prisma.calendarIntegration.deleteMany({
    where: { userId, provider },
  });
}
