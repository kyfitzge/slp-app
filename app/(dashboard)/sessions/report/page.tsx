import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getStudentsByUserId } from "@/lib/queries/students";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ReportBuilder } from "@/components/sessions/report-builder";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Session Report" };

export default async function SessionReportPage() {
  const user = await requireUser();
  const allStudents = await getStudentsByUserId(user!.id);

  const students = allStudents.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
  }));

  return (
    <div>
      <PageHeader
        title="Session Report"
        description="Generate a clinical report for a student over a selected time period."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/sessions">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Back to sessions
            </Link>
          </Button>
        }
      />
      <ReportBuilder students={students} />
    </div>
  );
}
