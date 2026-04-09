import { requireUser } from "@/lib/auth/get-user";
import { getSessionById } from "@/lib/queries/sessions";
import { getVoiceNotesBySession } from "@/lib/queries/voice-notes";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SessionNotePage } from "@/components/sessions/session-note-page";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await requireUser();
  const { sessionId } = await params;
  const [session, voiceNotes] = await Promise.all([
    getSessionById(sessionId, user.id),
    getVoiceNotesBySession(sessionId),
  ]);
  if (!session) notFound();

  // Reconstruct summary context from all saved transcripts (oldest first)
  const initialSummaryContext = [...voiceNotes]
    .reverse()
    .filter((vn) => vn.rawTranscript)
    .map((vn) => vn.rawTranscript!)
    .join(" ")
    .trim();

  // Build initialGoalData — last data point per goal wins (ordered asc)
  const initialGoalData: Record<
    string,
    { accuracy: number; trialsCorrect?: number; trialsTotal?: number; cueingLevel?: string }
  > = {};

  for (const dp of session.dataPoints) {
    initialGoalData[dp.goalId] = {
      accuracy: dp.accuracy,
      trialsCorrect: (dp as any).trialsCorrect ?? undefined,
      trialsTotal: (dp as any).trialsTotal ?? undefined,
      cueingLevel: (dp as any).cueingLevel ?? undefined,
    };
  }

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/sessions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        All sessions
      </Link>

      {/* New two-column documentation page */}
      <SessionNotePage
        sessionId={sessionId}
        sessionDate={session.sessionDate}
        startTime={session.startTime}
        sessionType={session.sessionType}
        durationMins={session.durationMins}
        location={session.location}
        students={session.sessionStudents.map((ss) => ({
          id: ss.student.id,
          firstName: ss.student.firstName,
          lastName: ss.student.lastName,
          attendance: ss.attendance as
            | "PRESENT"
            | "ABSENT_EXCUSED"
            | "ABSENT_UNEXCUSED"
            | "CANCELLED_SLP"
            | "CANCELLED_SCHOOL"
            | "MAKEUP",
          goals: ss.student.goals.map((g) => ({
            id: g.id,
            shortName: g.shortName,
            goalText: g.goalText,
            domain: g.domain,
          })),
        }))}
        initialNote={session.notes.find((n) => !n.studentId)?.noteText ?? ""}
        initialGoalData={initialGoalData}
        initialSummaryContext={initialSummaryContext}
      />
    </div>
  );
}
