"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const LABELS: Record<string, string> = {
  google: "Google Calendar",
  outlook: "Microsoft Outlook",
};

export function CalendarConnectToast({
  connected,
  error,
}: {
  connected?: string;
  error?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (connected) {
      const label = LABELS[connected] ?? connected;
      toast.success(`${label} connected successfully`);
    } else if (error) {
      const label = LABELS[error] ?? error;
      toast.error(`Failed to connect ${label} — please try again`);
    }

    // Clean the query params from the URL without a navigation
    const url = new URL(window.location.href);
    url.searchParams.delete("calendar_connected");
    url.searchParams.delete("calendar_error");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
