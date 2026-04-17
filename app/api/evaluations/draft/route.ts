import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-user";
import { prisma } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { studentId, templateId, additionalContext } = body;

    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }

    // Fetch student data
    const student = await prisma.student.findFirst({
      where: { id: studentId },
      include: {
        ieps: {
          where: { status: { not: "EXPIRED" } },
          orderBy: { effectiveDate: "desc" },
          take: 1,
          include: {
            goals: {
              where: { status: { not: "DISCONTINUED" } },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Verify caseload access
    const caseload = await prisma.caseload.findFirst({
      where: { userId: user.id, studentId },
    });
    if (!caseload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Fetch template if provided
    let templateContent = "";
    if (templateId) {
      const template = await prisma.evaluationTemplate.findFirst({
        where: { id: templateId, userId: user.id },
      });
      if (template) templateContent = template.content;
    }

    // Build student context
    const iep = student.ieps[0];
    const goals = iep?.goals ?? [];
    const dob = student.dateOfBirth
      ? new Date(student.dateOfBirth).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "Unknown";
    const age = student.dateOfBirth
      ? Math.floor(
          (Date.now() - new Date(student.dateOfBirth).getTime()) /
            (1000 * 60 * 60 * 24 * 365.25)
        )
      : null;

    const gradeFormatted = student.gradeLevel
      ? String(student.gradeLevel)
          .replace("GRADE_", "Grade ")
          .replace("KINDERGARTEN", "Kindergarten")
          .replace("PRE_K", "Pre-K")
      : "Unknown";

    const disabilityFormatted = student.disabilityCategory
      ? String(student.disabilityCategory).replace(/_/g, " ")
      : "Not specified";

    const studentContext = `
STUDENT INFORMATION:
- Name: ${student.firstName} ${student.lastName}
- Date of Birth: ${dob}${age ? ` (age ${age})` : ""}
- Grade: ${gradeFormatted}
- School: ${student.schoolName}
- Primary Language: ${student.primaryLanguage}
- Disability Category: ${disabilityFormatted}
- Accommodations: ${student.accommodations || "None documented"}
- Medical Alerts: ${student.medicalAlerts || "None"}
${student.externalProviders ? `- External Providers: ${student.externalProviders}` : ""}

${
  iep
    ? `CURRENT IEP:
- Effective: ${new Date(iep.effectiveDate).toLocaleDateString()}
- Review Date: ${new Date(iep.reviewDate).toLocaleDateString()}
- Service: ${iep.minutesPerWeek ?? "?"} min/week (${iep.serviceLocation ?? "school"})
- Present Levels: ${iep.presentLevels || "Not documented"}
${iep.parentConcerns ? `- Parent Concerns: ${iep.parentConcerns}` : ""}`
    : "No current IEP on file."
}

${
  goals.length > 0
    ? `CURRENT GOALS:
${goals
  .map(
    (g, i) =>
      `${i + 1}. [${g.domain}] ${g.goalText}
   Target: ${g.targetAccuracy != null ? Math.round(g.targetAccuracy * 100) + "%" : "?"}  Baseline: ${g.baselineScore != null ? Math.round(g.baselineScore * 100) + "%" : "?"}`
  )
  .join("\n")}`
    : "No goals on file."
}

${additionalContext ? `ADDITIONAL INFORMATION PROVIDED BY SLP:\n${additionalContext}` : ""}
`.trim();

    const systemPrompt = templateContent
      ? `You are an experienced school-based Speech-Language Pathologist drafting a formal evaluation report.

INSTRUCTIONS:
- Use the following TEMPLATE as your structural guide — match its sections, headings, formatting style, and level of detail exactly.
- Fill in the template with information from the student data provided.
- For any sections where data is not available, write "[INFORMATION NEEDED]" so the SLP knows to fill it in.
- Use professional clinical language appropriate for a school evaluation report.
- Do not invent test scores or specific findings — use the data provided and note gaps.
- Output only the report text, no preamble.

TEMPLATE TO FOLLOW:
${templateContent}`
      : `You are an experienced school-based Speech-Language Pathologist drafting a formal evaluation report.

INSTRUCTIONS:
- Draft a comprehensive speech-language evaluation report using the student data provided.
- Use standard evaluation report sections: Reason for Referral, Background Information, Assessment Methods, Results (by domain), Summary, Eligibility Determination, Recommendations.
- Use professional clinical language appropriate for a school evaluation report.
- For any sections where data is not available, write "[INFORMATION NEEDED]".
- Output only the report text, no preamble.`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Please draft an evaluation report for this student:\n\n${studentContext}`,
        },
      ],
    });

    const draft =
      message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ draft });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Unauthorized" || msg.includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to generate draft" }, { status: 500 });
  }
}
