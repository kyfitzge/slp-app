import { redirect } from "next/navigation";

export default async function StudentRootPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  redirect(`/students/${studentId}/overview`);
}
