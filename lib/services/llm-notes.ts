/**
 * LLM note-cleaning service.
 *
 * Takes a raw transcript and optional session context, returns:
 *   - cleanedNote   : professional prose note
 *   - structuredData: goals, accuracy, cueing, participation, etc.
 *
 * Default implementation uses Anthropic Claude.
 * Swap the provider by setting LLM_NOTE_PROVIDER in .env.local.
 */

import Anthropic from "@anthropic-ai/sdk";
import { structuredNoteSchema, type StructuredNote } from "@/lib/validations/voice-note";

// ── Session context optionally passed to the LLM to improve accuracy ─────────

export interface SessionContext {
  studentFirstName?: string;
  gradeLevel?: string;
  sessionType?: string;
  sessionDate?: string;
  /** Brief descriptions of the student's active goals */
  activeGoals?: string[];
}

export interface LLMNoteResult {
  structuredData: StructuredNote;
  /** Raw text response from the model (for debugging / fallback display) */
  rawResponse: string;
}

// ── Prompt template ──────────────────────────────────────────────────────────

function buildPrompt(transcript: string, context?: SessionContext): string {
  const contextLines: string[] = [];

  if (context?.studentFirstName) {
    contextLines.push(`Student first name: ${context.studentFirstName}`);
  }
  if (context?.gradeLevel) {
    contextLines.push(`Grade: ${context.gradeLevel.replace("_", " ").replace("GRADE ", "Grade ")}`);
  }
  if (context?.sessionType) {
    contextLines.push(`Session type: ${context.sessionType.replace(/_/g, " ").toLowerCase()}`);
  }
  if (context?.sessionDate) {
    contextLines.push(`Session date: ${context.sessionDate}`);
  }
  if (context?.activeGoals?.length) {
    contextLines.push(
      `Active IEP goals:\n${context.activeGoals.map((g, i) => `  ${i + 1}. ${g}`).join("\n")}`
    );
  }

  const contextBlock =
    contextLines.length > 0
      ? `SESSION CONTEXT:\n${contextLines.join("\n")}\n\n`
      : "";

  return `You are a clinical documentation assistant for a school-based Speech-Language Pathologist (SLP).

Your task is to convert the raw spoken transcript below into a clean, professional written session note suitable for IEP documentation.

CRITICAL RULES — read carefully before responding:
1. ONLY include information explicitly stated in the transcript. Do not infer or assume.
2. NEVER fabricate clinical details (accuracy numbers, cue types, goals) not mentioned in the transcript.
3. If something is unclear or ambiguous, add a concise description to "uncertaintyFlags" — do NOT guess.
4. Write "cleanedNote" in past tense, professional clinical prose (2–4 paragraphs). Omit filler words.
5. Match goals to the active IEP goals listed in the context when possible; otherwise describe them briefly.
6. If the transcript contains no usable session content, set "cleanedNote" to a short statement noting that and populate "uncertaintyFlags" accordingly.
7. Respond with ONLY valid JSON — no markdown, no code fences, no commentary outside the JSON object.

${contextBlock}RAW TRANSCRIPT:
<transcript>
${transcript}
</transcript>

Respond with a JSON object matching this EXACT schema (use null for any field not mentioned):
{
  "cleanedNote": "string — professional prose session note in past tense",
  "goalsAddressed": [
    {
      "shortDescription": "3–8 word label for the goal",
      "accuracyPercent": <number 0-100 or null>,
      "cueingLevel": <"INDEPENDENT"|"GESTURAL"|"INDIRECT_VERBAL"|"DIRECT_VERBAL"|"MODELING"|"PHYSICAL"|"MAXIMUM_ASSISTANCE"|null>,
      "trialsCorrect": <integer or null>,
      "trialsTotal": <integer or null>,
      "notes": <"string" or null>
    }
  ],
  "participation": <"excellent"|"good"|"fair"|"poor"|"refused"|null>,
  "sessionDurationMins": <integer or null>,
  "materials": <"string describing materials/activities" or null>,
  "nextStepPlan": <"string" or null>,
  "uncertaintyFlags": ["array of strings describing unclear or missing items"]
}`;
}

// ── Anthropic Claude implementation ──────────────────────────────────────────

async function cleanWithClaude(
  transcript: string,
  context?: SessionContext
): Promise<LLMNoteResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Add it to .env.local to enable AI note cleaning."
    );
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: buildPrompt(transcript, context),
      },
    ],
  });

  const rawResponse =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Strip any accidental markdown fences
  const jsonText = rawResponse
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `LLM returned invalid JSON. Raw response:\n${rawResponse.slice(0, 500)}`
    );
  }

  // Validate against our schema — throws with a clear message if fields are wrong
  const structuredData = structuredNoteSchema.parse(parsed);

  return { structuredData, rawResponse };
}

// ── Public entrypoint ─────────────────────────────────────────────────────────

export async function cleanTranscript(
  transcript: string,
  context?: SessionContext
): Promise<LLMNoteResult> {
  const provider = process.env.LLM_NOTE_PROVIDER ?? "anthropic";

  if (provider === "anthropic") {
    return cleanWithClaude(transcript, context);
  }

  throw new Error(`Unknown LLM provider: "${provider}". Supported: "anthropic"`);
}
