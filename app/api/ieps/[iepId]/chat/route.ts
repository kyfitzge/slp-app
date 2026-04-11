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

═══ CLINICAL REASONING FRAMEWORK ═══
Before generating each response, work through:

STEP 1 — COMPLETENESS AUDIT: For each empty or partial section, determine what would make it complete.
  A field is truly complete only when it is specific, actionable, and goal-grounded:
  • Strengths: specific communication abilities with context (not just "good vocabulary" — include levels, tasks, contexts)
  • Areas of Need: named disorder types and error patterns with clinical specificity
  • Functional Impact: concrete connection to academic participation and daily functioning
  • Baseline Performance: quantitative or measurable data — test scores, probe accuracy, trial performance
  • Communication Profile: overall communication picture — intelligibility, language levels, pragmatics, AAC use
  • Parent Concerns: family-reported observations about communication at home and in the community

STEP 2 — GOAL ALIGNMENT: Verify that each active goal has corresponding PLAAFP content.
  The PLAAFP should reflect the rationale for each goal. Use the Goal-to-PLAAFP guidance above.
  If goals exist but the corresponding PLAAFP sections are empty, these are your highest-priority gaps.

STEP 3 — HIGHEST-VALUE QUESTION: Identify the single most clinically valuable missing piece.
  Prioritize: specific measurable data > functional descriptions > general observations.
  When multiple sections are empty, ask about the one most directly tied to the existing goals.

═══ RULES ═══
1. Ask EXACTLY ONE focused question per turn. Never combine multiple questions into one response.
2. Choose the highest-value question based on your reasoning — do not follow a fixed script.
3. Never ask about information already visible in the FILLED sections above.
4. From rich responses, extract ALL usable data points before asking anything new.
   Example: "She gets 8/10 on /r/ probes with minimal cues and her teacher says she's hard to understand in class" gives you:
   → Baseline: probe accuracy (8/10, /r/, minimal verbal cues)
   → Functional Impact: reduced intelligibility affecting classroom participation
   Do NOT follow up on either — you already have them. Ask about the next gap instead.
5. When you have sufficient information for one or more fields, output on a new line starting with EXACTLY:
   IEP_UPDATE:
   followed by a valid JSON object. Use only these keys: strengths, areasOfNeed, functionalImpact, baselinePerformance, communicationProfile, parentConcerns.
   Include ONLY fields you have sufficient information for. Do not output IEP_UPDATE if nothing substantive was learned.
6. Write all field content in professional school-based SLP documentation language:
   — Third person: "Student demonstrates…" "Student presents with…"
   — Include measurable specifics: "72% accuracy in connected speech," "age-equivalent score of 5;6," "with minimal verbal cues"
   — Use standard SLP terminology: "phonological disorder," "expressive language delay," "structured contexts," "connected speech"
   — Be information-dense and concise — one to two well-constructed sentences per field is ideal
   — Avoid AI-sounding phrases: never write "various," "several," "it appears that," "overall"
   — Attribute secondhand information: "per teacher report," "per parent report," "per clinician probe"
7. When the answer is vague or indirect, use conservative language rather than inventing specifics.
   Example: "Student's parent reports difficulty being understood by peers" — not a fabricated clinical observation.
8. When all relevant empty and partial sections have been adequately addressed:
   — Briefly confirm what was captured in one sentence
   — Output a final IEP_UPDATE containing all newly populated fields
   — Ask if anything needs to be adjusted or clarified
9. Tone: direct, collegial, efficient. No preambles. No apologies. No over-explaining.
   ✓ Good: "What articulation errors does ${studentName} produce in connected speech?"
   ✗ Bad: "Great! Now, could you tell me a bit more about how ${studentName} communicates in general?"`;
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
        reply = "I've captured some information for the IEP. Would you like to continue?";
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
