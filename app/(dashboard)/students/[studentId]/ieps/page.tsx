import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getIEPsByStudentId } from "@/lib/queries/ieps";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IEPStatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/utils/format-date";
import { Plus, FileText } from "lucide-react";

export default async function IEPsPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  await requireUser();
  const { studentId } = await params;
  const ieps = await getIEPsByStudentId(studentId);

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button asChild size="sm">
          <Link href={`/students/${studentId}/ieps/new`}>
            <Plus className="h-4 w-4 mr-1.5" />New IEP
          </Link>
        </Button>
      </div>

      {ieps.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No IEPs yet"
          description="Create the student's first IEP to track goals and services."
          actionLabel="Create IEP"
          actionHref={`/students/${studentId}/ieps/new`}
        />
      ) : (
        <div className="space-y-3">
          {ieps.map((iep) => (
            <Card key={iep.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <IEPStatusBadge status={iep.status as never} />
                      <span className="text-sm text-muted-foreground">
                        {iep.goals.length} goal{iep.goals.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground space-x-3">
                      <span>Effective: {formatDate(iep.effectiveDate)}</span>
                      <span>Review: {formatDate(iep.reviewDate)}</span>
                      {iep.minutesPerWeek && <span>{iep.minutesPerWeek} min/week</span>}
                    </div>
                  </div>
                  <Link
                    href={`/students/${studentId}/ieps/${iep.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    View →
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
