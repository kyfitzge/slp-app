import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getStudentsByUserId } from "@/lib/queries/students";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { IEPStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus } from "lucide-react";
import { formatDate, getUrgencyLevel } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils";

const GRADE_LABELS: Record<string, string> = {
  PRE_K: "Pre-K", KINDERGARTEN: "K",
  GRADE_1: "1st", GRADE_2: "2nd", GRADE_3: "3rd", GRADE_4: "4th",
  GRADE_5: "5th", GRADE_6: "6th", GRADE_7: "7th", GRADE_8: "8th",
  GRADE_9: "9th", GRADE_10: "10th", GRADE_11: "11th", GRADE_12: "12th",
};

export default async function StudentsPage() {
  const user = await requireUser();
  const students = await getStudentsByUserId(user.id);

  return (
    <div>
      <PageHeader
        title="Caseload"
        description={`${students.length} student${students.length !== 1 ? "s" : ""} on your caseload`}
        action={
          <Button asChild>
            <Link href="/students/new">
              <Plus className="h-4 w-4 mr-1.5" />
              Add student
            </Link>
          </Button>
        }
      />

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Add your first student to get started managing your caseload."
          actionLabel="Add student"
          actionHref="/students/new"
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Student</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">School / Grade</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">IEP</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Goals</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Review date</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const activeIEP = student.ieps[0];
                const urgency = activeIEP ? getUrgencyLevel(activeIEP.reviewDate) : null;
                return (
                  <tr
                    key={student.id}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/students/${student.id}/overview`}
                        className="font-medium hover:underline"
                      >
                        {student.lastName}, {student.firstName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {student.schoolName}
                      {student.gradeLevel && (
                        <span className="ml-1.5 text-xs">
                          ({GRADE_LABELS[student.gradeLevel] ?? student.gradeLevel})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {activeIEP ? (
                        <IEPStatusBadge status={activeIEP.status as never} />
                      ) : (
                        <span className="text-muted-foreground text-xs">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {student.goals.length > 0 ? (
                        <Badge variant="secondary">{student.goals.length} active</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {activeIEP ? (
                        <span
                          className={cn(
                            "text-sm",
                            urgency === "overdue" && "text-red-600 font-medium",
                            urgency === "urgent" && "text-amber-600 font-medium",
                            urgency === "soon" && "text-amber-500"
                          )}
                        >
                          {formatDate(activeIEP.reviewDate)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
