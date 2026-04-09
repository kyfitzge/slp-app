"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

function useBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const labels: Record<string, string> = {
    dashboard: "Dashboard",
    students: "Students",
    schedule: "Schedule",
    sessions: "Sessions",
    settings: "Settings",
    new: "New",
    edit: "Edit",
    overview: "Overview",
    ieps: "IEPs",
    goals: "Goals",
    progress: "Progress Notes",
  };

  return segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = /^c[a-z0-9]{24,}$/i.test(seg)
      ? "Details"
      : (labels[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1));
    return { href, label };
  });
}

export function TopHeader() {
  const breadcrumbs = useBreadcrumbs();

  return (
    <header className="flex h-12 items-center border-b border-border bg-card px-6">
      <nav className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
            )}
            {i === breadcrumbs.length - 1 ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </header>
  );
}
