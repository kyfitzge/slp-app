"use client";

import { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface SessionNotePanelProps {
  sessionId: string;
  initialNote: string;
  studentId?: string;
}

export function SessionNotePanel({
  sessionId,
  initialNote,
  studentId,
}: SessionNotePanelProps) {
  const [note, setNote] = useState(initialNote);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function saveNote(text: string) {
    if (!text.trim()) return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteText: text, studentId }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      toast.error("Failed to save note");
      setStatus("idle");
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setNote(value);
    setStatus("idle");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveNote(value), 1500);
  }

  return (
    <div className="space-y-1.5">
      <Textarea
        value={note}
        onChange={handleChange}
        placeholder="Write session notes here… (auto-saves)"
        rows={5}
        className="resize-none"
      />
      <div className="text-xs text-muted-foreground text-right h-4">
        {status === "saving" && "Saving…"}
        {status === "saved" && "Saved ✓"}
      </div>
    </div>
  );
}
