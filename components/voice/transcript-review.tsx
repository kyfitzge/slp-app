"use client";

/**
 * TranscriptReview
 *
 * Displays the raw transcript alongside the AI-cleaned note and structured
 * data fields. Lets the SLP edit the note before saving.
 *
 * Uncertainty flags are highlighted so the clinician can address gaps.
 */

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Bot, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { StructuredNote } from "@/lib/validations/voice-note";

const CUEING_LABELS: Record<string, string> = {
  INDEPENDENT: "Independent",
  GESTURAL: "Gestural",
  INDIRECT_VERBAL: "Indirect verbal",
  DIRECT_VERBAL: "Direct verbal",
  MODELING: "Modeling",
  PHYSICAL: "Physical",
  MAXIMUM_ASSISTANCE: "Max assist",
};

interface TranscriptReviewProps {
  voiceNoteId: string;
  sessionId: string;
  studentId?: string;
  rawTranscript: string;
  cleanedNote: string;
  structuredData: StructuredNote;
  onSaved: (noteId: string) => void;
}

export function TranscriptReview({
  voiceNoteId,
  sessionId,
  studentId,
  rawTranscript,
  cleanedNote,
  structuredData,
  onSaved,
}: TranscriptReviewProps) {
  const [editedNote, setEditedNote] = useState(cleanedNote);
  const [showRaw, setShowRaw] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!editedNote.trim()) {
      toast.error("Note cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/voice-notes/${voiceNoteId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          studentId,
          editedNote: editedNote.trim(),
          structuredData,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save note");
      toast.success("Note saved to session");
      onSaved(json.note.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* AI badge disclaimer */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
        <Bot className="h-3.5 w-3.5 shrink-0" />
        <span>
          AI-generated draft — review and edit before saving. Only information
          from the transcript is included; uncertainty flags mark unclear items.
        </span>
      </div>

      {/* Uncertainty flags */}
      {structuredData.uncertaintyFlags.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                  Items needing review
                </p>
                <ul className="space-y-0.5">
                  {structuredData.uncertaintyFlags.map((flag, i) => (
                    <li key={i} className="text-xs text-yellow-700 dark:text-yellow-300">
                      · {flag}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Editable note */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Session note draft</label>
          <Badge variant="secondary" className="text-xs gap-1">
            <Bot className="h-3 w-3" />
            AI-generated
          </Badge>
        </div>
        <Textarea
          value={editedNote}
          onChange={(e) => setEditedNote(e.target.value)}
          rows={8}
          className="font-sans text-sm resize-y"
          placeholder="Session note…"
        />
        <p className="text-xs text-muted-foreground">
          Edit freely — this is your note. Only the final text you save will appear
          in the student record.
        </p>
      </div>

      {/* Structured data panel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Extracted clinical data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* Goals */}
          {structuredData.goalsAddressed.length > 0 ? (
            <div className="space-y-2">
              {structuredData.goalsAddressed.map((g, i) => (
                <div key={i} className="rounded-md border px-3 py-2 bg-muted/30">
                  <p className="font-medium text-xs mb-1">{g.shortDescription}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {g.accuracyPercent != null && (
                      <span>Accuracy: <strong className="text-foreground">{g.accuracyPercent}%</strong></span>
                    )}
                    {g.cueingLevel && (
                      <span>Cueing: <strong className="text-foreground">{CUEING_LABELS[g.cueingLevel] ?? g.cueingLevel}</strong></span>
                    )}
                    {g.trialsCorrect != null && g.trialsTotal != null && (
                      <span>Trials: <strong className="text-foreground">{g.trialsCorrect}/{g.trialsTotal}</strong></span>
                    )}
                    {g.notes && <span className="italic">{g.notes}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No specific goal data extracted from transcript
            </p>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
            {structuredData.participation && (
              <>
                <span className="text-muted-foreground">Participation</span>
                <span className="capitalize">{structuredData.participation}</span>
              </>
            )}
            {structuredData.sessionDurationMins && (
              <>
                <span className="text-muted-foreground">Duration</span>
                <span>{structuredData.sessionDurationMins} min</span>
              </>
            )}
            {structuredData.materials && (
              <>
                <span className="text-muted-foreground">Materials</span>
                <span>{structuredData.materials}</span>
              </>
            )}
            {structuredData.nextStepPlan && (
              <>
                <span className="text-muted-foreground">Next step</span>
                <span>{structuredData.nextStepPlan}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Raw transcript (collapsible) */}
      <div className="border rounded-md overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
          onClick={() => setShowRaw((v) => !v)}
        >
          <span>Raw transcript</span>
          {showRaw ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showRaw && (
          <div className="px-3 pb-3 pt-1 text-xs text-muted-foreground whitespace-pre-wrap border-t bg-muted/20">
            {rawTranscript}
          </div>
        )}
      </div>

      {/* Save action */}
      <div className="flex gap-3 pt-1">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? (
            "Saving…"
          ) : (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Save note to session
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
