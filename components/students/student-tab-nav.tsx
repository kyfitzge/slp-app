"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Overview",       href: (id: string) => `/students/${id}/overview` },
  { label: "IEP",            href: (id: string) => `/students/${id}/ieps` },
  { label: "Sessions",       href: (id: string) => `/students/${id}/sessions` },
  { label: "Progress Notes", href: (id: string) => `/students/${id}/progress` },
];

export function StudentTabNav({ studentId }: { studentId: string }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-0 mt-5 border-b border-border">
      {TABS.map((tab) => {
        const href = tab.href(studentId);
        const isActive = pathname.startsWith(href);
        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              "px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors",
              isActive
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground font-normal hover:text-foreground hover:border-border"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
