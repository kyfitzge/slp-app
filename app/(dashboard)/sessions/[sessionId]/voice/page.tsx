import { requireUser } from "@/lib/auth/get-user";
import { getSessionById } from "@/lib/queries/sessions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VoiceNotePanel } from "@/components/voice/voice-note-panel";
import { formatDate } from "@/lib/utils/format-date";

export default async function VoiceNotePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await requireUser();
  const { sessionId } = await params;
  const session = await getSessionById(sessionId, user.id);
  if (!session) notFound();

  // Build context for the LLM — use first student if single-student session
  const firstStudent = session.sessionStudents[0]?.student;
  const sessionContext = {
    studentFirstName: firstStudent?.firstName,
    sessionType: session.sessionType,
    sessionDate: session.sessionDate.toISOString().split("T")[0],
    activeGoals: firstStudent?.goals.map((g) => g.shortName ?? g.goalText) ?? [],
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back link */}
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/sessions/${sessionId}`}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to session
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Mic className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Voice documentation</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(session.sessionDate)}
            {firstStudent && (
              <> · {firstStudent.firstName} {firstStudent.lastName}</>
            )}
            {session.sessionStudents.length > 1 && (
              <> · {session.sessionStudents.length} students</>
            )}
          </p>
        </div>
      </div>

      {/* Voice note panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Record or upload</CardTitle>
        </CardHeader>
        <CardContent>
          <VoiceNotePanel
            sessionId={sessionId}
            studentId={firstStudent?.id}
            sessionContext={sessionContext}
          />
        </CardContent>
      </Card>

      {/* How it works */}
      <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
        <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
          How it works
        </p>
        <ol className="space-y-1.5 text-muted-foreground list-decimal list-inside">
          <li>Record a voice memo or upload an audio file from your session.</li>
          <li>
            The audio is transcribed automatically using Whisper speech recognition.
          </li>
          <li>
            Claude reviews the transcript and extracts goal data, accuracy, cueing
            levels, and other clinical details.
          </li>
          <li>
            You review and edit the AI-generated draft before it is saved to the
            student record.
          </li>
        </ol>
        <p className="text-xs text-muted-foreground pt-1">
          Only information spoken in the recording is included. Uncertainty flags
          highlight anything the AI could not determine with confidence.
        </p>
      </div>
    </div>
  );
}
