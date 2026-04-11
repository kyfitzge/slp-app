/**
 * POST /api/ieps/[iepId]/chat
 *
 * IEP documentation assistant.
 * Conducts a conversational interview to populate PLAAFP sections and parent concerns.
 * Context is provided entirely by the client — no DB reads needed.
 *
 * When Claude has content for one or more fields, it outputs on a new line:
 *   IEP_UPDATE: {"strengths": "...", "areasOfNeed": "..."}
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import Anthropic from "@anthropic-ai/sdk";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface FieldStatus {
  label: string;
  key: string;
  quality: "empty" | "partial" | "complete";
  preview?: string; // first ~120 chars of content if filled
}

interface IEPChatGoal {
  name: string;
  domain: string;
  targetAccuracy: number; // 0–1 float
  hasDataPoints: boolean;
}

interface IEPChatContext {
  studentName: string;
  serviceMinutesPerWeek?: number;
  individualMinutes?: number;
  groupMinutes?: number;
  serviceLocation?: string;
  fieldStatus: FieldStatus[];
  goals: IEPChatGoal[];
}

interface ChatBody {
  messages: ChatMessage[];
  context: IEPChatContext;
}

function buildSystemPrompt(ctx: IEPChatContext): string {
  const { studentName, fieldStatus, goals, serviceMinutesPerWeek, individualMinutes, groupMinutes, serviceLocation } = ctx;

  // ── Service section ──────────────────────────────────────────────────────────
  const serviceLines: string[] = [];
  if (serviceMinutesPerWeek) serviceLines.push(`Total: ${serviceMinutesPerWeek} min/week`);
  if (individualMinutes)     serviceLines.push(`Individual: ${individualMinutes} min/week`);
  if (groupMinutes)          serviceLines.push(`Group: ${groupMinutes} min/week`);
  if (serviceLocation)       serviceLines.push(`Location: ${serviceLocation}`);
  const serviceSection = serviceLines.length > 0
    ? serviceLines.join(" | ")
    : "Not yet specified";

  // ── Goals section ─────────────────────────────────────────────────────────────
  const goalsSection = goals.length > 0
    ? goals.map((g) => {
        const pct = Math.round(g.targetAccuracy * 100);
        const dataNote = g.hasDataPoints ? "has data" : "no data yet";
        return `• ${g.name} [${g.domain.replace(/_/g, " ")}] — target ${pct}% (${dataNote})`;
      }).join("\n")
    : "No goals added yet.";

  // ── Goal domain → PLAAFP guidance ──────────────────────────────────────────────
  const domainGuidance: Partial<Record<string, string>> = {
    ARTICULATION: "Baseline should include probe accuracy (% correct in words/sentences/conversation). Areas of Need should name specific phoneme errors. Communication Profile should include speech intelligibility level.",
    PHONOLOGY: "Baseline should include phonological process analysis or probe accuracy. Areas of Need should name active phonological processes. Communication Profile should include intelligibility impact.",
    LANGUAGE_EXPRESSION: "Baseline should include standardized scores or structured observation data for expressive language. Areas of Need should describe expressive deficits (syntax, morphology, vocabulary, narrative).",
    LANGUAGE_COMPREHENSION: "Baseline should include comprehension test scores or functional level data. Areas of Need should describe specific receptive language deficits.",
    FLUENCY: "Baseline should include % syllables stuttered or severity rating. Areas of Need should describe fluency pattern (repetitions, prolongations, blocks). Functional Impact should address avoidance or impact on communication.",
    VOICE: "Baseline should include perceptual rating or instrumental data. Areas of Need should describe vocal quality/characteristics. Functional Impact should note impact on academic participation.",
    PRAGMATICS: "Baseline should include rubric scores or structured observation data. Areas of Need should describe specific pragmatic deficits (topic maintenance, turn-taking, perspective-taking).",
    AUGMENTATIVE_COMMUNICATION: "Baseline should include current AAC use and functional communication level. Communication Profile should describe current AAC system and symbol/vocabulary access.",
    SOCIAL_COMMUNICATION: "Baseline should include social communication assessment data. Areas of Need should describe specific social communication deficits.",
    LITERACY: "Baseline should include phonological awareness or literacy probe data. Areas of Need should describe literacy skill deficits with SLP connection.",
  };

  const relevantDomains = [...new Set(goals.map((g) => g.domain))];
  const domainGuidanceSection = relevantDomains.length > 0
    ? relevantDomains
        .filter((d) => domainGuidance[d])
        .map((d) => `• ${d.replace(/_/g, " ")}: ${domainGuidance[d]}`)
        .join("\n")
    : "";

  // ── Field status section ───────────────────────────────────────────────────────
  const fieldStatusSection = fieldStatus.map((f) => {
    if (f.quality === "empty")    return `• ${f.label}: EMPTY`;
    if (f.quality === "partial")  return `• ${f.label}: PARTIAL — "${f.preview}"`;
    return                               `• ${f.label}: FILLED — "${f.preview}"`;
  }).join("\n");

  const hasEmpty   = fieldStatus.some((f) => f.quality === "empty");
  const hasPartial = fieldStatus.some((f) => f.quality === "partial");
  const completionNote = !hasEmpty && !hasPartial
    ? "All sections are filled. Ask if anything needs to be refined or added."
    : "";

  return `You are a clinical documentation assistant for a school-based Speech-Language Pathologist (SLP).

You are conducting an adaptive intake interview to complete an IEP for a specific student.
You reason like an experienced SLP — you understand what makes each PLAAFP section complete and clinically useful, how present levels must connect to the student's specific goals, and what information is necessary for high-quality IEP documentation.

═══ STUDENT & SERVICE ═══
Student: ${studentName}
Services: ${serviceSection}

═══ IEP GOALS ═══
${goalsSection}
${domainGuidanceSection ? `\n═══ GOAL-TO-PLAAFP GUIDANCE ═══\n${domainGuidanceSection}` : ""}

═══ CURRENT DOCUMENTATION STATUS ═══
${fieldStatusSection}
${completionNote ? `\n${completionNote}` : ""}

═══ MANDATORY RESPONSE FORMAT ═══
Every response must follow exactly one of these two formats. No exceptions.

FORMAT A — Interview is still in progress (use this by default whenever any field is EMPTY or PARTIAL):
[One focused question about the next most important missing field]
IEP_UPDATE: {"key": "value"}

The question comes FIRST. IEP_UPDATE comes AFTER the question, on its own line, and only when the user's most recent answer gave you new information to record. If the previous answer gave you nothing new, omit IEP_UPDATE entirely — just ask the next question.

FORMAT B — Interview is complete (use ONLY when the user says done/stop/no/finished, OR every field is FILLED):
[One brief closing sentence]
IEP_UPDATE: {"key": "value", ...}

The closing statement comes FIRST. IEP_UPDATE comes AFTER it, containing everything captured in this conversation.

IMPORTANT:
- IEP_UPDATE must NEVER be the first or only line of your response.
- If there are still EMPTY or PARTIAL fields, always use Format A.
- Do not close the interview early — keep asking until all fields are covered or the user stops you.

═══ WHAT GOOD FIELD COVERAGE LOOKS LIKE ═══
Before choosing the next question, silently check which fields are still empty or partial:
  • Strengths: specific communication abilities with context and skill level
  • Areas of Need: named disorder/delay types with error patterns (not just "articulation")
  • Functional Impact: how communication difficulties affect academics and daily participation
  • Baseline Performance: measurable data — probe accuracy %, test scores, trial counts
  • Communication Profile: overall picture — intelligibility, language levels, AAC, pragmatics
  • Parent Concerns: family-reported observations about home and community communication
Each goal in the IEP should have corresponding content in at least one PLAAFP section.
Goal-to-PLAAFP alignment is a top priority — prioritize asking for data tied to existing goals.

═══ RULES ═══
1. Ask exactly ONE focused question per turn. Never combine questions.
2. Never ask about information already shown as FILLED above.
3. Extract ALL usable data points from a rich answer before asking more.
   Example: "She gets 8/10 on probes with minimal cues and her teacher says she's hard to understand"
   → records Baseline (8/10, minimal cues) AND Functional Impact (intelligibility in class)
   → next question moves to the next empty field, not a follow-up on either of those
4. Write all IEP_UPDATE field values in professional SLP documentation language:
   — Third person: "Student demonstrates…" / "Student presents with…"
   — Specific and measurable: "60% accuracy on final consonant deletion in connected speech"
   — Standard SLP terminology: "phonological disorder," "connected speech," "structured contexts"
   — Concise and information-dense — one to two sentences per field
   — Attribute secondhand info: "per teacher report," "per parent report"
   — No AI-sounding phrases: avoid "various," "several," "overall," "it appears"
5. If an answer is vague, use conservative language: "per clinician report" or "reportedly"
6. Tone: direct, collegial, efficient. No preambles, no apologies, no explanation of what you are doing.
   ✓ Good: "Does ${studentName}'s final consonant deletion affect intelligibility in the classroom?"
   ✗ Bad: "Great answer! Now I'd like to ask about how this impacts his school performance."`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ iepId: string }> }
) {
  try {
    await requireUser();
    await params;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured." },
        { status: 503 }
      );
    }

    const body: ChatBody = await req.json();
    const { messages, context } = body;

    if (!context) {
      return NextResponse.json({ error: "Missing IEP context" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    const anthropicMessages: Anthropic.MessageParam[] =
      messages.length === 0
        ? [
            {
              role: "user",
              content:
                "Start the IEP documentation interview. Read the current fields and ask the most important question to fill a gap.",
            },
          ]
        : messages.map((m) => ({ role: m.role, content: m.content }));

    const response = await client.messages.create({
      model: process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5",
      max_tokens: 1024,
      system: buildSystemPrompt(context),
      messages: anthropicMessages,
    });

    const fullText =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    // Parse IEP_UPDATE marker
    const iepUpdateMarker = "IEP_UPDATE:";
    const iepUpdateIdx = fullText.indexOf(iepUpdateMarker);

    let reply = fullText;
    let iepUpdate: Record<string, string> | null = null;

    if (iepUpdateIdx !== -1) {
      const jsonStr = fullText.slice(iepUpdateIdx + iepUpdateMarker.length).trim();
      reply = fullText.slice(0, iepUpdateIdx).trim();
      if (!reply) {
        reply = "Got it — applying the captured information to your IEP.";
      }
      try {
        iepUpdate = JSON.parse(jsonStr);
      } catch {
        // Malformed JSON — ignore the update silently
        iepUpdate = null;
      }
    }

    return NextResponse.json({ reply, iepUpdate });
  } catch (err) {
    console.error("[iep-chat]", err);
    const msg = err instanceof Error ? err.message : "Failed to get AI response";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
