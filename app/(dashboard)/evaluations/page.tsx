import { requireUser } from "@/lib/auth/get-user";
import { prisma } from "@/lib/db";
import { EvaluationsPage } from "@/components/evaluations/evaluations-page";

export const metadata = { title: "Evaluations" };

export default async function Page() {
  const user = await requireUser();

  const students = await prisma.caseload.findMany({
    where: { userId: user.id, removedAt: null, student: { isActive: true } },
    orderBy: [
      { student: { lastName: "asc" } },
      { student: { firstName: "asc" } },
    ],
    select: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          gradeLevel: true,
          schoolName: true,
          disabilityCategory: true,
          reevaluationDue: true,
        },
      },
    },
  });

  const templates = await prisma.evaluationTemplate.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, fileName: true, createdAt: true },
  });

  return (
    <EvaluationsPage
      students={students.map((c) => c.student)}
      initialTemplates={templates}
    />
  );
}
