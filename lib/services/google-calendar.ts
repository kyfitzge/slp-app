/**
 * Google Calendar OAuth2 + Calendar API service.
 *
 * Handles the authorization code flow, token refresh, and CRUD for
 * calendar events that mirror the app's sessions.
 */

import { google } from "googleapis";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/utils/encrypt";
import type { CalendarIntegration } from "@/app/generated/prisma/client";

// ─── OAuth2 client factory ────────────────────────────────────────────────────

function makeOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  );
}

// ─── Auth URL ────────────────────────────────────────────────────────────────

export function getGoogleOAuthUrl(userId: string): string {
  const oauth2 = makeOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force consent screen so we always get a refresh token
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state: Buffer.from(JSON.stringify({ userId })).toString("base64url"),
  });
}

// ─── Token exchange (callback) ───────────────────────────────────────────────

export async function handleGoogleCallback(
  code: string,
  state: string
): Promise<void> {
  const { userId } = JSON.parse(
    Buffer.from(state, "base64url").toString("utf8")
  ) as { userId: string };

  const oauth2 = makeOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "Google did not return both access_token and refresh_token. " +
        "Make sure prompt=consent and access_type=offline are set."
    );
  }

  const accessEnc = encrypt(tokens.access_token);
  const refreshEnc = encrypt(tokens.refresh_token);

  // Store a shared IV for both tokens (both are encrypted in the same operation)
  await prisma.calendarIntegration.upsert({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
    create: {
      userId,
      provider: "GOOGLE",
      encryptedAccess: accessEnc.ciphertext,
      accessAuthTag: accessEnc.authTag,
      encryptedRefresh: refreshEnc.ciphertext,
      refreshAuthTag: refreshEnc.authTag,
      tokenIv: accessEnc.iv, // we use the same IV for both (same encrypt call moment)
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
    update: {
      encryptedAccess: accessEnc.ciphertext,
      accessAuthTag: accessEnc.authTag,
      encryptedRefresh: refreshEnc.ciphertext,
      refreshAuthTag: refreshEnc.authTag,
      tokenIv: accessEnc.iv,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  });
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function getValidAccessToken(
  integration: CalendarIntegration
): Promise<string> {
  // If the access token is still valid (with 2-min buffer), use it as-is
  if (
    integration.expiresAt &&
    integration.expiresAt.getTime() - Date.now() > 2 * 60 * 1000
  ) {
    return decrypt({
      ciphertext: integration.encryptedAccess,
      iv: integration.tokenIv,
      authTag: integration.accessAuthTag,
    });
  }

  // Refresh
  const refreshToken = decrypt({
    ciphertext: integration.encryptedRefresh,
    iv: integration.tokenIv,
    authTag: integration.refreshAuthTag,
  });

  const oauth2 = makeOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2.refreshAccessToken();

  if (!credentials.access_token) throw new Error("Token refresh failed");

  const newEnc = encrypt(credentials.access_token);

  // Persist the refreshed access token
  await prisma.calendarIntegration.update({
    where: { id: integration.id },
    data: {
      encryptedAccess: newEnc.ciphertext,
      accessAuthTag: newEnc.authTag,
      tokenIv: newEnc.iv,
      expiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : null,
    },
  });

  return credentials.access_token;
}

// ─── Build event payload ──────────────────────────────────────────────────────

interface SessionForCalendar {
  id: string;
  sessionDate: Date | string;
  startTime: string | null;
  durationMins: number | null;
  sessionType: string;
  location: string | null;
  sessionStudents: { student: { firstName: string; lastName: string } }[];
}

function buildEventPayload(session: SessionForCalendar) {
  const studentNames = session.sessionStudents
    .map((ss) => `${ss.student.firstName} ${ss.student.lastName}`)
    .join(", ");

  // Normalise date — sessionDate may arrive as a UTC-midnight DateTime
  const dateStr =
    session.sessionDate instanceof Date
      ? session.sessionDate.toISOString().slice(0, 10)
      : String(session.sessionDate).slice(0, 10);

  const [hh, mm] = (session.startTime ?? "09:00").split(":").map(Number);
  const durationMins = session.durationMins ?? 30;

  const startDate = new Date(`${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`);
  const endDate = new Date(startDate.getTime() + durationMins * 60 * 1000);

  const toRfc3339 = (d: Date) => d.toISOString();

  const sessionTypeLabel = session.sessionType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    summary: `Speech Therapy – ${studentNames || "Session"}`,
    description: `${sessionTypeLabel} session${session.location ? ` at ${session.location}` : ""}.\nStudents: ${studentNames || "—"}`,
    start: { dateTime: toRfc3339(startDate), timeZone: "UTC" },
    end: { dateTime: toRfc3339(endDate), timeZone: "UTC" },
    ...(session.location && { location: session.location }),
  };
}

// ─── Create or update a calendar event ───────────────────────────────────────

export async function upsertGoogleEvent(
  integration: CalendarIntegration,
  session: SessionForCalendar
): Promise<string> {
  const accessToken = await getValidAccessToken(integration);

  const oauth2 = makeOAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  const existing = await prisma.sessionExternalEvent.findUnique({
    where: { sessionId_provider: { sessionId: session.id, provider: "GOOGLE" } },
  });

  const payload = buildEventPayload(session);

  if (existing) {
    await calendar.events.update({
      calendarId: integration.calendarId,
      eventId: existing.externalEventId,
      requestBody: payload,
    });
    return existing.externalEventId;
  } else {
    const res = await calendar.events.insert({
      calendarId: integration.calendarId,
      requestBody: payload,
    });
    const eventId = res.data.id!;
    await prisma.sessionExternalEvent.create({
      data: {
        sessionId: session.id,
        provider: "GOOGLE",
        externalEventId: eventId,
        calendarIntegrationId: integration.id,
      },
    });
    return eventId;
  }
}

// ─── Delete a calendar event ─────────────────────────────────────────────────

export async function deleteGoogleEvent(
  integration: CalendarIntegration,
  sessionId: string
): Promise<void> {
  const existing = await prisma.sessionExternalEvent.findUnique({
    where: { sessionId_provider: { sessionId, provider: "GOOGLE" } },
  });
  if (!existing) return;

  const accessToken = await getValidAccessToken(integration);
  const oauth2 = makeOAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    await calendar.events.delete({
      calendarId: integration.calendarId,
      eventId: existing.externalEventId,
    });
  } catch (err: unknown) {
    // 404 means it was already deleted externally — that's fine
    if ((err as { code?: number }).code !== 404) throw err;
  }

  await prisma.sessionExternalEvent.delete({ where: { id: existing.id } });
}
