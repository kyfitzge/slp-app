import Link from "next/link";
import { requireUser } from "@/lib/auth/get-user";
import { getScheduleForWeek } from "@/lib/queries/schedule";
import { getStudentsByUserId } from "@/lib/queries/students";
import { WeeklyCalendar } from "@/components/schedule/weekly-calendar";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { startOfWeek } from "date-fns";

export default async function SchedulePage() {
  const user = await requireUser();

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const [entries, students] = await Promise.all([
    getScheduleForWeek(user.id, weekStart),
    getStudentsByUserId(user.id),
  ]);

  // Build student name lookup map
  const studentMap: Record<string, string> = {};
  students.forEach((s) => {
    studentMap[s.id] = `${s.lastName}, ${s.firstName}`;
  });

  return (
    <div>
      <PageHeader
        title="Schedule"
        action={
          <Button asChild>
            <Link href="/schedule/new">
              <Plus className="h-4 w-4 mr-1.5" />New entry
            </Link>
          </Button>
        }
      />
      <WeeklyCalendar
        entries={entries as never}
        studentMap={studentMap}
        initialWeekStart={weekStart}
      />
    </div>
  );
}
