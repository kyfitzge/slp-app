import { requireUser } from "@/lib/auth/get-user";
import { getIEPById } from "@/lib/queries/ieps";
import { getStudentById } from "@/lib/queries/students";
import { notFound } from "next/navigation";
import { getUrgencyLevel } from "@/lib/utils/format-date";
import { format } from "date-fns";
import { IEPPageClient } from "@/components/ieps/iep-page-client";

export default async function IEPPage({
  params,
}: {
  params: Promise<{ studentId: string; iepId: string }>;
}) {
  const user = await requireUser();
  if (!user) notFound();
  const { studentId, iepId } = await params;

  const [iep, student] = await Promise.all([
    getIEPById(iepId),
    getStudentById(studentId, user.id),
  ]);

  if (!iep || !student) notFound();

  const urgency = getUrgencyLevel(iep.reviewDate);
  const studentName = `${student.firstName} ${student.lastName}`;

  return (
    <IEPPageClient
      studentId={studentId}
      iepId={iepId}
      studentName={studentName}
      urgency={urgency}
      iep={{
        status: iep.status,
        effectiveDate: format(new Date(iep.effectiveDate), "yyyy-MM-dd"),
        reviewDate: format(new Date(iep.reviewDate), "yyyy-MM-dd"),
        expirationDate: format(new Date(iep.expirationDate), "yyyy-MM-dd"),
        meetingDate: iep.meetingDate ? format(new Date(iep.meetingDate), "yyyy-MM-dd") : undefined,
        nextEvalDate: iep.nextEvalDate ? format(new Date(iep.nextEvalDate), "yyyy-MM-dd") : undefined,
        minutesPerWeek: iep.minutesPerWeek ?? undefined,
        groupMinutes: iep.groupMinutes ?? undefined,
        individualMinutes: iep.individualMinutes ?? undefined,
        serviceLocation: iep.serviceLocation ?? undefined,
        presentLevels: iep.presentLevels ?? undefined,
        parentConcerns: iep.parentConcerns ?? undefined,
        transitionNotes: iep.transitionNotes ?? undefined,
        goals: iep.goals.map((g) => ({
          id: g.id,
          shortName: g.shortName,
          goalText: g.goalText,
          domain: g.domain,
          status: g.status,
          targetAccuracy: g.targetAccuracy,
          dataPoints: g.dataPoints.map((dp) => ({ accuracy: dp.accuracy })),
        })),
      }}
    />
  );
}
