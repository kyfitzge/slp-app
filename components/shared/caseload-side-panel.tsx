"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { IEPStatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/format-date";

type FilterTab = "all" | "active" | "in_review";

export interface CaseloadStudent {
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

interface Props {
  students: CaseloadStudent[];
  /** Currently selected student id. Pass null / undefined for "all". */
  selectedId?: string | null;
  /** Called when a student row is clicked. Only used in non-draggable mode. */
  onSelect?: (id: string) => void;
  /**
   * When true, each row renders a drag handle and fires dataTransfer events
   * so students can be dragged onto the calendar. The row itself links to the
   * student overview page instead of firing onSelect.
   */
  draggable?: boolean;
  /** Optional per-student extra text shown on the second line (e.g. "3 reports"). */
  getStudentMeta?: (studentId: string) => string | null;
}

export function CaseloadSidePanel({
  students,
  selectedId,
  onSelect,
  draggable = false,
  getStudentMeta,
}: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const iepStatus = s.ieps[0]?.status ?? "";
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && iepStatus === "ACTIVE") ||
        (filter === "in_review" && iepStatus === "IN_REVIEW");
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [students, search, filter]);

  const counts = useMemo(
    () => ({
      all: students.length,
      active: students.filter((s) => s.ieps[0]?.status === "ACTIVE").length,
      in_review: students.filter((s) => s.ieps[0]?.status === "IN_REVIEW").length,
    }),
    [students]
  );

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "in_review", label: "In Review" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-3 shrink-0">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3 shrink-0">
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
            <span
              className={cn(
                "ml-1.5 tabular-nums",
                filter === tab.key ? "opacity-80" : "opacity-60"
              )}
            >
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
              const isSelected = selectedId === student.id;
              const meta = getStudentMeta?.(student.id);

              const innerContent = (
                <div className="flex flex-1 items-center justify-between min-w-0">
                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "text-sm font-medium truncate block",
                        isSelected && (!draggable || !!onSelect) ? "text-primary" : "text-foreground"
                      )}
                    >
                      {student.lastName}, {student.firstName}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {student.goals.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {student.goals.length} goal{student.goals.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {reviewDate && (
                        <span
                          className={cn(
                            "text-xs",
                            isDueSoon ? "text-amber-600 font-medium" : "text-muted-foreground"
                          )}
                        >
                          · IEP {formatDate(reviewDate)}
                        </span>
                      )}
                      {meta && (
                        <span className="text-xs text-muted-foreground">· {meta}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {iep && <IEPStatusBadge status={iep.status as never} />}
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 transition-colors",
                        isSelected && (!draggable || !!onSelect)
                          ? "text-primary"
                          : "text-muted-foreground/40 group-hover:text-muted-foreground"
                      )}
                    />
                  </div>
                </div>
              );

              if (draggable && onSelect) {
                // Combined mode: draggable button that also fires onSelect on click
                return (
                  <button
                    key={student.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({
                          studentId: student.id,
                          studentName: `${student.firstName} ${student.lastName}`,
                        })
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onSelect(student.id)}
                    className={cn(
                      "group w-full flex items-center px-2 py-2.5 rounded-md transition-colors text-left cursor-grab active:cursor-grabbing",
                      isSelected ? "bg-primary/10" : "hover:bg-muted/40"
                    )}
                  >
                    {innerContent}
                  </button>
                );
              }

              if (draggable) {
                return (
                  <div
                    key={student.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({
                          studentId: student.id,
                          studentName: `${student.firstName} ${student.lastName}`,
                        })
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="group w-full flex items-center cursor-grab active:cursor-grabbing"
                  >
                    <Link
                      href={`/students/${student.id}/overview`}
                      draggable={false}
                      onClick={(e) => e.stopPropagation()}
                      className="flex flex-1 items-center px-2 py-2.5 hover:bg-muted/40 rounded-md transition-colors min-w-0"
                    >
                      {innerContent}
                    </Link>
                  </div>
                );
              }

              return (
                <button
                  key={student.id}
                  onClick={() => onSelect?.(student.id)}
                  className={cn(
                    "group w-full flex items-center px-2 py-2.5 rounded-md transition-colors text-left",
                    isSelected
                      ? "bg-primary/10"
                      : "hover:bg-muted/40"
                  )}
                >
                  {innerContent}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
