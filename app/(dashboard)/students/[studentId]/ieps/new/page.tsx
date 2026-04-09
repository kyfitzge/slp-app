import { requireUser } from "@/lib/auth/get-user";
import { IEPForm } from "@/components/ieps/iep-form";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "New IEP" };

export default async function NewIEPPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  await requireUser();
  const { studentId } = await params;
  return (
    <div>
      <PageHeader title="Create IEP" description="Add an IEP record for this student." />
      <IEPForm studentId={studentId} />
    </div>
  );
}
