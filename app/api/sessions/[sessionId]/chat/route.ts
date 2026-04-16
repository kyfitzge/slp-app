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

/** Per-student context used in group sessions. */
interface StudentChatContext {
  studentId: string;
  studentName: string;
  goals: ChatGoal[];
  currentNote: string;
}

interface ChatContext {
  sessionDate: string;
  sessionType: string;
  durationMins?: number | null;
  students: string[];
  goals: ChatGoal[];          // flat list kept for single-student backward compat
  missingLabels: string[];
  currentNote: string;        // active student's note (single-student) or combined (group)
  /** Raw voice transcript if the SLP already recorded a summary. */
  transcript?: string;
  /** Per-student breakdown — present only for group sessions. */
  studentContexts?: StudentChatContext[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  messages: ChatMessage[];
  context: ChatContext;
}

function goalLine(g: ChatGoal): string {
  const parts: string[] = [`• ${g.name}`];
  if (g.accuracy != null) parts.push(`${g.accuracy}% accuracy`);
  if (g.trials)           parts.push(`${g.trials} trials`);
  if (g.cueing)           parts.push(g.cueing.replace(/_/g, " ").toLowerCase());
  if (g.accuracy == null && !g.trials) parts.push("(no performance data yet)");
  return parts.join(" — ");
}

function buildSystemPrompt(ctx: ChatContext): string {
  const isGroup = (ctx.studentContexts?.length ?? 0) > 1;

  const missingSection = ctx.missingLabels.length > 0
    ? `STILL MISSING: ${ctx.missingLabels.join(", ")}`
    : "All required structured fields have been captured.";

  const transcriptSection = ctx.transcript?.trim()
    ? `═══ PRIOR VOICE TRANSCRIPT ═══\n"${ctx.transcript.trim()}"\n`
    : "";

  // ── Per-student section (group sessions) ──────────────────────────────────
  let studentSection = "";
  if (isGroup && ctx.studentContexts) {
    studentSection = ctx.studentContexts.map((sc) => {
      const goalLines = sc.goals.length > 0
        ? sc.goals.map(goalLine).join("\n")
        : "  No goals on file.";
      const notePreview = sc.currentNote.trim()
        ? `  Current note: "${sc.currentNote.trim().slice(0, 300)}${sc.currentNote.trim().length > 300 ? "…" : ""}"`
        : "  Current note: (none yet)";
      return `--- ${sc.studentName} ---\nGoals:\n${goalLines}\n${notePreview}`;
    }).join("\n\n");
  }

  // ── Single-student goal section (backward compat) ─────────────────────────
  const knownGoals   = ctx.goals.filter(g => g.accuracy != null || g.trials != null || g.cueing != null);
  const unknownGoals = ctx.goals.filter(g => g.accuracy == null && g.trials == null && g.cueing == null);
  const singleGoalLines = ctx.goals.length > 0
    ? ctx.goals.map(goalLine).join("\n")
    : "None identified yet.";
  const goalsNeedingData = !isGroup
    ? unknownGoals.length > 0
      ? `\nGoals with no performance data yet: ${unknownGoals.map(g => g.name).join(", ")}`
      : knownGoals.length > 0
      ? `\nPerformance data captured for: ${knownGoals.map(g => g.name).join(", ")}`
      : ""
    : "";

  // cueing is required if any goal is still missing it
  const cueingMissing = ctx.missingLabels.includes("Level of Support");

  const allCaptured = ctx.missingLabels.length === 0
    && (isGroup
      ? (ctx.studentContexts ?? []).every(sc => sc.goals.every(g => (g.accuracy != null || g.trials != null) && g.cueing != null))
      : ctx.goals.length > 0 && ctx.goals.every(g => g.cueing != null) && knownGoals.length === ctx.goals.length);

  // ── Compose prompt ─────────────────────────────────────────────────────────
  return `You are a clinical documentation assistant for a school-based Speech-Language Pathologist (SLP).
Your sole purpose is to fill gaps in session documentation through a short, focused interview.
You are NOT a general assistant or therapist. You are a fast, precise documentation tool.

═══ SESSION CONTEXT (do NOT ask about any of this) ═══
Date: ${ctx.sessionDate}
Type: ${ctx.sessionType}
Duration: ${ctx.durationMins ? `${ctx.durationMins} min` : "not yet recorded"}
${isGroup ? `Students in this GROUP session: ${(ctx.studentContexts ?? []).map(sc => sc.studentName).join(", ")}` : `Student: ${ctx.students[0] ?? "Unknown"}`}

${isGroup
  ? `═══ PER-STUDENT GOALS & NOTES ═══\n${studentSection}`
  : `═══ GOALS & PERFORMANCE DATA ═══\n${singleGoalLines}${goalsNeedingData}`
}

${transcriptSection}${!isGroup ? `═══ CURRENT NOTE DRAFT ═══\n${ctx.currentNote.trim() ? `"${ctx.currentNote.trim()}"` : "No note draft yet."}\n` : ""}
═══ DOCUMENTATION STATUS ═══
${missingSection}

═══ YOUR RULES ═══
1. NEVER ask about information already present in the transcript, note draft(s), or session context above.
2. Ask EXACTLY ONE short, specific question per response. No lists of questions, no preambles.
${isGroup
  ? `3. This is a GROUP session. Work through each student one at a time. Always name the student you are asking about (e.g. "For ${(ctx.studentContexts ?? [])[0]?.studentName ?? "Student 1"} — what accuracy did you observe on the [goal] goal?"). Complete all questions for one student before moving to the next.`
  : `3. Use this priority order when choosing what to ask next:
   — (1) Which goals/targets were addressed (if none captured yet)
   — (2) Student performance: accuracy % or trial counts (e.g. "8 out of 10")
   — (3) Level of support/cueing — MUST be asked explicitly (see Rule 5A)
   — (4) Activity or task the goal was practiced through
   — (5) Student participation, engagement, or response to prompts
   — (6) Notable observations, behavioral notes, or plan for next session`}
4. Priority order for each student in a group: (1) goals addressed, (2) accuracy/trials, (3) cueing level (see Rule 5A), (4) activity, (5) participation, (6) observations.
5. If an answer is rich, extract ALL fields you can from it — only follow up on things you genuinely cannot infer. EXCEPTION: cueing/support level must ALWAYS be confirmed explicitly per Rule 5A, even if the SLP mentioned prompts or cues in passing.
5A. CUEING LEVEL IS MANDATORY AND NON-INFERRABLE.
   Vague words like "some prompts," "needed help," "with support," "a few cues," "required assistance" do NOT capture this field — they are too imprecise for clinical records.
   You MUST ask a dedicated question that presents these specific options:
     Independent | Gestural cue | Minimal verbal cues | Moderate verbal cues | Modeling | Physical guidance | Maximum assistance
   Example question: "What level of support did you provide — independent, gestural, minimal verbal, moderate verbal, modeling, physical, or maximum assistance?"
   ${cueingMissing
     ? "⚠ Level of Support is currently MISSING. This must be your next question if goals and accuracy have been captured. Do NOT move to the open-context question (Rule 7) until this is answered."
     : "Level of Support has been captured — do not re-ask it."}
6. When you have concrete new details to add, output a factual summary starting with EXACTLY:
   NOTE_UPDATE:
   (followed immediately by a plain factual recap — no clinical formatting, no markdown headers)
   Do NOT output NOTE_UPDATE if nothing new was learned in this turn.
${isGroup
  ? `   For group sessions, structure the NOTE_UPDATE with each student on their own clearly labelled section:
   [${(ctx.studentContexts ?? []).map(sc => sc.studentName).join("] ... [")}]
   Example format:
   [${(ctx.studentContexts ?? [])[0]?.studentName ?? "Student 1"}]: Addressed /r/ articulation goal. 8/10 trials, indirect verbal cues. Engaged well.
   [${(ctx.studentContexts ?? [])[1]?.studentName ?? "Student 2"}]: Addressed language comprehension goal. 70% accuracy with modeling. Needed frequent redirection.`
  : `   Write as a compact, information-dense recap covering: goals addressed, performance data, cueing level, activities, participation, next steps.`}
7. ALWAYS, before closing the interview: ask "Is there anything else you'd like included in the note?" — no exceptions.
8. ${allCaptured
    ? "All required fields are captured. Ask the open-context question (rule 7) now. If they say no, close the conversation."
    : `Keep asking until ALL fields are captured, then ask the open-context question (rule 7) before closing. Current gaps: ${ctx.missingLabels.join(", ") || "none — check cueing per Rule 5A"}.`}
9. Tone: direct, clinical, collegial. One sentence per question. No small talk. No apologies. No over-explaining.`;
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
