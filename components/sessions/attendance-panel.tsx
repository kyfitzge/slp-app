"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AttendanceStatus =
  | "PRESENT"
  | "ABSENT_EXCUSED"
  | "ABSENT_UNEXCUSED"
  | "CANCELLED_SLP"
  | "CANCELLED_SCHOOL"
  | "MAKEUP";

interface StudentAttendance {
  studentId: string;
  firstName: string;
  lastName: string;
  attendance: string;
  attendanceNote?: string;
}

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT_EXCUSED", label: "Absent (E)" },
  { value: "ABSENT_UNEXCUSED", label: "Absent" },
  { value: "CANCELLED_SLP", label: "Cancelled" },
];

export function AttendancePanel({
  sessionId,
  initialStudents,
}: {
  sessionId: string;
  initialStudents: StudentAttendance[];
}) {
  const [students, setStudents] = useState(initialStudents);
  const [saving, setSaving] = useState(false);

  async function updateAttendance(studentId: string, attendance: AttendanceStatus) {
    setStudents((prev) =>
      prev.map((s) => (s.studentId === studentId ? { ...s, attendance } : s))
    );
    setSaving(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          students: [{ studentId, attendance }],
        }),
      });
      if (!res.ok) throw new Error("Failed to save attendance");
    } catch {
      toast.error("Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {students.map((student, i) => (
        <div
          key={student.studentId}
          className={cn(
            "flex items-center justify-between px-4 py-3",
            i < students.length - 1 && "border-b"
          )}
        >
          <span className="text-sm font-medium">
            {student.lastName}, {student.firstName}
          </span>
          <div className="flex gap-1">
            {ATTENDANCE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={student.attendance === opt.value ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => updateAttendance(student.studentId, opt.value)}
                disabled={saving}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
