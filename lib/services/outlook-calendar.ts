/**
 * Microsoft Outlook / Graph Calendar service.
 *
 * Uses Microsoft Graph REST API directly (via fetch) rather than the Graph
 * SDK, so there are no extra server-only bundle concerns. MSAL is used only
 * for the OAuth2 authorization code exchange and token refresh.
 */

import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/utils/encrypt";
import type { CalendarIntegration } from "@/app/generated/prisma/client";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID ?? "common"}/oauth2/v2.0/token`;

// ─── Auth URL ────────────────────────────────────────────────────────────────

export function getOutlookOAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
    response_mode: "query",
    scope: "Calendars.ReadWrite offline_access User.Read",
    state: Buffer.from(JSON.stringify({ userId })).toString("base64url"),
  });
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? "common";
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
}

// ─── Token exchange (callback) ───────────────────────────────────────────────

export async function handleOutlookCallback(
  code: string,
  state: string
): Promise<void> {
  const { userId } = JSON.parse(
    Buffer.from(state, "base64url").toString("utf8")
  ) as { userId: string };

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook token exchange failed: ${text}`);
  }

  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "Outlook did not return both access_token and refresh_token. " +
        "Make sure offline_access scope is included."
    );
  }

  const accessEnc = encrypt(tokens.access_token);
  const refreshEnc = encrypt(tokens.refresh_token);
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  await prisma.calendarIntegration.upsert({
    where: { userId_provider: { userId, provider: "OUTLOOK" } },
    create: {
      userId,
      provider: "OUTLOOK",
      encryptedAccess: accessEnc.ciphertext,
      accessAuthTag: accessEnc.authTag,
      encryptedRefresh: refreshEnc.ciphertext,
      refreshAuthTag: refreshEnc.authTag,
      tokenIv: accessEnc.iv,
      expiresAt,
    },
    update: {
      encryptedAccess: accessEnc.ciphertext,
      accessAuthTag: accessEnc.authTag,
      encryptedRefresh: refreshEnc.ciphertext,
      refreshAuthTag: refreshEnc.authTag,
      tokenIv: accessEnc.iv,
      expiresAt,
    },
  });
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function getValidAccessToken(
  integration: CalendarIntegration
): Promise<string> {
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

  const refreshToken = decrypt({
    ciphertext: integration.encryptedRefresh,
    iv: integration.tokenIv,
    authTag: integration.refreshAuthTag,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "Calendars.ReadWrite offline_access User.Read",
    }),
  });

  if (!res.ok) throw new Error("Outlook token refresh failed");

  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const newEnc = encrypt(tokens.access_token);
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  const updateData: Parameters<typeof prisma.calendarIntegration.update>[0]["data"] = {
    encryptedAccess: newEnc.ciphertext,
    accessAuthTag: newEnc.authTag,
    tokenIv: newEnc.iv,
    expiresAt,
  };

  // Microsoft sometimes issues a new refresh token on refresh
  if (tokens.refresh_token) {
    const newRefreshEnc = encrypt(tokens.refresh_token);
    updateData.encryptedRefresh = newRefreshEnc.ciphertext;
    updateData.refreshAuthTag = newRefreshEnc.authTag;
  }

  await prisma.calendarIntegration.update({
    where: { id: integration.id },
    data: updateData,
  });

  return tokens.access_token;
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

  const dateStr =
    session.sessionDate instanceof Date
      ? session.sessionDate.toISOString().slice(0, 10)
      : String(session.sessionDate).slice(0, 10);

  const [hh, mm] = (session.startTime ?? "09:00").split(":").map(Number);
  const durationMins = session.durationMins ?? 30;

  const startDate = new Date(
    `${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`
  );
  const endDate = new Date(startDate.getTime() + durationMins * 60 * 1000);

  const toIso = (d: Date) => d.toISOString();
  const sessionTypeLabel = session.sessionType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    subject: `Speech Therapy – ${studentNames || "Session"}`,
    body: {
      contentType: "text",
      content: `${sessionTypeLabel} session${session.location ? ` at ${session.location}` : ""}.\nStudents: ${studentNames || "—"}`,
    },
    start: { dateTime: toIso(startDate), timeZone: "UTC" },
    end: { dateTime: toIso(endDate), timeZone: "UTC" },
    ...(session.location && { location: { displayName: session.location } }),
  };
}

// ─── Create or update a calendar event ───────────────────────────────────────

export async function upsertOutlookEvent(
  integration: CalendarIntegration,
  session: SessionForCalendar
): Promise<string> {
  const accessToken = await getValidAccessToken(integration);

  const existing = await prisma.sessionExternalEvent.findUnique({
    where: { sessionId_provider: { sessionId: session.id, provider: "OUTLOOK" } },
  });

  const payload = buildEventPayload(session);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  if (existing) {
    const res = await fetch(
      `${GRAPH_BASE}/me/events/${existing.externalEventId}`,
      { method: "PATCH", headers, body: JSON.stringify(payload) }
    );
    if (!res.ok) throw new Error(`Outlook event update failed: ${res.status}`);
    return existing.externalEventId;
  } else {
    const res = await fetch(`${GRAPH_BASE}/me/events`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Outlook event create failed: ${res.status}`);
    const data = (await res.json()) as { id: string };
    await prisma.sessionExternalEvent.create({
      data: {
        sessionId: session.id,
        provider: "OUTLOOK",
        externalEventId: data.id,
        calendarIntegrationId: integration.id,
      },
    });
    return data.id;
  }
}

// ─── Delete a calendar event ─────────────────────────────────────────────────

export async function deleteOutlookEvent(
  integration: CalendarIntegration,
  sessionId: string
): Promise<void> {
  const existing = await prisma.sessionExternalEvent.findUnique({
    where: { sessionId_provider: { sessionId, provider: "OUTLOOK" } },
  });
  if (!existing) return;

  const accessToken = await getValidAccessToken(integration);

  const res = await fetch(
    `${GRAPH_BASE}/me/events/${existing.externalEventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  // 404 = already deleted externally
  if (!res.ok && res.status !== 404) {
    throw new Error(`Outlook event delete failed: ${res.status}`);
  }

  await prisma.sessionExternalEvent.delete({ where: { id: existing.id } });
}
