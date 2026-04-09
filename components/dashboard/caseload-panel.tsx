"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { IEPStatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/format-date";

type FilterTab = "all" | "active" | "in_review";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  goals: { id: string }[];
  ieps: {
    id: string;
    status: string;
    reviewDate: Date | string;
    studentId: string;
  }[];
}

interface CaseloadPanelProps {
  students: Student[];
}

export function CaseloadPanel({ students }: CaseloadPanelProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const iepStatus = s.ieps[0]?.status ?? "";
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && iepStatus === "ACTIVE") ||
        (filter === "in_review" && iepStatus === "IN_REVIEW");

      const query = search.toLowerCase();
      const matchesSearch =
        !query ||
        s.firstName.toLowerCase().includes(query) ||
        s.lastName.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [students, search, filter]);

  const counts = useMemo(() => ({
    all: students.length,
    active: students.filter((s) => s.ieps[0]?.status === "ACTIVE").length,
    in_review: students.filter((s) => s.ieps[0]?.status === "IN_REVIEW").length,
  }), [students]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "in_review", label: "In Review" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              filter === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {tab.label}
            <span className={cn(
              "ml-1.5 tabular-nums",
              filter === tab.key ? "opacity-80" : "opacity-60"
            )}>
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Student list */}
      <div className="flex-1 overflow-y-auto -mx-1">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {search ? "No students match your search." : "No students on caseload."}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((student) => {
              const iep = student.ieps[0];
              const reviewDate = iep?.reviewDate ? new Date(iep.reviewDate) : null;
              const isDueSoon =
                reviewDate &&
                reviewDate.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;

              return (
                <Link
                  key={student.id}
                  href={`/students/${student.id}/overview`}
                  className="flex items-center justify-between px-1 py-2.5 hover:bg-muted/40 rounded-md transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {student.lastName}, {student.firstName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {student.goals.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {student.goals.length} goal{student.goals.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {reviewDate && (
                        <span className={cn(
                          "text-xs",
                          isDueSoon ? "text-amber-600 font-medium" : "text-muted-foreground"
                        )}>
                          · IEP {formatDate(reviewDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {iep && <IEPStatusBadge status={iep.status as never} />}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
