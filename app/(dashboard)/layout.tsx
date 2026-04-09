import { requireUser } from "@/lib/auth/get-user";
import { Sidebar } from "@/components/layout/sidebar";
import { TopHeader } from "@/components/layout/top-header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const userInitials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  const userName = `${user.firstName} ${user.lastName}`;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar userInitials={userInitials} userName={userName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopHeader />
        <main className="flex-1 overflow-y-auto px-8 py-7 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
