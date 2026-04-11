/**
 * POST /api/sessions/[sessionId]/extract-data
 *
 * Uses Claude to extract structured clinical data from a free-text voice
 * transcript, returning per-goal accuracy / trials / cueing level as well as
 * session-level duration and participation.
 *
 * This is intentionally non-blocking — if it fails the UI degrades gracefully
 * back to the regex-based extraction already present on the client.
 *
 * Body (JSON):
 *   transcript : string
 *   goals      : Array<{ id: string; name: string; domain: string }>
 *
 * Response (JSON):
 *   extractions  : Record<goalId, { accuracy, trialsCorrect, trialsTotal, cueingLevel }>
 *   duration     : number | null
 *   participation: "excellent" | "good" | "fair" | "poor" | null
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import Anthropic from "@anthropic-ai/sdk";

const VALID_CUEING = [
  "INDEPENDENT",
  "GESTURAL",
  "INDIRECT_VERBAL",
  "DIRECT_VERBAL",
  "MODELING",
  "PHYSICAL",
  "MAXIMUM_ASSISTANCE",
] as const;

function buildPrompt(transcript: string, goals: { id: string; name: string; domain: string }[]) {
  const goalList = goals
    .map((g) => `  - id: "${g.id}", name: "${g.name}", domain: ${g.domain}`)
    .join("\n");

  return `You are a clinical documentation assistant for a school-based speech-language pathologist.

Extract structured data from the session text below. The text may be a raw voice transcript, a polished clinical note, or both — extract from whichever contains the most detail.

GOALS WORKED ON THIS SESSION:
${goalList}

SESSION TEXT:
"${transcript}"

Return ONLY a JSON object in exactly this shape — no markdown, no explanation:
{
  "goals": [
    {
      "goalId": "<id from the list above>",
      "accuracy": <integer 0–100 or null>,
      "trialsCorrect": <integer or null>,
      "trialsTotal": <integer or null>,
      "cueingLevel": <"INDEPENDENT"|"GESTURAL"|"INDIRECT_VERBAL"|"DIRECT_VERBAL"|"MODELING"|"PHYSICAL"|"MAXIMUM_ASSISTANCE"|null>
    }
  ],
  "duration": <integer minutes or null>,
  "participation": <"excellent"|"good"|"fair"|"poor"|null>
}

EXTRACTION RULES:
1. Include any goal that is clearly referenced — match by goal name, domain keyword, target sound/skill, or clinical description (e.g. "articulation targets", "language goals", "/r/ production", "AAC device").
2. For trials: "8/10", "8 out of 10", "8 correct out of 10", "18 of 25 correct" → trialsCorrect=8 (or 18), trialsTotal=10 (or 25), compute accuracy.
3. For percentages: "80% accuracy", "demonstrated 72% accuracy" → accuracy=80 (or 72).
4. Cueing level — map ALL of these forms:
   - "independently" / "no cues" / "without cues" / "on her/his own" → INDEPENDENT
   - "minimal cues" / "min verbal" / "indirect verbal cues" / "minimal verbal cueing" → INDIRECT_VERBAL
   - "moderate cues" / "mod verbal" / "direct verbal cues" / "required direct verbal cues" / "with verbal cues" → DIRECT_VERBAL
   - "maximum support" / "max assist" / "maximal verbal cues" / "required maximal" / "hand-over-hand" → MAXIMUM_ASSISTANCE
   - "gestural cue" / "gesture" / "visual cue" → GESTURAL
   - "modeling" / "model" / "imitation" → MODELING
   - "physical guidance" / "physical prompt" / "hand-over-hand" → PHYSICAL
5. Duration: "20-minute session", "30 minutes", "seen for 45 min" → duration in minutes.
6. Participation: "excellent participation" / "very engaged" / "cooperative" → excellent; "good effort" / "participated well" → good; "fair participation" / "inconsistent engagement" → fair; "refused" / "non-compliant" / "poor participation" → poor.
7. If a number is ambiguous between two goals, assign it to the goal whose name or domain appears closest in the text.
8. A clinical note saying "Student produced X with Y% accuracy with Z cueing" — extract accuracy=Y and map Z to the correct cueing level.`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireUser();
    await params; // ensure route param is resolved

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { extractions: {}, duration: null, participation: null },
        { status: 200 }
      );
    }

    const { transcript, goals } = await req.json();

    if (!transcript?.trim() || !goals?.length) {
      return NextResponse.json({ extractions: {}, duration: null, participation: null });
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: buildPrompt(transcript, goals) }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";

    // Pull out JSON even if the model accidentally wraps it in markdown
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON block in response");

    const parsed = JSON.parse(jsonMatch[0]);

    // Build a validated Record<goalId, ExtractionResult>
    const extractions: Record<
      string,
      { accuracy: number | null; trialsCorrect: number | null; trialsTotal: number | null; cueingLevel: string | null }
    > = {};

    for (const g of parsed.goals ?? []) {
      if (!g.goalId || typeof g.goalId !== "string") continue;
      extractions[g.goalId] = {
        accuracy:      typeof g.accuracy === "number"      ? Math.min(100, Math.max(0, g.accuracy)) : null,
        trialsCorrect: typeof g.trialsCorrect === "number"  ? g.trialsCorrect : null,
        trialsTotal:   typeof g.trialsTotal === "number"    ? g.trialsTotal   : null,
        cueingLevel:   VALID_CUEING.includes(g.cueingLevel) ? g.cueingLevel  : null,
      };
    }

    const validParticipation = ["excellent", "good", "fair", "poor"];

    return NextResponse.json({
      extractions,
      duration:      typeof parsed.duration === "number" ? parsed.duration : null,
      participation: validParticipation.includes(parsed.participation) ? parsed.participation : null,
    });
  } catch (err) {
    console.error("[extract-data]", err);
    // Non-fatal — client will fall back to regex extraction
    return NextResponse.json({ extractions: {}, duration: null, participation: null });
  }
}
