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
  const presentStudents = (body.attendance ?? [])
    .filter((a) => a.status === "PRESENT" || a.status === "MAKEUP")
    .map((a) => a.name);

  const absentStudents = (body.attendance ?? [])
    .filter((a) => a.status !== "PRESENT" && a.status !== "MAKEUP")
    .map((a) => a.name);

  const lines: string[] = [];

  if (body.sessionDate) lines.push(`Date: ${body.sessionDate}`);
  if (body.sessionType) {
    const typeLabel = body.sessionType
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    lines.push(`Session type: ${typeLabel}`);
  }
  if (body.durationMins) lines.push(`Duration: ${body.durationMins} minutes`);
  if (presentStudents.length) lines.push(`Student(s) present: ${presentStudents.join(", ")}`);
  if (absentStudents.length) lines.push(`Student(s) absent: ${absentStudents.join(", ")}`);

  if (body.goals?.length) {
    lines.push("\nACTIVE IEP GOALS (with available performance data):");
    for (const g of body.goals) {
      const parts: string[] = [`  • ${g.name}`];
      if (g.trialsCorrect != null && g.trialsTotal != null) {
        parts.push(`${g.trialsCorrect}/${g.trialsTotal} trials`);
      }
      if (g.accuracy != null) {
        parts.push(`${Math.round(g.accuracy)}% accuracy`);
      }
      if (g.cueingLevel && CUEING_LABELS[g.cueingLevel]) {
        parts.push(CUEING_LABELS[g.cueingLevel]);
      }
      lines.push(parts.join(" — "));
    }
  }

  if (body.summaryText?.trim()) {
    lines.push(`\nSLP'S RAW SESSION RECAP:\n"${body.summaryText.trim()}"`);
  }

  const dataBlock = lines.join("\n");

  // Absence-only path
  if (absentStudents.length > 0 && presentStudents.length === 0) {
    return `You are a clinical documentation assistant for a school-based SLP.

Write a brief, compliant session absence note (1–2 sentences, past tense, professional).

SESSION DATA:
${dataBlock}

Output ONLY the note text.`;
  }

  return `You are a documentation specialist for a school-based Speech-Language Pathologist (SLP).

Your task: transform the SLP's raw session recap into a polished, professional clinical session note suitable for IEP documentation.

═══ SESSION DATA ═══
${dataBlock}

═══ INSTRUCTIONS ═══

The SLP's raw recap is your primary source. Extract every clinically meaningful detail and rewrite it as a professional note.

TRANSFORMATION RULES:
1. Normalize informal language to standard clinical terminology:
   — "needed a lot of help" / "had to give lots of cues" → "maximal verbal cues" or "direct verbal cues with modeling"
   — "did great" / "nailed it" (no numbers) → "demonstrated emerging accuracy" or "responded well to treatment"
   — "his usual sounds" / "her goals" → reference the listed IEP goals by name
   — "a few tries" / "most of the time" → use conservatively (e.g., "majority of attempts" or "inconsistent accuracy")
   — "we did ___" → "[Student name] practiced ___ through [activity description]"
2. Use any structured goal data (accuracy %, trials, cueing level) to ground performance descriptions — do not repeat numbers verbatim if the recap already describes them well
3. Infer reasonable clinical details from informal descriptions (e.g., "used flashcards" → "structured drill using picture stimuli")
4. Do NOT fabricate specific numbers that are not present in the data or recap
5. Use the student's first name throughout — not "the student"
6. Include a brief plan statement if next steps are mentioned or clearly implied

NOTE FORMAT — 2–4 paragraphs of narrative prose:
  Paragraph 1 — Session overview: who was seen, session type and duration, goals or skill areas addressed, activities and tasks used
  Paragraph 2 — Performance: accuracy, trials, or qualitative description; cueing level and student's response to cues
  Paragraph 3 (if warranted) — Participation, engagement, behavioral observations, or notable clinical observations
  Closing sentence — Plan for next session (if inferable)

STYLE RULES:
  — Past tense throughout
  — No headers, bullets, or markdown — plain prose only
  — Professional, objective, clinically appropriate — no filler, no AI-sounding phrases
  — Every sentence should carry clinical value
  — Read like something an experienced SLP would actually write

Output ONLY the note text — no preamble, no labels, no JSON.`;
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
      max_tokens: 900,
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
