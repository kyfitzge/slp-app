import { requireUser } from "@/lib/auth/get-user";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6 max-w-2xl">
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
    </div>
  );
}
