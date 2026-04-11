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

interface IEPChatContext {
  studentName: string;
  currentFields: {
    strengths?: string;
    areasOfNeed?: string;
    functionalImpact?: string;
    baselinePerformance?: string;
    communicationProfile?: string;
    parentConcerns?: string;
  };
  goals: Array<{ name: string; domain: string; targetAccuracy: number }>;
}

interface ChatBody {
  messages: ChatMessage[];
  context: IEPChatContext;
}

function buildSystemPrompt(ctx: IEPChatContext): string {
  const { studentName, currentFields, goals } = ctx;

  const fieldStatus = [
    { label: "Strengths", key: "strengths", value: currentFields.strengths },
    { label: "Areas of Need", key: "areasOfNeed", value: currentFields.areasOfNeed },
    { label: "Functional Impact", key: "functionalImpact", value: currentFields.functionalImpact },
    { label: "Baseline Performance", key: "baselinePerformance", value: currentFields.baselinePerformance },
    { label: "Communication Profile", key: "communicationProfile", value: currentFields.communicationProfile },
    { label: "Parent Concerns", key: "parentConcerns", value: currentFields.parentConcerns },
  ];

  const filled = fieldStatus.filter((f) => f.value?.trim());
  const empty = fieldStatus.filter((f) => !f.value?.trim());

  const filledSection = filled.length > 0
    ? filled.map((f) => `• ${f.label}: "${f.value!.trim().slice(0, 120)}${f.value!.trim().length > 120 ? "…" : ""}"`).join("\n")
    : "None filled yet.";

  const emptySection = empty.length > 0
    ? empty.map((f) => `• ${f.label} (key: ${f.key})`).join("\n")
    : "All sections are filled.";

  const goalsSection = goals.length > 0
    ? goals.map((g) => `• ${g.name} [${g.domain}] — target ${Math.round(g.targetAccuracy * 100)}%`).join("\n")
    : "No goals added yet.";

  return `You are a clinical documentation assistant for a school-based Speech-Language Pathologist (SLP).
Your purpose is to help complete an Individualized Education Program (IEP) document through a short, focused interview.
You are NOT a general assistant. You are a fast, precise IEP documentation tool.

═══ STUDENT ═══
Name: ${studentName}

═══ CURRENT IEP GOALS ═══
${goalsSection}

═══ PLAAFP SECTIONS — CURRENTLY FILLED ═══
${filledSection}

═══ SECTIONS STILL NEEDED ═══
${emptySection}

═══ YOUR RULES ═══
1. NEVER ask about information already present in the filled sections above.
2. Ask EXACTLY ONE short, specific question per response. No lists of questions, no preambles.
3. Priority order for which field to ask about next:
   — (1) Strengths (communication strengths, positive attributes)
   — (2) Areas of Need (specific deficits — articulation, language, fluency, pragmatics)
   — (3) Functional Impact (how communication needs affect academics and daily functioning)
   — (4) Baseline Performance (assessment scores, probe results, standardized test data)
   — (5) Communication Profile (intelligibility, language levels, AAC use, pragmatics)
   — (6) Parent Concerns (priorities and questions raised by parents/guardians)
   Skip any field that is already filled.
4. When you have enough information to populate one or more fields, output on a new line starting with EXACTLY:
   IEP_UPDATE:
   followed immediately by a valid JSON object containing only the fields you have content for.
   Use the exact key names: strengths, areasOfNeed, functionalImpact, baselinePerformance, communicationProfile, parentConcerns.
   Write field values in professional SLP clinical language (third person, objective, specific).
   Example: IEP_UPDATE: {"strengths": "Student demonstrates adequate receptive vocabulary skills and responds consistently to familiar verbal directions."}
5. Do NOT output IEP_UPDATE if nothing new was learned in this turn.
6. After capturing all empty fields, confirm briefly and close the interview.
7. Tone: direct, clinical, collegial. One sentence per question. No small talk. No apologies.
8. Example good question: "What specific phoneme errors does ${studentName} produce in conversational speech?"
   Example bad question: "That's great! Now, could you tell me a little bit about how ${studentName} communicates?"`;
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
