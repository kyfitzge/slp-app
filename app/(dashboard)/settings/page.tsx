import { requireUser } from "@/lib/auth/get-user";
import { ProfileForm } from "@/components/settings/profile-form";
import { CalendarIntegrations } from "@/components/settings/calendar-integrations";
import { CalendarConnectToast } from "@/components/settings/calendar-connect-toast";
import { getCalendarIntegrations } from "@/lib/services/calendar-sync";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar_connected?: string; calendar_error?: string }>;
}) {
  const user = await requireUser();
  const { calendar_connected, calendar_error } = await searchParams;

  const integrations = await getCalendarIntegrations(user.id);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Show toast when returning from OAuth flow */}
      {(calendar_connected || calendar_error) && (
        <CalendarConnectToast
          connected={calendar_connected}
          error={calendar_error}
        />
      )}

      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your profile and account preferences.
        </p>
      </div>

      <ProfileForm
        userId={user.id}
        defaultValues={{
          firstName: user.firstName,
          lastName: user.lastName,
          credentials: user.credentials ?? "",
          schoolDistrict: user.schoolDistrict ?? "",
          licenseNumber: user.licenseNumber ?? "",
          phone: user.phone ?? "",
        }}
      />

      <CalendarIntegrations integrations={integrations} />
    </div>
  );
}
