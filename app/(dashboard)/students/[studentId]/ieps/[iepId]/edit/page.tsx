import { redirect } from "next/navigation";

// The IEP detail page is now directly editable — no separate edit route needed.
export default async function EditIEPRedirect({
  params,
}: {
  params: Promise<{ studentId: string; iepId: string }>;
}) {
  const { studentId, iepId } = await params;
  redirect(`/students/${studentId}/ieps/${iepId}`);
}
