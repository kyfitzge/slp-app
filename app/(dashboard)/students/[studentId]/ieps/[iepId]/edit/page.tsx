import { requireUser } from "@/lib/auth/get-user";
import { getIEPById } from "@/lib/queries/ieps";
import { notFound } from "next/navigation";
import { IEPForm } from "@/components/ieps/iep-form";
import { format } from "date-fns";

export default async function EditIEPPage({
  params,
}: {
  params: Promise<{ studentId: string; iepId: string }>;
}) {
  await requireUser();
  const { studentId, iepId } = await params;
  const iep = await getIEPById(iepId);
  if (!iep) notFound();

  const defaultValues = {
    studentId,
    status: iep.status as never,
    effectiveDate: format(new Date(iep.effectiveDate), "yyyy-MM-dd"),
    reviewDate: format(new Date(iep.reviewDate), "yyyy-MM-dd"),
    expirationDate: format(new Date(iep.expirationDate), "yyyy-MM-dd"),
    meetingDate: iep.meetingDate
      ? format(new Date(iep.meetingDate), "yyyy-MM-dd")
      : undefined,
    nextEvalDate: iep.nextEvalDate
      ? format(new Date(iep.nextEvalDate), "yyyy-MM-dd")
      : undefined,
    minutesPerWeek: iep.minutesPerWeek ?? undefined,
    groupMinutes: iep.groupMinutes ?? undefined,
    individualMinutes: iep.individualMinutes ?? undefined,
    serviceLocation: iep.serviceLocation ?? undefined,
    presentLevels: iep.presentLevels ?? undefined,
    parentConcerns: iep.parentConcerns ?? undefined,
    transitionNotes: iep.transitionNotes ?? undefined,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Edit IEP</h2>
        <p className="text-sm text-muted-foreground">
          Effective {format(new Date(iep.effectiveDate), "MMM d, yyyy")}
        </p>
      </div>
      <IEPForm studentId={studentId} iepId={iepId} defaultValues={defaultValues} />
    </div>
  );
}
