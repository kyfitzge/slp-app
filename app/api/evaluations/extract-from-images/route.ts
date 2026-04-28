import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/auth/get-user";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type AnthropicImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const ALLOWED_IMAGE_TYPES: AnthropicImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { images, studentContext } = body as {
      images: Array<{ base64: string; mediaType: string }>;
      studentContext?: string;
    };

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (images.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 files allowed" },
        { status: 400 }
      );
    }

    // Build content blocks — PDFs use "document" type, images use "image" type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentBlocks: any[] = images.map(
      (img: { base64: string; mediaType: string }) => {
        if (img.mediaType === "application/pdf") {
          return {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: img.base64,
            },
          };
        }
        const mediaType = ALLOWED_IMAGE_TYPES.includes(
          img.mediaType as AnthropicImageMediaType
        )
          ? (img.mediaType as AnthropicImageMediaType)
          : ("image/jpeg" as AnthropicImageMediaType);
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: img.base64,
          },
        };
      }
    );

    const extractionPrompt = `You are an expert school-based speech-language pathologist assistant analyzing uploaded assessment documents (images and/or PDFs).

Carefully examine all uploaded files and extract every piece of clinical information visible. Return ONLY a valid JSON object — no markdown, no explanation, just the JSON.

Use this exact structure (leave fields as empty strings or empty arrays if not found):

{
  "referral": "student name, date of birth, grade, school, evaluator, evaluation dates if visible",
  "background": "any background or history information",
  "behavioral": "behavioral observations during testing",
  "selectedMethods": ["test name 1", "test name 2"],
  "methodsNotes": "assessment conditions, modifications, number of sessions",
  "testRows": [
    {
      "testName": "Full test or subtest name",
      "standardScore": "numeric score",
      "percentile": "percentile rank e.g. 3rd or <1",
      "descriptor": "score range descriptor e.g. Below Average"
    }
  ],
  "testInterpretation": "any narrative score interpretation or clinical commentary",
  "commAreas": {
    "articulation": { "status": "assessed", "findings": "findings text" },
    "receptive": { "status": "na", "findings": "" },
    "expressive": { "status": "na", "findings": "" },
    "pragmatics": { "status": "na", "findings": "" },
    "fluency": { "status": "na", "findings": "" },
    "voice": { "status": "na", "findings": "" }
  },
  "informal": "language sample or informal assessment findings",
  "hearing": "hearing and vision status",
  "summary": "summary or conclusion text",
  "impact": "educational impact statements",
  "recommendations": "recommendations text"
}

For testRows, look for:
- Score record forms with columns for raw scores, standard scores, scaled scores, percentile ranks
- Score summary boxes or tables at top or bottom of pages
- Any tabular data with test names and numbers
- Subtests listed under a main test battery

For commAreas status: use "assessed" if that area was tested, "not-assessed" if explicitly skipped, "na" if no information.${
  studentContext ? `\n\nStudent context: ${studentContext}` : ""
}`;

    const response = await client.messages.create({
      model: process.env.LLM_NOTE_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            ...contentBlocks,
            { type: "text", text: extractionPrompt },
          ],
        },
      ],
    });

    const contentBlock = response.content[0];
    if (contentBlock.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected response type from AI" },
        { status: 500 }
      );
    }

    // Strip markdown code fences if present
    const raw = contentBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let extracted: unknown;
    try {
      extracted = JSON.parse(raw);
    } catch {
      console.error("[extract-from-images] JSON parse failed:", raw.slice(0, 200));
      return NextResponse.json(
        { error: "Could not parse extraction result", raw: raw.slice(0, 500) },
        { status: 500 }
      );
    }

    return NextResponse.json({ extracted });
  } catch (err) {
    console.error("[extract-from-images] error:", err);
    return NextResponse.json(
      { error: "Failed to extract information from documents" },
      { status: 500 }
    );
  }
}
