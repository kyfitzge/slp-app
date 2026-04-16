"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, CheckCircle2, Link2, Link2Off, Loader2 } from "lucide-react";

interface Integration {
  provider: "GOOGLE" | "OUTLOOK";
  connectedAt: Date | string;
}

interface Props {
  integrations: Integration[];
}

const PROVIDERS = [
  {
    key: "GOOGLE" as const,
    label: "Google Calendar",
    description: "Sync sessions to your Google Calendar automatically.",
    connectHref: "/api/calendar/google/connect",
    Icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
  {
    key: "OUTLOOK" as const,
    label: "Microsoft Outlook",
    description: "Sync sessions to your Outlook / Microsoft 365 calendar.",
    connectHref: "/api/calendar/outlook/connect",
    Icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path fill="#0078D4" d="M24 12.204c0-.787-.064-1.57-.196-2.347H12.24v4.44h6.612c-.285 1.536-1.147 2.842-2.443 3.72v3.088h3.953C22.628 19.098 24 15.9 24 12.204z"/>
        <path fill="#00A4EF" d="M12.24 24c3.315 0 6.098-1.098 8.13-2.995l-3.953-3.088c-1.1.74-2.504 1.18-4.177 1.18-3.21 0-5.93-2.17-6.9-5.086H1.258v3.192C3.276 21.366 7.495 24 12.24 24z"/>
        <path fill="#FFB900" d="M5.34 14.011A7.3 7.3 0 0 1 4.96 12a7.3 7.3 0 0 1 .38-2.011V6.797H1.258A11.993 11.993 0 0 0 0 12c0 1.933.462 3.762 1.258 5.203l4.082-3.192z"/>
        <path fill="#00A4EF" d="M12.24 4.795c1.81 0 3.434.622 4.713 1.843l3.534-3.534C18.33 1.19 15.553 0 12.24 0 7.495 0 3.276 2.634 1.258 6.797l4.082 3.192c.97-2.915 3.69-5.194 6.9-5.194z"/>
      </svg>
    ),
  },
];

export function CalendarIntegrations({ integrations }: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState<"GOOGLE" | "OUTLOOK" | null>(null);

  const connectedMap = new Map(integrations.map((i) => [i.provider, i]));

  async function handleDisconnect(provider: "GOOGLE" | "OUTLOOK") {
    setDisconnecting(provider);
    try {
      const res = await fetch("/api/calendar/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        `${provider === "GOOGLE" ? "Google Calendar" : "Outlook"} disconnected`
      );
      router.refresh();
    } catch {
      toast.error("Failed to disconnect — please try again");
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Calendar Integrations</CardTitle>
        </div>
        <CardDescription>
          Connect your calendar so sessions are automatically added and kept in
          sync when you create, reschedule, or delete them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {PROVIDERS.map(({ key, label, description, connectHref, Icon }) => {
          const connected = connectedMap.get(key);
          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border p-4 gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{label}</span>
                    {connected && (
                      <Badge
                        variant="secondary"
                        className="text-xs bg-green-50 text-green-700 border-green-200 gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {connected
                      ? `Connected ${new Date(connected.connectedAt).toLocaleDateString()}`
                      : description}
                  </p>
                </div>
              </div>

              {connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 text-xs"
                  disabled={disconnecting === key}
                  onClick={() => handleDisconnect(key)}
                >
                  {disconnecting === key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2Off className="h-3.5 w-3.5" />
                  )}
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 text-xs"
                  asChild
                >
                  <a href={connectHref}>
                    <Link2 className="h-3.5 w-3.5" />
                    Connect
                  </a>
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
