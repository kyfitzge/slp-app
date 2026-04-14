import { requireUser } from "@/lib/auth/get-user";
import { getStudentById } from "@/lib/queries/students";
import { notFound } from "next/navigation";

export default async function StudentProgressPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await requireUser();
  const { studentId } = await params;

  const student = await getStudentById(studentId, user.id);

  if (!student) notFound();

  return <div />;
}
