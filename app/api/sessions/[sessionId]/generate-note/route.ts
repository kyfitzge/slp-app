/**
 * POST /api/sessions/[sessionId]/generate-note
 *
 * Generates a polished session note draft from structured data:
 *   - attendance
 *   - goal performance (accuracy, trials, cueing)
 *   - free-text / voice summary
 *
 * Uses Anthropic Claude (same key as the voice notes service).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import Anthropic from "@anthropic-ai/sdk";

interface GoalData {
  name: string;
  accuracy?: number | null;
  trialsCorrect?: number | null;
  trialsTotal?: number | null;
  cueingLevel?: string | null;
}

interface AttendanceEntry {
  name: string;
  status: string;
}

interface GenerateNoteBody {
  summaryText?: string;
  attendance?: AttendanceEntry[];
  goals?: GoalData[];
  sessionDate?: string;
  sessionType?: string;
  durationMins?: number | null;
}

const CUEING_LABELS: Record<string, string> = {
  INDEPENDENT: "independent (no cues)",
  GESTURAL: "gestural cues",
  INDIRECT_VERBAL: "minimal/indirect verbal cues",
  DIRECT_VERBAL: "direct verbal cues",
  MODELING: "modeling",
  PHYSICAL: "physical guidance",
  MAXIMUM_ASSISTANCE: "maximum support",
};

function buildPrompt(body: GenerateNoteBody): string {
  const lines: string[] = [];

  if (body.sessionDate) lines.push(`Session date: ${body.sessionDate}`);
  if (body.sessionType) lines.push(`Session type: ${body.sessionType.replace(/_/g, " ").toLowerCase()}`);
  if (body.durationMins) lines.push(`Duration: ${body.durationMins} minutes`);

  if (body.attendance?.length) {
    lines.push("\nATTENDANCE:");
    for (const a of body.attendance) {
      const statusLabel = a.status
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`  - ${a.name}: ${statusLabel}`);
    }
  }

  const presentStudents = (body.attendance ?? [])
    .filter((a) => a.status === "PRESENT" || a.status === "MAKEUP")
    .map((a) => a.name);

  if (body.goals?.length) {
    lines.push("\nGOALS ADDRESSED:");
    for (const g of body.goals) {
      const parts: string[] = [`  - ${g.name}`];
      if (g.trialsCorrect != null && g.trialsTotal != null) {
        parts.push(`${g.trialsCorrect}/${g.trialsTotal} trials`);
      }
      if (g.accuracy != null) {
        parts.push(`${Math.round(g.accuracy)}% accuracy`);
      }
      if (g.cueingLevel && CUEING_LABELS[g.cueingLevel]) {
        parts.push(CUEING_LABELS[g.cueingLevel]);
      }
      lines.push(parts.join(", "));
    }
  }

  if (body.summaryText?.trim()) {
    lines.push(`\nSLP SUMMARY:\n"${body.summaryText.trim()}"`);
  }

  const dataBlock = lines.join("\n");

  return `You are a clinical documentation assistant for a school-based Speech-Language Pathologist.

Your task is to write a concise, professional session note based ONLY on the session data below.

CRITICAL RULES:
1. Write in past tense, professional clinical prose
2. ONLY use information explicitly provided — do NOT invent, infer, or elaborate beyond what is given
3. Keep it concise: 2–4 sentences, max 2 short paragraphs. School SLP notes are brief.
4. Do NOT use headers, bullet points, or markdown — plain prose only
5. If a student was absent or session was cancelled, write a brief compliant absence note instead
6. Integrate the SLP's spoken/written summary naturally if provided
7. Do not repeat raw numbers if the summary already covers them well
8. End with a brief plan if next steps can be inferred from the data

SESSION DATA:
${dataBlock}

Write the session note now. Output ONLY the note text — no preamble, no labels, no JSON.`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireUser();
    const { sessionId } = await params;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured." },
        { status: 503 }
      );
    }

    const body: GenerateNoteBody = await req.json();

    // Require at least something to work with
    const hasContent =
      body.summaryText?.trim() ||
      body.goals?.length ||
      body.attendance?.some((a) => a.status !== "PRESENT");

    if (!hasContent) {
      return NextResponse.json(
        { error: "Provide a summary, goal data, or attendance to generate a note." },
        { status: 400 }
      );
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5",
      max_tokens: 600,
      messages: [{ role: "user", content: buildPrompt(body) }],
    });

    const draftNote =
      message.content[0].type === "text" ? message.content[0].text.trim() : "";

    return NextResponse.json({ draftNote, sessionId });
  } catch (err) {
    console.error("[generate-note]", err);
    const msg = err instanceof Error ? err.message : "Failed to generate note";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
