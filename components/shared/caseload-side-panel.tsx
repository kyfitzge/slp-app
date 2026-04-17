"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function isIEPDueSoon(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const diff = new Date(date).getTime() - Date.now();
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
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
      <div className="relative mb-2 shrink-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-2 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors border",
              filter === tab.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:bg-sidebar-accent"
            )}
          >
            {tab.label}
            <span className="ml-1 tabular-nums opacity-70">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Student list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">
            {search ? "No students match your search." : "No students on caseload."}
          </div>
        ) : (
          filtered.map((student) => {
            const iep = student.ieps[0];
            const reviewDate = iep?.reviewDate ? new Date(iep.reviewDate) : null;
            const dueSoon = isIEPDueSoon(reviewDate);
            const isSelected = selectedId === student.id;
            const meta = getStudentMeta?.(student.id);
            const initials = getInitials(student.firstName, student.lastName);

            const innerContent = (
              <>
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                )}>
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-xs font-medium truncate", isSelected ? "text-primary" : "text-foreground")}>
                      {student.firstName} {student.lastName}
                    </span>
                    {dueSoon && (
                      <span className="shrink-0 inline-block w-1.5 h-1.5 rounded-full bg-amber-500" title="IEP review due soon" />
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate block">
                    {student.goals.length > 0 && `${student.goals.length} goal${student.goals.length !== 1 ? "s" : ""}`}
                    {reviewDate && (
                      <>
                        {student.goals.length > 0 ? " · " : ""}
                        <span className={dueSoon ? "text-amber-600 font-medium" : ""}>
                          IEP {formatDate(reviewDate)}
                        </span>
                      </>
                    )}
                    {meta && ` · ${meta}`}
                  </span>
                </div>
              </>
            );

            const itemClass = cn(
              "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-2",
              isSelected
                ? "bg-primary/10 border-primary"
                : "border-transparent hover:bg-sidebar-accent"
            );

            if (draggable && onSelect) {
              return (
                <button
                  key={student.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/json",
                      JSON.stringify({ studentId: student.id, studentName: `${student.firstName} ${student.lastName}` })
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onSelect(student.id)}
                  className={cn(itemClass, "cursor-grab active:cursor-grabbing")}
                >
                  {innerContent}
                </button>
              );
            }

            if (draggable) {
              return (
                <div key={student.id} draggable onDragStart={(e) => {
                  e.dataTransfer.setData("application/json", JSON.stringify({ studentId: student.id, studentName: `${student.firstName} ${student.lastName}` }));
                  e.dataTransfer.effectAllowed = "copy";
                }} className="cursor-grab active:cursor-grabbing">
                  <Link
                    href={`/students/${student.id}/overview`}
                    draggable={false}
                    onClick={(e) => e.stopPropagation()}
                    className={cn("flex items-center gap-3", itemClass)}
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
                className={itemClass}
              >
                {innerContent}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
