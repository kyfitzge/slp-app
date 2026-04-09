import { prisma } from "@/lib/db";
import type { StructuredNote } from "@/lib/validations/voice-note";

export async function createVoiceNote(sessionId: string, userId: string) {
  return prisma.voiceNote.create({
    data: { sessionId, userId, status: "TRANSCRIBING" },
  });
}

export async function updateVoiceNoteTranscript(
  id: string,
  rawTranscript: string
) {
  return prisma.voiceNote.update({
    where: { id },
    data: { rawTranscript, status: "TRANSCRIBED" },
  });
}

export async function updateVoiceNoteCleaned(
  id: string,
  cleanedNote: string,
  structuredData: StructuredNote
) {
  return prisma.voiceNote.update({
    where: { id },
    data: {
      cleanedNote,
      structuredData: structuredData as object,
      status: "CLEANED",
    },
  });
}

export async function setVoiceNoteError(id: string, error: string) {
  return prisma.voiceNote.update({
    where: { id },
    data: { status: "ERROR", processingError: error },
  });
}

export async function saveVoiceNoteToSession({
  voiceNoteId,
  sessionId,
  studentId,
  editedNote,
  structuredData,
  aiModel,
}: {
  voiceNoteId: string;
  sessionId: string;
  studentId?: string;
  editedNote: string;
  structuredData?: StructuredNote;
  aiModel?: string;
}) {
  return prisma.$transaction(async (tx) => {
    // Create the final SessionNote marked as AI-generated
    const note = await tx.sessionNote.create({
      data: {
        sessionId,
        studentId: studentId ?? null,
        noteText: editedNote,
        isAiGenerated: true,
        aiModel: aiModel ?? "claude-haiku-4-5",
      },
    });

    // Update the VoiceNote to SAVED and link the created note
    await tx.voiceNote.update({
      where: { id: voiceNoteId },
      data: {
        editedNote,
        structuredData: structuredData ? (structuredData as object) : undefined,
        status: "SAVED",
        savedNoteId: note.id,
      },
    });

    return note;
  });
}

export async function getVoiceNoteById(id: string) {
  return prisma.voiceNote.findUnique({ where: { id } });
}

export async function getVoiceNotesBySession(sessionId: string) {
  return prisma.voiceNote.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
  });
}
