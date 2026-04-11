/**
 * POST /api/sessions/[sessionId]/chat
 *
 * Intelligent SLP session-note interviewer.
 * Receives full session context + conversation history from the client,
 * returns the single highest-value missing question (or a completion
 * summary when all required fields are captured).
 *
 * Context is provided entirely by the client — no DB reads needed.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import Anthropic from "@anthropic-ai/sdk";

interface ChatGoal {
  id: string;
  name: string;
  accuracy?: number | null;
  trials?: string | null;
  cueing?: string | null;
}

interface ChatContext {
  sessionDate: string;
  sessionType: string;
  durationMins?: number | null;
  students: string[];
  goals: ChatGoal[];
  missingLabels: string[];
  currentNote: string;
  /** Raw voice transcript if the SLP already recorded a summary. */
  transcript?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  messages: ChatMessage[];
  context: ChatContext;
}

function buildSystemPrompt(ctx: ChatContext): string {
  // ── What is already known ──────────────────────────────────────────────────
  const knownGoals = ctx.goals.filter(
    (g) => g.accuracy != null || g.trials != null || g.cueing != null
  );
  const unknownGoals = ctx.goals.filter(
    (g) => g.accuracy == null && g.trials == null && g.cueing == null
  );

  const goalLines = ctx.goals.length > 0
    ? ctx.goals.map((g) => {
        const parts: string[] = [`• ${g.name}`];
        if (g.accuracy != null)  parts.push(`${g.accuracy}% accuracy`);
        if (g.trials)            parts.push(`${g.trials} trials`);
        if (g.cueing)            parts.push(g.cueing.replace(/_/g, " ").toLowerCase());
        if (g.accuracy == null && !g.trials) parts.push("(no performance data yet)");
        return parts.join(" — ");
      }).join("\n")
    : "None identified yet.";

  const missingSection = ctx.missingLabels.length > 0
    ? `STILL MISSING: ${ctx.missingLabels.join(", ")}`
    : "All required structured fields have been captured.";

  const noteSection = ctx.currentNote.trim()
    ? `CURRENT NOTE DRAFT:\n"${ctx.currentNote.trim()}"`
    : "No note draft yet.";

  const transcriptSection = ctx.transcript?.trim()
    ? `VOICE TRANSCRIPT (what the SLP already said):\n"${ctx.transcript.trim()}"`
    : "";

  const goalsNeedingData = unknownGoals.length > 0
    ? `Goals with no performance data yet: ${unknownGoals.map((g) => g.name).join(", ")}`
    : knownGoals.length > 0
    ? `Performance data captured for: ${knownGoals.map((g) => g.name).join(", ")}`
    : "";

  // ── Determine conversation phase ──────────────────────────────────────────
  const allCaptured = ctx.missingLabels.length === 0 && ctx.goals.length > 0 && knownGoals.length === ctx.goals.length;

  return `You are a clinical documentation assistant for a school-based Speech-Language Pathologist (SLP).
Your sole purpose is to fill gaps in session documentation through a short, focused interview.
You are NOT a general assistant or therapist. You are a fast, precise documentation tool.

═══ SESSION CONTEXT (do NOT ask about any of this) ═══
Date: ${ctx.sessionDate}
Type: ${ctx.sessionType}
Duration: ${ctx.durationMins ? `${ctx.durationMins} min` : "not yet recorded"}
Students: ${ctx.students.join(", ")}

═══ GOALS & PERFORMANCE DATA ═══
${goalLines}
${goalsNeedingData ? `\n${goalsNeedingData}` : ""}

${transcriptSection ? `═══ PRIOR VOICE TRANSCRIPT ═══\n${transcriptSection}\n` : ""}
═══ CURRENT NOTE DRAFT ═══
${noteSection}

═══ DOCUMENTATION STATUS ═══
${missingSection}

═══ YOUR RULES ═══
1. NEVER ask about information already present in the transcript, note draft, or session context above.
2. Ask EXACTLY ONE short, specific question per response. No lists of questions, no preambles.
3. Use this priority order when choosing what to ask next:
   — (1) Which goals/targets were addressed (if none captured yet)
   — (2) Student performance: accuracy % or trial counts (e.g. "8 out of 10")
   — (3) Cueing or support level used (independent, verbal cues, modeling, etc.)
   — (4) Activity or task the goal was practiced through
   — (5) Student participation, engagement, or response to prompts
   — (6) Notable observations, behavioral notes, or plan for next session
4. If an answer is rich, extract ALL fields you can from it — only follow up on things you genuinely cannot infer.
5. When you have concrete new details to add, output a factual summary of ALL information gathered so far on a new line starting with EXACTLY:
   NOTE_UPDATE:
   (followed immediately by a plain factual recap — no clinical formatting, no markdown, no labels)
   Do NOT output NOTE_UPDATE if nothing new was learned in this turn.

   This summary will be processed by a separate clinical note generator that has full session context.
   Write the summary as a compact, information-dense recap of everything known so far:
   — Goals or targets addressed
   — Performance: exact numbers if stated (accuracy %, trials correct/total), otherwise qualitative description
   — Cueing or support level used
   — Activities or tasks
   — Participation and engagement
   — Any next steps or observations mentioned
   Include all specific details. Write plainly — do NOT attempt to write the final clinical note.
6. ${allCaptured
    ? "All required fields are captured. Confirm this briefly and ask if there is anything else the SLP wants to add or clarify. If they say no, close the conversation."
    : "Keep asking until all required fields are captured, then confirm and close."}
7. Tone: direct, clinical, collegial. One sentence per question. No small talk. No apologies. No over-explaining.
8. Example of a good question: "What accuracy did you observe on the /r/ articulation goal?"
   Example of a bad question: "That's great! Now, could you tell me a little bit about how the student performed today in terms of their accuracy on the goals?"`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
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
      return NextResponse.json({ error: "Missing session context" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    const anthropicMessages: Anthropic.MessageParam[] =
      messages.length === 0
        ? [
            {
              role: "user",
              content:
                "Start the interview. Read the session context and ask the single most important question to fill a documentation gap. Be direct and brief.",
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

    // Parse NOTE_UPDATE suggestion
    const noteUpdateMarker = "NOTE_UPDATE:";
    const noteUpdateIdx = fullText.indexOf(noteUpdateMarker);

    let reply = fullText;
    let noteUpdate: string | null = null;

    if (noteUpdateIdx !== -1) {
      noteUpdate = fullText.slice(noteUpdateIdx + noteUpdateMarker.length).trim();
      reply = fullText.slice(0, noteUpdateIdx).trim();
      if (!reply) {
        reply = "Here's an updated note draft based on what you've shared:";
      }
    }

    return NextResponse.json({ reply, noteUpdate });
  } catch (err) {
    console.error("[chat]", err);
    const msg = err instanceof Error ? err.message : "Failed to get AI response";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
