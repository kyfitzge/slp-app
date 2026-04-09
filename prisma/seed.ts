/**
 * Seed file for development/demo.
 * Creates 1 SLP user, 4 students with IEPs, goals, sessions, and data points.
 *
 * Usage:
 *   npx prisma db seed
 *
 * NOTE: The seed user is NOT created in Supabase Auth — it's Prisma-only.
 * To log in, register via the UI with demo@example.com, which will create
 * the Supabase auth record and then the Prisma user. The seed will not
 * duplicate since createStudent handles caseload creation.
 *
 * Alternatively, run this after registering to populate student/session data
 * tied to your real userId.
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"]! });
const prisma = new PrismaClient({ adapter });

// ── helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding database…");

  // ── User ──────────────────────────────────────────────────────────────────
  // Use SEED_USER_EMAIL env var if set, otherwise fall back to the first user
  // in the database, and finally create a demo user if none exist.
  const targetEmail = process.env["SEED_USER_EMAIL"];
  let user = targetEmail
    ? await prisma.user.findUnique({ where: { email: targetEmail } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        supabaseUserId: "seed-placeholder-00000000-0000-0000-0000-000000000001",
        email: "demo@example.com",
        firstName: "Sarah",
        lastName: "Mitchell",
        credentials: "M.S., CCC-SLP",
        schoolDistrict: "Riverside USD",
      },
    });
  }

  console.log(`  Seeding for user: ${user.firstName} ${user.lastName} (${user.email})`);

  // ── Students ──────────────────────────────────────────────────────────────

  const studentsData = [
    {
      firstName: "Ethan",
      lastName: "Kowalski",
      dateOfBirth: new Date("2016-03-14"),
      gradeLevel: "GRADE_3" as const,
      schoolName: "Riverside Elementary",
      disabilityCategory: "SPEECH_LANGUAGE_IMPAIRMENT" as const,
      iepStatus: "ACTIVE" as const,
      reviewDaysFromNow: 12, // urgent — due soon
      goals: [
        {
          domain: "ARTICULATION" as const,
          shortName: "/r/ articulation",
          goalText:
            "Ethan will produce /r/ in word-initial, word-medial, and word-final positions with 80% accuracy across 3 consecutive sessions in a pull-out setting.",
          targetAccuracy: 0.8,
          baselineScore: 0.32,
          dataPoints: [0.35, 0.4, 0.48, 0.55, 0.6, 0.65, 0.7],
        },
        {
          domain: "LANGUAGE_EXPRESSION" as const,
          shortName: "Sentence elaboration",
          goalText:
            "Ethan will produce complete sentences with 4+ morphemes when describing pictures with 80% accuracy across 3 consecutive sessions.",
          targetAccuracy: 0.8,
          baselineScore: 0.45,
          dataPoints: [0.5, 0.55, 0.6, 0.72, 0.78],
        },
      ],
    },
    {
      firstName: "Maya",
      lastName: "Okonkwo",
      dateOfBirth: new Date("2014-09-02"),
      gradeLevel: "GRADE_5" as const,
      schoolName: "Riverside Elementary",
      disabilityCategory: "AUTISM_SPECTRUM_DISORDER" as const,
      iepStatus: "ACTIVE" as const,
      reviewDaysFromNow: 45, // upcoming but not urgent
      goals: [
        {
          domain: "PRAGMATICS" as const,
          shortName: "Conversational turns",
          goalText:
            "Maya will initiate and maintain a topic across 3+ conversational turns with a peer with 75% accuracy across 3 consecutive sessions.",
          targetAccuracy: 0.75,
          baselineScore: 0.25,
          dataPoints: [0.3, 0.35, 0.4, 0.45, 0.5, 0.55],
        },
        {
          domain: "SOCIAL_COMMUNICATION" as const,
          shortName: "Perspective taking",
          goalText:
            "Maya will identify the feelings and perspectives of story characters with 80% accuracy when provided visual supports.",
          targetAccuracy: 0.8,
          baselineScore: 0.2,
          dataPoints: [0.25, 0.3, 0.38, 0.45, 0.52],
        },
      ],
    },
    {
      firstName: "Liam",
      lastName: "Fernandez",
      dateOfBirth: new Date("2017-11-28"),
      gradeLevel: "GRADE_2" as const,
      schoolName: "Sycamore Creek Elementary",
      disabilityCategory: "SPEECH_LANGUAGE_IMPAIRMENT" as const,
      iepStatus: "IN_REVIEW" as const,
      reviewDaysFromNow: 5, // overdue-ish — very urgent
      goals: [
        {
          domain: "PHONOLOGY" as const,
          shortName: "Final consonant deletion",
          goalText:
            "Liam will suppress the phonological process of final consonant deletion with 80% accuracy at the word and phrase level with minimal cues.",
          targetAccuracy: 0.8,
          baselineScore: 0.15,
          dataPoints: [0.2, 0.28, 0.35, 0.42, 0.5, 0.58, 0.65, 0.72],
        },
      ],
    },
    {
      firstName: "Ava",
      lastName: "Thornton",
      dateOfBirth: new Date("2013-06-17"),
      gradeLevel: "GRADE_6" as const,
      schoolName: "Hillcrest Middle School",
      disabilityCategory: "LEARNING_DISABILITY" as const,
      iepStatus: "ACTIVE" as const,
      reviewDaysFromNow: 90, // plenty of time
      goals: [
        {
          domain: "LANGUAGE_COMPREHENSION" as const,
          shortName: "Following multi-step directions",
          goalText:
            "Ava will follow 3-step oral directions without repetition with 80% accuracy in 3 consecutive sessions in the classroom setting.",
          targetAccuracy: 0.8,
          baselineScore: 0.4,
          dataPoints: [0.45, 0.5, 0.55, 0.62, 0.68, 0.75, 0.8],
        },
        {
          domain: "LITERACY" as const,
          shortName: "Phonemic awareness",
          goalText:
            "Ava will segment spoken words into individual phonemes with 85% accuracy across 3 consecutive sessions.",
          targetAccuracy: 0.85,
          baselineScore: 0.5,
          dataPoints: [0.55, 0.6, 0.65, 0.7, 0.78, 0.85],
          status: "MASTERED" as const,
        },
      ],
    },
  ];

  for (const s of studentsData) {
    // Create student
    const student = await prisma.student.upsert({
      where: {
        // Unique on firstName+lastName+dateOfBirth is not a DB unique constraint,
        // so we use a findFirst + create pattern instead.
        // The upsert below uses a synthetic unique key via email-style id;
        // since there's no such field, we'll just use create and skip if exists.
        id: `seed-${s.lastName.toLowerCase()}-${s.firstName.toLowerCase()}`,
      },
      update: {},
      create: {
        id: `seed-${s.lastName.toLowerCase()}-${s.firstName.toLowerCase()}`,
        firstName: s.firstName,
        lastName: s.lastName,
        dateOfBirth: s.dateOfBirth,
        gradeLevel: s.gradeLevel,
        schoolName: s.schoolName,
        disabilityCategory: s.disabilityCategory,
        primaryLanguage: "English",
      },
    });

    // Caseload join
    await prisma.caseload.upsert({
      where: { userId_studentId: { userId: user.id, studentId: student.id } },
      update: {},
      create: { userId: user.id, studentId: student.id },
    });

    // IEP
    const reviewDate = daysFromNow(s.reviewDaysFromNow);
    const effectiveDate = new Date(reviewDate);
    effectiveDate.setFullYear(effectiveDate.getFullYear() - 1);

    const iep = await prisma.iEP.upsert({
      where: { id: `seed-iep-${student.id}` },
      update: {},
      create: {
        id: `seed-iep-${student.id}`,
        studentId: student.id,
        status: s.iepStatus,
        effectiveDate,
        reviewDate,
        expirationDate: daysFromNow(s.reviewDaysFromNow + 365),
        minutesPerWeek: 60,
        individualMinutes: 30,
        groupMinutes: 30,
        serviceLocation: "Pull-out",
        presentLevels: `${s.firstName} receives speech-language services for documented deficits. See evaluation report for current performance levels.`,
      },
    });

    // Goals + data points
    for (let gi = 0; gi < s.goals.length; gi++) {
      const g = s.goals[gi];
      const goalId = `seed-goal-${student.id}-${gi}`;

      const goal = await prisma.goal.upsert({
        where: { id: goalId },
        update: {},
        create: {
          id: goalId,
          studentId: student.id,
          iepId: iep.id,
          domain: g.domain,
          status: ("status" in g ? g.status : "ACTIVE") as never,
          goalText: g.goalText,
          shortName: g.shortName,
          targetAccuracy: g.targetAccuracy,
          baselineScore: g.baselineScore,
          baselineDate: daysAgo(90),
          sortOrder: gi,
        },
      });

      // Data points spread across last 60 days
      const spacing = Math.floor(60 / g.dataPoints.length);
      for (let di = 0; di < g.dataPoints.length; di++) {
        const dpId = `seed-dp-${goalId}-${di}`;
        await prisma.goalDataPoint.upsert({
          where: { id: dpId },
          update: {},
          create: {
            id: dpId,
            goalId: goal.id,
            accuracy: g.dataPoints[di],
            cueingLevel: di < 3 ? "DIRECT_VERBAL" : di < 6 ? "INDIRECT_VERBAL" : "INDEPENDENT",
            collectedAt: daysAgo(60 - di * spacing),
          },
        });
      }
    }

    console.log(`  Student: ${s.firstName} ${s.lastName} — ${s.goals.length} goal(s)`);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  // Create a few recent sessions (not tied to a schedule entry for simplicity)

  const sessionData = [
    {
      id: "seed-session-1",
      date: daysAgo(1),
      startTime: "09:00",
      durationMins: 30,
      sessionType: "INDIVIDUAL" as const,
      studentKeys: ["seed-kowalski-ethan"],
    },
    {
      id: "seed-session-2",
      date: daysAgo(1),
      startTime: "10:00",
      durationMins: 45,
      sessionType: "GROUP" as const,
      studentKeys: ["seed-okonkwo-maya", "seed-thornton-ava"],
    },
    {
      id: "seed-session-3",
      date: daysAgo(3),
      startTime: "09:30",
      durationMins: 30,
      sessionType: "INDIVIDUAL" as const,
      studentKeys: ["seed-fernandez-liam"],
    },
    {
      id: "seed-session-4",
      date: daysAgo(7),
      startTime: "09:00",
      durationMins: 30,
      sessionType: "INDIVIDUAL" as const,
      studentKeys: ["seed-kowalski-ethan"],
    },
    // Today's session (for dashboard)
    {
      id: "seed-session-today",
      date: new Date(new Date().setHours(0, 0, 0, 0)),
      startTime: "11:00",
      durationMins: 30,
      sessionType: "INDIVIDUAL" as const,
      studentKeys: ["seed-kowalski-ethan"],
    },
  ];

  for (const sd of sessionData) {
    const session = await prisma.session.upsert({
      where: { id: sd.id },
      update: {},
      create: {
        id: sd.id,
        userId: user.id,
        sessionType: sd.sessionType,
        sessionDate: sd.date,
        startTime: sd.startTime,
        durationMins: sd.durationMins,
        location: "Pull-out room",
      },
    });

    for (const studentKey of sd.studentKeys) {
      await prisma.sessionStudent.upsert({
        where: {
          sessionId_studentId: { sessionId: session.id, studentId: studentKey },
        },
        update: {},
        create: {
          sessionId: session.id,
          studentId: studentKey,
          attendance: "PRESENT",
        },
      });
    }

    // Add a note to completed sessions
    if (sd.id !== "seed-session-today") {
      await prisma.sessionNote.upsert({
        where: { id: `seed-note-${sd.id}` },
        update: {},
        create: {
          id: `seed-note-${sd.id}`,
          sessionId: session.id,
          noteText: "Student was engaged and cooperative. Practiced target sounds in structured word-level activities. Good progress noted.",
        },
      });
    }
  }

  console.log(`  Sessions: ${sessionData.length} created`);
  console.log("\nSeed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
