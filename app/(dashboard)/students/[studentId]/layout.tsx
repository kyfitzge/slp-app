import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getStudentById } from "@/lib/queries/students";
import { notFound } from "next/navigation";
import { StudentTabNav } from "@/components/students/student-tab-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Pencil } from "lucide-react";
import { IEPStatusBadge } from "@/components/shared/status-badge";
import { getUrgencyLevel } from "@/lib/utils/format-date";

export default async function StudentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ studentId: string }>;
}) {
  const user = await requireUser();
  const { studentId } = await params;
  const student = await getStudentById(studentId, user.id);
  if (!student) notFound();

  const gradeLabel: Record<string, string> = {
    PRE_K: "Pre-K", KINDERGARTEN: "K",
    GRADE_1: "1st", GRADE_2: "2nd", GRADE_3: "3rd",
    GRADE_4: "4th", GRADE_5: "5th", GRADE_6: "6th",
    GRADE_7: "7th", GRADE_8: "8th", GRADE_9: "9th",
    GRADE_10: "10th", GRADE_11: "11th", GRADE_12: "12th",
  };

  const activeIEP = student.ieps.find((i) => i.status === "ACTIVE" || i.status === "IN_REVIEW");
  const urgency = activeIEP ? getUrgencyLevel(activeIEP.reviewDate) : null;
  const activeGoalCount = student.goals.filter((g) => g.status === "ACTIVE").length;

  return (
    <div>
      {/* Student header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          {/* Left: name + meta */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold">
                {student.firstName} {student.lastName}
              </h1>
              {activeIEP && (
                <IEPStatusBadge status={activeIEP.status as never} />
              )}
              {(urgency === "overdue" || urgency === "urgent") && (
                <Badge variant="destructive" className="text-xs">
                  IEP Review Due
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {student.schoolName}
              {student.gradeLevel && ` · ${gradeLabel[student.gradeLevel] ?? student.gradeLevel} grade`}
              {activeGoalCount > 0 && ` · ${activeGoalCount} active goal${activeGoalCount !== 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Right: quick actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeIEP && (
              <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                <Link href={`/students/${studentId}/ieps/${activeIEP.id}`}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  IEP
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
              <Link href={`/students/${studentId}/edit`}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Link>
            </Button>
          </div>
        </div>

        <StudentTabNav studentId={studentId} />
      </div>
      {children}
    </div>
  );
}
