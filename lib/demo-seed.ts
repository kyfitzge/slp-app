/**
 * Demo seed — called once per new user registration.
 * Populates 4 realistic students with IEPs, goals, sessions,
 * session notes, progress reports, and an evaluation report.
 */

import { prisma } from "@/lib/db";

// ─── Date helpers ────────────────────────────────────────────────────────────

/** Return a date N days before today */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

/** Return a date N days after today */
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Generate a realistic accuracy series: starts near baseline,
 * rises gradually with natural variability, ends near target.
 */
function progressSeries(
  baseline: number,
  target: number,
  sessions: number
): number[] {
  const values: number[] = [];
  for (let i = 0; i < sessions; i++) {
    const t = i / (sessions - 1);
    // Logistic-ish curve with noise
    const trend = baseline + (target - baseline) * (t * t * (3 - 2 * t));
    const noise = (Math.random() - 0.5) * 0.12;
    values.push(Math.min(1, Math.max(0, trend + noise)));
  }
  return values;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function seedDemoData(userId: string): Promise<void> {
  // Idempotent guard — skip if user already has caseload entries
  const existing = await prisma.caseload.count({ where: { userId } });
  if (existing > 0) return;

  const school = "Lincoln Elementary School";

  // ══════════════════════════════════════════════════════════════════
  // STUDENT 1 — Marcus Johnson  |  Grade 3  |  Articulation (/r/)
  // ══════════════════════════════════════════════════════════════════

  const marcus = await prisma.student.create({
    data: {
      firstName: "Marcus",
      lastName: "Johnson",
      dateOfBirth: new Date("2017-08-14"),
      gradeLevel: "GRADE_3",
      schoolName: school,
      disabilityCategory: "SPEECH_LANGUAGE_IMPAIRMENT",
      primaryLanguage: "English",
      parentGuardianName: "Denise Johnson",
      parentGuardianPhone: "(555) 234-5678",
      parentGuardianEmail: "denise.johnson@email.com",
      reevaluationDue: daysFromNow(610),
      eligibilityDate: daysAgo(480),
      accommodations:
        "Extended time for oral reading; teacher may provide written instructions alongside verbal directions.",
    },
  });

  await prisma.caseload.create({
    data: { userId, studentId: marcus.id, isPrimary: true },
  });

  const marcusIep = await prisma.iEP.create({
    data: {
      studentId: marcus.id,
      status: "ACTIVE",
      effectiveDate: daysAgo(148),
      reviewDate: daysFromNow(217),
      expirationDate: daysFromNow(217),
      minutesPerWeek: 60,
      individualMinutes: 30,
      groupMinutes: 30,
      serviceLocation: "Pull-out (speech room)",
      presentLevels:
        "Marcus is a 9-year-old male enrolled in 3rd grade. He was initially referred for speech-language evaluation due to persistent /r/ errors noted by his classroom teacher and parent. Formal assessment via the Goldman-Fristoe Test of Articulation-3 (GFTA-3) revealed consistent substitution and distortion errors for /r/ in all word positions (prevocalic, intervocalic, postvocalic) with a standard score of 78 (7th percentile). Mild errors were also noted for /r/-blends (e.g., \"street,\" \"spray\"). His articulation errors affect intelligibility with unfamiliar listeners, estimated at approximately 80% with familiar listeners and 60% with unfamiliar listeners in connected speech. Marcus demonstrates strong metalinguistic awareness and is motivated to improve his speech.",
      parentConcerns:
        "Mother reports Marcus is occasionally teased by peers about his speech. She practices at home using materials provided and is highly engaged.",
    },
  });

  const marcusGoal1 = await prisma.goal.create({
    data: {
      studentId: marcus.id,
      iepId: marcusIep.id,
      domain: "ARTICULATION",
      status: "ACTIVE",
      goalText:
        "Marcus will produce the /r/ phoneme in all word positions (prevocalic, intervocalic, and postvocalic) with 80% or greater accuracy across 3 consecutive data collection sessions, given minimal verbal cues.",
      shortName: "/r/ production",
      targetAccuracy: 0.8,
      targetTrials: 20,
      targetConsecutive: 3,
      baselineDate: daysAgo(145),
      baselineScore: 0.15,
      baselineNotes:
        "Assessed via GFTA-3 and structured probe. Errors consistent across all positions. Best performance in syllable-level drill.",
    },
  });

  const marcusGoal2 = await prisma.goal.create({
    data: {
      studentId: marcus.id,
      iepId: marcusIep.id,
      domain: "ARTICULATION",
      status: "ACTIVE",
      goalText:
        "Marcus will produce /r/-blends (including /br/, /dr/, /gr/, /pr/, /str/, /spr/) at the word and phrase level with 80% accuracy, given indirect verbal cues or less.",
      shortName: "/r/-blends",
      targetAccuracy: 0.8,
      targetTrials: 20,
      baselineDate: daysAgo(145),
      baselineScore: 0.28,
    },
  });

  // Schedule: Mon/Wed, 30 min individual
  const marcusSched = await prisma.scheduleEntry.create({
    data: {
      userId,
      title: "Marcus Johnson — Articulation",
      sessionType: "INDIVIDUAL",
      frequency: "WEEKLY",
      dayOfWeek: 1, // Monday
      startTime: "09:00",
      durationMins: 30,
      startDate: daysAgo(100),
      location: "Speech Room 104",
      scheduleStudents: { create: { studentId: marcus.id } },
    },
  });

  // 18 past sessions (Mon/Wed pattern over ~9 weeks)
  const marcusSessionDates = [
    100, 95, 88, 81, 74, 67, 60, 53, 46, 39, 32, 25, 18, 11, 7, 4,
  ].map(daysAgo);

  const marcusR = progressSeries(0.15, 0.58, marcusSessionDates.length);
  const marcusBlend = progressSeries(0.28, 0.68, marcusSessionDates.length);

  const marcusNotes = [
    "Marcus worked on prevocalic /r/ in CV and CVC syllables. He responded well to the oral-motor placement cues. Required consistent modeling. Strong effort throughout.",
    "Continued prevocalic /r/ at syllable level. Introduced /r/ in initial position word cards. Marcus showed frustration initially but self-corrected with encouragement. Sent home word cards for practice.",
    "Target: initial /r/ words. Marcus achieved 40% accuracy with direct modeling. Practiced 'rabbit,' 'rain,' 'road.' He is beginning to self-monitor errors. Homework: 5 minutes nightly with provided list.",
    "Great session — Marcus hit 55% on initial /r/ words independently. Introduced /r/ in medial position (e.g., 'arrow,' 'carrot'). Cues faded slightly. He found 'arrow' particularly difficult.",
    "Reviewed medial /r/. Progress continues. Introduced minimal pair contrast activities (e.g., 'wed' vs 'red'). Marcus engaged well with game-based drill.",
    "Worked on final /r/ (e.g., 'car,' 'star,' 'bear'). New position = more errors expected. Baseline for final position: ~20%. Introduced phonetic placement cues for retroflex /r/.",
    "Mixed positions — initial, medial, and final /r/ in structured activities. Accuracy improving in initial position; medial and final position still developing. Reviewed home practice log — family reporting consistent practice.",
    "Introduced /r/ in phrases ('red rose,' 'rainy day'). Marcus generalized initial /r/ better than expected. Continued final position drill. Discussed with classroom teacher re: gentle reminders during class discussions.",
    "Phrase-level /r/ practice. Marcus is now self-monitoring in phrases with familiar content. Introduced short carrier phrases to target /r/ in varied phonetic contexts.",
    "Worked on /r/ in simple sentences. Marcus showed 50%+ accuracy in structured sentence production. Began /r/-blend introduction: 'bride,' 'green,' 'dream.'",
    "Focused on /r/-blends at word level. Marcus attempted /br/, /gr/, and /dr/ blends. Accuracy variable but above baseline. He finds /dr/ the most challenging.",
    "Continued /r/-blends drill. Added 'prize,' 'present,' 'drop,' 'grass.' Marcus is motivated — brought in a list of his own /r/ words from home. Excellent self-monitoring.",
    "Connected speech sample collected. Spontaneous /r/ accuracy in conversation: ~45%. Structured drill remains at ~58%. Gap between structured and spontaneous is expected and narrowing.",
    "Worked on /r/ in narrative retell (short story). Marcus produced 12/20 /r/ targets correctly in the retell — a notable improvement from last quarter. Introduced self-monitoring checklist.",
    "Final /r/ in conversation practice. Used 'turn-taking' game to elicit naturalistic /r/ production. Marcus self-corrected 4 errors spontaneously — a first! Excellent session.",
    "Progress check probe administered: initial /r/ 65%, medial /r/ 48%, final /r/ 42%, /r/-blends 68%. Significant gains across all positions. Discussed findings with Marcus — he was proud.",
  ];

  for (let i = 0; i < marcusSessionDates.length; i++) {
    const sess = await prisma.session.create({
      data: {
        userId,
        scheduleEntryId: marcusSched.id,
        sessionType: "INDIVIDUAL",
        sessionDate: marcusSessionDates[i],
        startTime: "09:00",
        durationMins: 30,
        location: "Speech Room 104",
        generalNotes: marcusNotes[i] ?? null,
      },
    });

    await prisma.sessionStudent.create({
      data: { sessionId: sess.id, studentId: marcus.id, attendance: "PRESENT" },
    });

    await prisma.sessionNote.create({
      data: {
        sessionId: sess.id,
        studentId: marcus.id,
        noteText: marcusNotes[i],
        isLocked: i < marcusSessionDates.length - 3,
      },
    });

    await prisma.goalDataPoint.create({
      data: {
        goalId: marcusGoal1.id,
        sessionId: sess.id,
        accuracy: marcusR[i],
        trialsTotal: 20,
        trialsCorrect: Math.round(marcusR[i] * 20),
        cueingLevel: marcusR[i] < 0.4 ? "DIRECT_VERBAL" : marcusR[i] < 0.65 ? "INDIRECT_VERBAL" : "GESTURAL",
        collectedAt: marcusSessionDates[i],
      },
    });

    await prisma.goalDataPoint.create({
      data: {
        goalId: marcusGoal2.id,
        sessionId: sess.id,
        accuracy: marcusBlend[i],
        trialsTotal: 20,
        trialsCorrect: Math.round(marcusBlend[i] * 20),
        cueingLevel: marcusBlend[i] < 0.5 ? "DIRECT_VERBAL" : "INDIRECT_VERBAL",
        collectedAt: marcusSessionDates[i],
      },
    });
  }

  // Marcus progress report — Q1
  await prisma.progressSummary.create({
    data: {
      userId,
      studentId: marcus.id,
      iepId: marcusIep.id,
      periodLabel: "Q1 Progress Report",
      periodStartDate: daysAgo(100),
      periodEndDate: daysAgo(10),
      isDraft: false,
      finalizedAt: daysAgo(9),
      summaryText:
        "Marcus has made commendable progress toward his articulation goals this quarter. He began the period producing /r/ at approximately 15% accuracy across all word positions with maximal cueing. As of this reporting period, he is demonstrating approximately 55–60% accuracy for initial and medial /r/ in structured word and phrase-level tasks with indirect verbal cues, and approximately 42% accuracy in final position. He has also made meaningful gains on /r/-blends, now achieving approximately 65–68% accuracy at the word level.\n\nMarcus attends sessions consistently and is highly motivated. He has begun self-monitoring his productions in structured activities and occasionally self-corrects during connected speech. Family follow-through with home practice is excellent and is contributing to his progress.\n\nContinued focus will be placed on /r/ in medial and final positions, increasing contextual complexity, and bridging gains to conversational speech. Marcus is making steady progress toward his annual goal.",
      goalSnapshots: [
        {
          goalId: marcusGoal1.id,
          shortName: "/r/ production",
          targetAccuracy: 0.8,
          baselineScore: 0.15,
          currentAccuracy: 0.56,
          dataPointCount: 12,
          trend: "improving",
        },
        {
          goalId: marcusGoal2.id,
          shortName: "/r/-blends",
          targetAccuracy: 0.8,
          baselineScore: 0.28,
          currentAccuracy: 0.66,
          dataPointCount: 12,
          trend: "improving",
        },
      ],
    },
  });

  // ══════════════════════════════════════════════════════════════════
  // STUDENT 2 — Lily Chen  |  Grade 1  |  Language (Expressive + Receptive)
  // ══════════════════════════════════════════════════════════════════

  const lily = await prisma.student.create({
    data: {
      firstName: "Lily",
      lastName: "Chen",
      dateOfBirth: new Date("2019-03-22"),
      gradeLevel: "GRADE_1",
      schoolName: school,
      disabilityCategory: "SPEECH_LANGUAGE_IMPAIRMENT",
      primaryLanguage: "English",
      parentGuardianName: "Wei Chen",
      parentGuardianPhone: "(555) 876-5432",
      parentGuardianEmail: "wei.chen@email.com",
      reevaluationDue: daysFromNow(395),
      eligibilityDate: daysAgo(300),
      accommodations:
        "Preferential seating near the teacher; directions given both verbally and in writing; additional processing time allowed.",
      externalProviders: "Private OT services weekly — Riverside Therapy Center",
    },
  });

  await prisma.caseload.create({
    data: { userId, studentId: lily.id, isPrimary: true },
  });

  const lilyIep = await prisma.iEP.create({
    data: {
      studentId: lily.id,
      status: "ACTIVE",
      effectiveDate: daysAgo(210),
      reviewDate: daysFromNow(155),
      expirationDate: daysFromNow(155),
      minutesPerWeek: 90,
      individualMinutes: 30,
      groupMinutes: 60,
      serviceLocation: "Pull-out (speech room) and push-in (classroom)",
      presentLevels:
        "Lily is a 7-year-old female enrolled in 1st grade. She was referred for speech-language evaluation due to teacher and parent concerns regarding delayed language development. Formal assessment revealed weaknesses in both receptive and expressive language. On the Clinical Evaluation of Language Fundamentals-5 (CELF-5), Lily obtained a Core Language Score of 74 (4th percentile), a Receptive Language Index of 76 (5th percentile), and an Expressive Language Index of 72 (3rd percentile). Specific weaknesses were noted in following complex directions, sentence assembly, word structure, and recalling sentences. Lily's mean length of utterance (MLU) in a language sample was 4.2 morphemes, below the expected range for her age (~7.5 morphemes). She frequently omits grammatical morphemes (past tense -ed, plural -s, copula 'is/are') and demonstrates word retrieval difficulties.",
      parentConcerns:
        "Parents report difficulty understanding Lily compared to her older sibling at the same age. They note she often uses gestures when she cannot find the word. They are bilingual (Mandarin at home, English at school) and want to ensure they are supporting both languages.",
    },
  });

  const lilyGoal1 = await prisma.goal.create({
    data: {
      studentId: lily.id,
      iepId: lilyIep.id,
      domain: "LANGUAGE_COMPREHENSION",
      status: "ACTIVE",
      goalText:
        "Lily will follow two-step unrelated directions containing basic concepts (e.g., 'Before you hand me the book, pick up the pencil') with 80% accuracy across 3 consecutive sessions, given no more than one repetition.",
      shortName: "Following directions",
      targetAccuracy: 0.8,
      targetTrials: 10,
      targetConsecutive: 3,
      baselineDate: daysAgo(208),
      baselineScore: 0.3,
      baselineNotes:
        "Baseline from CELF-5 Following Directions subtest and in-session probe. Two-step unrelated directions with basic concepts = ~30%.",
    },
  });

  const lilyGoal2 = await prisma.goal.create({
    data: {
      studentId: lily.id,
      iepId: lilyIep.id,
      domain: "LANGUAGE_EXPRESSION",
      status: "ACTIVE",
      goalText:
        "Lily will produce grammatically complete sentences containing regular past tense (-ed), plural -s, and copula 'is/are' with 80% accuracy in structured activities and 70% accuracy in conversational speech.",
      shortName: "Grammatical morphemes",
      targetAccuracy: 0.8,
      targetTrials: 20,
      baselineDate: daysAgo(208),
      baselineScore: 0.22,
      baselineNotes:
        "Language sample analysis: past tense -ed obligatory contexts 18% accuracy, plural -s 28%, copula 20%. Baseline composite ~22%.",
    },
  });

  const lilyGoal3 = await prisma.goal.create({
    data: {
      studentId: lily.id,
      iepId: lilyIep.id,
      domain: "LANGUAGE_EXPRESSION",
      status: "ACTIVE",
      goalText:
        "Lily will use category names, descriptors, and semantic associations to retrieve and label targeted vocabulary words with 75% accuracy across a variety of topics, given semantic or phonemic cueing.",
      shortName: "Word retrieval / vocabulary",
      targetAccuracy: 0.75,
      targetTrials: 20,
      baselineDate: daysAgo(208),
      baselineScore: 0.35,
    },
  });

  const lilySched = await prisma.scheduleEntry.create({
    data: {
      userId,
      title: "Lily Chen — Language Group",
      sessionType: "GROUP",
      frequency: "WEEKLY",
      dayOfWeek: 2, // Tuesday
      startTime: "10:30",
      durationMins: 30,
      startDate: daysAgo(90),
      location: "Speech Room 104",
      scheduleStudents: { create: { studentId: lily.id } },
    },
  });

  const lilyDates = [90, 83, 76, 69, 62, 55, 48, 41, 34, 27, 20, 13, 6].map(daysAgo);
  const lilyDir = progressSeries(0.3, 0.72, lilyDates.length);
  const lilyGram = progressSeries(0.22, 0.61, lilyDates.length);
  const lilyWord = progressSeries(0.35, 0.65, lilyDates.length);

  const lilyNotes = [
    "Introduced following two-step directions using manipulatives. Lily required 2–3 repetitions for most items. Used visual supports to scaffold comprehension. Engaged and cooperative.",
    "Continued two-step directions. Added size and color concepts. Lily improving with visual supports in place. Began targeting past tense -ed with regular verbs (jumped, walked, played).",
    "Past tense -ed: targeted in structured sentence completion. Lily produced 'jumpted' and 'walkded' — overgeneralization pattern indicates developing rule awareness. Positive sign.",
    "Mixed session: directions + grammar. Lily successfully followed 5/8 two-step directions without repetition — improvement noted. Past tense -ed accuracy increasing in drill.",
    "Introduced plural -s in contrast activities (e.g., 'one cat / two cats'). Lily grasps the concept but inconsistent in carryover. Began word retrieval activities using semantic mapping.",
    "Word retrieval: semantic category sorting. Lily identified category membership well but struggled to retrieve specific items under time pressure. Used phonemic cuing (first sound) effectively.",
    "Copula 'is/are' introduced via sentence starters. Lily produced 'The dog is running' consistently with model; 'The dogs are playing' more variable. Directions target hit 60% today — great session!",
    "Role-play activity: giving and following directions in 'classroom helper' scenario. Lily showed excellent comprehension of two-step directions in naturalistic context. Grammar less consistent in play.",
    "Language sample collected during structured play. MLU = 5.1 morphemes (up from 4.2 at baseline). Past tense -ed accuracy in sample ~48%. Clear growth trend.",
    "Vocabulary unit: animals and habitats. Lily used category labels independently and connected new vocabulary to prior knowledge. Word retrieval latency decreasing.",
    "Push-in observation: Lily followed teacher's two-step directions accurately 3/4 times during calendar routine — generalization emerging! Reported to classroom teacher.",
    "Sentence assembly tasks. Lily constructed 7/10 target sentences correctly with a sentence strip scaffold. Errors on copula with plural subjects ('The cats is'). Addressed explicitly.",
    "End-of-quarter review probe. Directions: 70% accuracy (near target!). Grammar morphemes: 60%. Word retrieval: 62%. Strong quarter — shared data with parent via communication log.",
  ];

  for (let i = 0; i < lilyDates.length; i++) {
    const sess = await prisma.session.create({
      data: {
        userId,
        scheduleEntryId: lilySched.id,
        sessionType: "GROUP",
        sessionDate: lilyDates[i],
        startTime: "10:30",
        durationMins: 30,
        location: "Speech Room 104",
      },
    });

    await prisma.sessionStudent.create({
      data: { sessionId: sess.id, studentId: lily.id, attendance: "PRESENT" },
    });

    await prisma.sessionNote.create({
      data: {
        sessionId: sess.id,
        studentId: lily.id,
        noteText: lilyNotes[i] ?? "",
        isLocked: i < lilyDates.length - 2,
      },
    });

    await prisma.goalDataPoint.create({
      data: {
        goalId: lilyGoal1.id,
        sessionId: sess.id,
        accuracy: lilyDir[i],
        trialsTotal: 10,
        trialsCorrect: Math.round(lilyDir[i] * 10),
        cueingLevel: lilyDir[i] < 0.5 ? "DIRECT_VERBAL" : "INDIRECT_VERBAL",
        collectedAt: lilyDates[i],
      },
    });

    await prisma.goalDataPoint.create({
      data: {
        goalId: lilyGoal2.id,
        sessionId: sess.id,
        accuracy: lilyGram[i],
        trialsTotal: 20,
        trialsCorrect: Math.round(lilyGram[i] * 20),
        cueingLevel: lilyGram[i] < 0.45 ? "MODELING" : "DIRECT_VERBAL",
        collectedAt: lilyDates[i],
      },
    });

    await prisma.goalDataPoint.create({
      data: {
        goalId: lilyGoal3.id,
        sessionId: sess.id,
        accuracy: lilyWord[i],
        trialsTotal: 20,
        trialsCorrect: Math.round(lilyWord[i] * 20),
        cueingLevel: "INDIRECT_VERBAL",
        collectedAt: lilyDates[i],
      },
    });
  }

  // Lily evaluation report (recent triennial)
  await prisma.evaluationReport.create({
    data: {
      userId,
      studentId: lily.id,
      title: "Triennial Evaluation — Lily Chen",
      status: "final",
      content: `STUDENT & REFERRAL INFORMATION:
Student Name: Lily Chen
Date of Birth: March 22, 2019   Age: 7 years, 1 month
Grade: 1st Grade   School: Lincoln Elementary School
Evaluator: SLP   Evaluation Dates: Conducted over two sessions
Referral Source: Annual review — triennial evaluation required per IDEA

BACKGROUND INFORMATION:
Lily was initially evaluated and found eligible for speech-language services in November 2023 due to expressive and receptive language delays. She has been receiving pull-out individual and group services since that time. Lily lives at home with her parents and older sibling. Mandarin Chinese is spoken in the home; Lily is exposed to English primarily through school. Parents report continued progress but ongoing concerns about vocabulary and sentence complexity compared to her older sibling at the same age. No significant medical history. Hearing and vision screened annually — within normal limits. Lily receives private occupational therapy services weekly for fine motor concerns.

ASSESSMENT METHODS:
Methods: CELF-5, GFTA-3, PPVT-5, EVT-3, Language sample
Notes: Evaluation conducted across two 45-minute sessions. Lily was cooperative and engaged throughout. All results are considered valid and representative of current abilities. No modifications were required. Interpreter was not used as Lily demonstrated adequate English proficiency for standardized testing.

BEHAVIORAL OBSERVATIONS:
Lily presented as a friendly and cooperative child who established rapport quickly. She required frequent encouragement during more difficult tasks but persisted with prompting. Attention was generally sustained; brief breaks were offered between subtests. She frequently used gestures and pointing when word retrieval was effortful. No concerns regarding hearing acuity during the evaluation.

COMMUNICATION AREAS ASSESSED:
Articulation / Phonology: Assessed
Findings: Speech sound production was screened using the GFTA-3. Lily's articulation was within normal limits for her age. No phonological error patterns were noted. Speech intelligibility was 100% to an unfamiliar examiner.
Receptive Language: Assessed
Findings: Receptive language was assessed via the CELF-5 Receptive Language Index and the PPVT-5. Lily obtained a Receptive Language Index of 76 (5th percentile, Below Average). Specific weaknesses were noted in Following Directions and Sentence Structure subtests. PPVT-5 standard score: 82 (12th percentile).
Expressive Language: Assessed
Findings: Expressive language was assessed via the CELF-5 Expressive Language Index, EVT-3, and a spontaneous language sample. Expressive Language Index: 72 (3rd percentile, Below Average). EVT-3 standard score: 79 (8th percentile). Language sample MLU: 5.1 morphemes (below age expectation of ~7.5). Grammatical morpheme errors noted for past tense -ed, plural -s, and copula is/are.
Pragmatics / Social Communication: Assessed
Findings: Pragmatic language observed during structured and unstructured interactions. Lily demonstrated appropriate eye contact, turn-taking, and topic maintenance in familiar contexts. No significant pragmatic concerns identified.
Fluency: Not Assessed
Voice: Not Assessed

TEST RESULTS & FINDINGS:
Test Scores:
| CELF-5 Core Language Score | 74 | 4th | Below Average |
| CELF-5 Receptive Language Index | 76 | 5th | Below Average |
| CELF-5 Expressive Language Index | 72 | 3rd | Below Average |
| CELF-5 Following Directions | 6 | 9th | Below Average |
| CELF-5 Sentence Structure | 5 | 5th | Below Average |
| CELF-5 Word Structure | 5 | 5th | Below Average |
| CELF-5 Recalling Sentences | 4 | 2nd | Below Average |
| PPVT-5 (Receptive Vocabulary) | 82 | 12th | Low Average |
| EVT-3 (Expressive Vocabulary) | 79 | 8th | Below Average |
Interpretation:
Lily's standardized scores reveal consistent weaknesses across receptive and expressive language domains. Her Core Language Score of 74 falls at the 4th percentile, representing a statistically significant and educationally meaningful deficit compared to same-age peers. Receptive weaknesses are most pronounced for following complex directions and understanding syntactic structures. Expressive weaknesses include grammatical morpheme use, sentence length/complexity, and word retrieval. These findings are consistent with the initial evaluation and indicate that language difficulties persist despite ongoing intervention. Progress has been documented on all IEP goals, confirming that Lily responds to intervention and that continued services are appropriate.

INFORMAL ASSESSMENT & LANGUAGE SAMPLE:
A spontaneous language sample of 100+ utterances was elicited during structured play with a dollhouse and farm set. Mean length of utterance (MLU) was calculated at 5.1 morphemes, below the expected range of approximately 7.5 morphemes for a 7-year-old. Grammatical morpheme errors were noted in obligatory contexts: past tense -ed (48% accuracy), plural -s (60% accuracy), and copula is/are (52% accuracy). Type-token ratio was 0.41, indicating mild restricted vocabulary diversity. Lily used a variety of sentence types including simple declaratives, questions, and some negatives. No significant phonological errors were noted in the sample.

HEARING, VISION & RELATED FACTORS:
Hearing was screened at 20 dB HL at 500, 1000, 2000, and 4000 Hz bilaterally — passed. Vision screened by school nurse in September — within normal limits. No history of chronic otitis media reported. Private OT services ongoing for fine motor concerns; no neurological or medical diagnoses reported.

SUMMARY & CLINICAL INTERPRETATION:
Lily continues to present with a clinically significant language disorder affecting both receptive and expressive language abilities. Standardized testing confirms that her language skills remain below age expectations across multiple domains, including vocabulary knowledge, grammatical accuracy, sentence complexity, and the ability to process and follow multi-step directions. She has demonstrated measurable progress on IEP goals since her initial evaluation, confirming that she is responding to intervention. Her language difficulties are not attributable to limited English exposure alone, as her profile reflects a consistent pattern of deficit across language areas rather than a second-language acquisition pattern. Lily's bilingual background has been considered in the interpretation of these results.

EDUCATIONAL IMPACT & ELIGIBILITY:
Lily's language disorder adversely affects her educational performance. Difficulties following complex directions impact her ability to independently complete multi-step classroom tasks. Limited grammatical accuracy and reduced sentence complexity affect the quality of her oral and written language output, which is increasingly expected as academic demands grow in 1st grade and beyond. Vocabulary weaknesses affect comprehension of grade-level text and participation in content-area instruction. Lily continues to meet eligibility criteria for special education services under the category of Speech-Language Impairment under IDEA.

RECOMMENDATIONS:
1. Continue eligibility for special education speech-language services under the category of Speech-Language Impairment.
2. Continue individual pull-out sessions (30 min/week) targeting grammatical morpheme production and sentence complexity.
3. Continue small-group push-in sessions (60 min/week) targeting receptive language, vocabulary, and functional communication within the classroom context.
4. Update IEP goals to reflect current performance levels and increase targets as appropriate.
5. Consult with classroom teacher quarterly to monitor generalization of therapy targets to the classroom.
6. Provide home practice materials targeting vocabulary and grammatical structures; continue parent education regarding bilingual language development.
7. Re-evaluate in 3 years or sooner if concerns arise.`,
    },
  });

  // Lily progress report
  await prisma.progressSummary.create({
    data: {
      userId,
      studentId: lily.id,
      iepId: lilyIep.id,
      periodLabel: "Q1 Progress Report",
      periodStartDate: daysAgo(90),
      periodEndDate: daysAgo(7),
      isDraft: false,
      finalizedAt: daysAgo(6),
      summaryText:
        "Lily has made meaningful progress across all three of her language goals this quarter. She began the period demonstrating 30% accuracy for following two-step unrelated directions; she is now achieving approximately 70% accuracy — approaching her annual goal target. This improvement is also evident in the classroom, where her teacher has noted that Lily follows two-step instructions during routines with increasing independence.\n\nOn the grammatical morphemes goal, Lily has progressed from a 22% baseline to approximately 60% accuracy in structured activities. She continues to show the overgeneralization of past tense -ed (e.g., 'runned') which indicates active rule learning. Copula 'is/are' with plural subjects remains an area for continued focus.\n\nWord retrieval and vocabulary accuracy have improved from 35% to approximately 62%, with decreased word-finding latency and more frequent use of semantic associations and category labels as retrieval strategies.\n\nLily attends consistently and is engaged in sessions. Her MLU increased from 4.2 to 5.1 morphemes as measured by spontaneous language sample — a significant gain. Plans for next quarter include increasing syntactic complexity targets and fading cueing supports.",
      goalSnapshots: [
        {
          goalId: lilyGoal1.id,
          shortName: "Following directions",
          targetAccuracy: 0.8,
          baselineScore: 0.3,
          currentAccuracy: 0.7,
          dataPointCount: 13,
          trend: "improving",
        },
        {
          goalId: lilyGoal2.id,
          shortName: "Grammatical morphemes",
          targetAccuracy: 0.8,
          baselineScore: 0.22,
          currentAccuracy: 0.6,
          dataPointCount: 13,
          trend: "improving",
        },
        {
          goalId: lilyGoal3.id,
          shortName: "Word retrieval / vocabulary",
          targetAccuracy: 0.75,
          baselineScore: 0.35,
          currentAccuracy: 0.62,
          dataPointCount: 13,
          trend: "improving",
        },
      ],
    },
  });

  // ══════════════════════════════════════════════════════════════════
  // STUDENT 3 — Aiden Torres  |  Grade 5  |  ASD + Social Language
  // ══════════════════════════════════════════════════════════════════

  const aiden = await prisma.student.create({
    data: {
      firstName: "Aiden",
      lastName: "Torres",
      dateOfBirth: new Date("2014-11-05"),
      gradeLevel: "GRADE_5",
      schoolName: school,
      disabilityCategory: "AUTISM_SPECTRUM_DISORDER",
      primaryLanguage: "English",
      parentGuardianName: "Maria Torres",
      parentGuardianPhone: "(555) 345-6789",
      parentGuardianEmail: "m.torres@email.com",
      reevaluationDue: daysFromNow(185),
      eligibilityDate: daysAgo(730),
      accommodations:
        "Preferential seating; use of visual schedules and supports; extended processing time; breaks as needed; low-stimulation testing environment; social stories for transitions.",
      medicalAlerts: "Sensory sensitivities to loud noise — headphones available.",
      externalProviders: "ABA therapy — Spectrum Learning Center (10 hrs/week)",
    },
  });

  await prisma.caseload.create({
    data: { userId, studentId: aiden.id, isPrimary: true },
  });

  const aidenIep = await prisma.iEP.create({
    data: {
      studentId: aiden.id,
      status: "ACTIVE",
      effectiveDate: daysAgo(270),
      reviewDate: daysFromNow(95),
      expirationDate: daysFromNow(95),
      minutesPerWeek: 60,
      individualMinutes: 30,
      groupMinutes: 30,
      serviceLocation: "Pull-out (speech room) and lunch group (cafeteria)",
      presentLevels:
        "Aiden is an 11-year-old male enrolled in 5th grade who receives speech-language services under the primary disability of Autism Spectrum Disorder. Aiden demonstrates relative strengths in vocabulary knowledge (PPVT-5: 98, 45th percentile) and rote factual recall. Areas of concern include pragmatic language, perspective-taking, narrative organization, and flexible topic management in conversation. On the CELF-5 Pragmatics Profile, Aiden scored below the 10th percentile for his age. He demonstrates difficulty initiating conversation with peers, maintaining topics introduced by others, understanding non-literal language (idioms, sarcasm), and repairing communication breakdowns. He benefits from explicit instruction, visual supports, and structured social opportunities.",
      parentConcerns:
        "Mother reports that Aiden wants to have friends but struggles with knowing what to say and how to join in. He frequently talks about his special interests (trains, weather systems) without checking in with his communication partner.",
    },
  });

  const aidenGoal1 = await prisma.goal.create({
    data: {
      studentId: aiden.id,
      iepId: aidenIep.id,
      domain: "PRAGMATICS",
      status: "ACTIVE",
      goalText:
        "Aiden will initiate a topic of conversation with a peer or adult, maintain the topic for at least 3 conversational turns, and appropriately transition to a new topic, with 70% success across 3 consecutive observed opportunities.",
      shortName: "Topic maintenance",
      targetAccuracy: 0.7,
      targetTrials: 5,
      targetConsecutive: 3,
      baselineDate: daysAgo(268),
      baselineScore: 0.2,
      baselineNotes:
        "Observed in structured conversation group and unstructured lunch. Aiden rarely sustains topics introduced by others beyond 1 turn. Initiates about own interests frequently but does not check for listener interest.",
    },
  });

  const aidenGoal2 = await prisma.goal.create({
    data: {
      studentId: aiden.id,
      iepId: aidenIep.id,
      domain: "LANGUAGE_EXPRESSION",
      status: "ACTIVE",
      goalText:
        "Aiden will produce a 5+ sentence narrative (personal or fictional) that includes a clear beginning, problem, and resolution, with all required story grammar elements present, with 70% accuracy across structured narrative tasks.",
      shortName: "Narrative structure",
      targetAccuracy: 0.7,
      targetTrials: 5,
      baselineDate: daysAgo(268),
      baselineScore: 0.25,
      baselineNotes:
        "Narrative retell (Frog Story) included setting and some action but lacked clear problem/resolution. Personal narratives tended to be lists of events without causal connections.",
    },
  });

  const aidenSched = await prisma.scheduleEntry.create({
    data: {
      userId,
      title: "Aiden Torres — Social Language",
      sessionType: "INDIVIDUAL",
      frequency: "WEEKLY",
      dayOfWeek: 4, // Thursday
      startTime: "11:00",
      durationMins: 30,
      startDate: daysAgo(85),
      location: "Speech Room 104",
      scheduleStudents: { create: { studentId: aiden.id } },
    },
  });

  const aidenDates = [85, 78, 71, 64, 57, 50, 43, 36, 29, 22, 15, 8].map(daysAgo);
  const aidenTopic = progressSeries(0.2, 0.55, aidenDates.length);
  const aidenNarr = progressSeries(0.25, 0.6, aidenDates.length);

  const aidenNotes = [
    "Introduced the SODA strategy (Situation, Options, Disadvantages/Advantages, Do it). Aiden was receptive and found the structured framework helpful. Practiced identifying conversation topics that both speakers might enjoy.",
    "Role-played conversation initiation with topic selection activity. Aiden chose weather and trains (special interests). Practiced asking 'Are you interested in ___?' before launching into monologue. Required frequent redirection.",
    "Narrative: introduced story grammar map. Aiden filled in character and setting independently. Struggled to identify the 'problem' — often described events rather than conflicts. Modeled and practiced.",
    "Topic maintenance game: each 'turn' earns a token; interrupting or topic-shifting loses one. Aiden earned 6/10 tokens — improvement from baseline. He self-monitored better than expected.",
    "Practiced conversational repair: what to do when a partner looks confused. Aiden identified strategies (ask 'Did that make sense?', add more detail, use an example). Applied in role-play.",
    "Narrative retell from wordless picture book. Aiden included beginning, middle, and end with prompting. Used temporal markers ('first,' 'then') consistently — strength! Resolution still weak.",
    "Social skills group: lunch bunch (Aiden + 2 peers). Facilitated structured conversation about weekend activities. Aiden maintained peer-initiated topic for 4 turns — a first. Celebrated with him afterward.",
    "Idioms and non-literal language: 'break a leg,' 'it's raining cats and dogs,' 'under the weather.' Aiden found these fascinating from a logical analysis perspective — leveraged his strength. Discussed contextual cues.",
    "Personal narrative about a recent family trip. Aiden produced a 7-sentence narrative with clear beginning and events. Problem/resolution weak but improved. Used story grammar visual with minimal prompting.",
    "Perspective-taking: 'Thought Bubble' activities. Aiden identified that different people can have different thoughts about the same situation — an important insight. Applied to conversation scenarios.",
    "Conversation practice with unfamiliar school staff (arranged). Aiden successfully initiated with the school librarian using a prepared opener. Maintained topic for 3+ turns. Very proud — called mother to tell her.",
    "End-of-quarter review. Topic maintenance: 52% across observed opportunities (up from 20%). Narrative: 58% on structured tasks. Discussed growth with Aiden using data chart — he responded positively to visual feedback.",
  ];

  for (let i = 0; i < aidenDates.length; i++) {
    const sess = await prisma.session.create({
      data: {
        userId,
        scheduleEntryId: aidenSched.id,
        sessionType: "INDIVIDUAL",
        sessionDate: aidenDates[i],
        startTime: "11:00",
        durationMins: 30,
        location: "Speech Room 104",
      },
    });

    await prisma.sessionStudent.create({
      data: { sessionId: sess.id, studentId: aiden.id, attendance: "PRESENT" },
    });

    await prisma.sessionNote.create({
      data: {
        sessionId: sess.id,
        studentId: aiden.id,
        noteText: aidenNotes[i] ?? "",
        isLocked: i < aidenDates.length - 2,
      },
    });

    await prisma.goalDataPoint.create({
      data: {
        goalId: aidenGoal1.id,
        sessionId: sess.id,
        accuracy: aidenTopic[i],
        trialsTotal: 5,
        trialsCorrect: Math.round(aidenTopic[i] * 5),
        cueingLevel: aidenTopic[i] < 0.4 ? "DIRECT_VERBAL" : "INDIRECT_VERBAL",
        collectedAt: aidenDates[i],
      },
    });

    await prisma.goalDataPoint.create({
      data: {
        goalId: aidenGoal2.id,
        sessionId: sess.id,
        accuracy: aidenNarr[i],
        trialsTotal: 5,
        trialsCorrect: Math.round(aidenNarr[i] * 5),
        cueingLevel: aidenNarr[i] < 0.4 ? "DIRECT_VERBAL" : "GESTURAL",
        collectedAt: aidenDates[i],
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // STUDENT 4 — Sophie Williams  |  Kindergarten  |  Phonology
  // ══════════════════════════════════════════════════════════════════

  const sophie = await prisma.student.create({
    data: {
      firstName: "Sophie",
      lastName: "Williams",
      dateOfBirth: new Date("2020-07-10"),
      gradeLevel: "KINDERGARTEN",
      schoolName: school,
      disabilityCategory: "SPEECH_LANGUAGE_IMPAIRMENT",
      primaryLanguage: "English",
      parentGuardianName: "Rachel Williams",
      parentGuardianPhone: "(555) 456-7890",
      parentGuardianEmail: "rachel.williams@email.com",
      reevaluationDue: daysFromNow(730),
      eligibilityDate: daysAgo(60),
      accommodations: "Visuals and picture supports for multi-step directions; teacher to face Sophie when speaking.",
    },
  });

  await prisma.caseload.create({
    data: { userId, studentId: sophie.id, isPrimary: true },
  });

  const sophieIep = await prisma.iEP.create({
    data: {
      studentId: sophie.id,
      status: "ACTIVE",
      effectiveDate: daysAgo(55),
      reviewDate: daysFromNow(310),
      expirationDate: daysFromNow(310),
      minutesPerWeek: 60,
      individualMinutes: 30,
      groupMinutes: 30,
      serviceLocation: "Pull-out (speech room)",
      presentLevels:
        "Sophie is a 5-year-old female in Kindergarten referred by her teacher and parents due to speech sound errors that affect her intelligibility. Formal assessment via the GFTA-3 revealed a standard score of 68 (2nd percentile). Sophie demonstrates the following phonological patterns: fronting of velars /k/ and /g/ (produced as /t/ and /d/), stopping of fricatives /f/, /v/, /s/, /z/ (produced as /p/, /b/, /t/, /d/), and cluster reduction (e.g., 'top' for 'stop'). These patterns are atypical beyond her developmental level. Speech intelligibility is estimated at 60–70% with familiar listeners and approximately 40–50% with unfamiliar listeners in connected speech. Sophie is a bright, energetic child who is motivated and cooperative in sessions.",
      parentConcerns:
        "Parents and grandparents have difficulty understanding Sophie. Her teacher notes peers frequently say 'what?' and Sophie becomes frustrated. Parents are eager to help at home.",
    },
  });

  const sophieGoal1 = await prisma.goal.create({
    data: {
      studentId: sophie.id,
      iepId: sophieIep.id,
      domain: "PHONOLOGY",
      status: "ACTIVE",
      goalText:
        "Sophie will produce velar sounds /k/ and /g/ in word-initial and word-final positions with 80% accuracy across 3 consecutive data collection sessions, given minimal verbal cues.",
      shortName: "Velars /k,g/",
      targetAccuracy: 0.8,
      targetTrials: 20,
      targetConsecutive: 3,
      baselineDate: daysAgo(53),
      baselineScore: 0.1,
      baselineNotes: "Consistent fronting of /k/ and /g/ to /t/ and /d/ in all word positions. No correct productions noted in probe or spontaneous speech sample.",
    },
  });

  const sophieGoal2 = await prisma.goal.create({
    data: {
      studentId: sophie.id,
      iepId: sophieIep.id,
      domain: "PHONOLOGY",
      status: "ACTIVE",
      goalText:
        "Sophie will produce word-initial fricatives /f/ and /s/ at the word level with 75% accuracy, given direct verbal and modeling cues.",
      shortName: "Fricatives /f,s/",
      targetAccuracy: 0.75,
      targetTrials: 20,
      baselineDate: daysAgo(53),
      baselineScore: 0.05,
    },
  });

  const sophieSched = await prisma.scheduleEntry.create({
    data: {
      userId,
      title: "Sophie Williams — Phonology",
      sessionType: "INDIVIDUAL",
      frequency: "WEEKLY",
      dayOfWeek: 3, // Wednesday
      startTime: "08:30",
      durationMins: 30,
      startDate: daysAgo(50),
      location: "Speech Room 104",
      scheduleStudents: { create: { studentId: sophie.id } },
    },
  });

  // Sophie is new — only 7 sessions so far
  const sophieDates = [50, 43, 36, 29, 22, 15, 8].map(daysAgo);
  const sophieVelar = progressSeries(0.1, 0.42, sophieDates.length);
  const sophieFric = progressSeries(0.05, 0.3, sophieDates.length);

  const sophieNotes = [
    "Initial session — established rapport with games and puppets. Introduced velar /k/ in isolation. Sophie was initially reluctant but warmed up quickly. Demonstrated correct tongue placement using mirror. Elicited /k/ in isolation 3x. Very energetic and fun student!",
    "Continued /k/ in isolation and CV syllables ('ka,' 'ki,' 'ko'). Sophie producing /k/ in isolation ~30% with modeling. Introduced tactile cue (touching back of tongue). She responded well. Home practice: mirror work.",
    "Moved to /k/ in initial position of simple words (cat, cup, car, key). Sophie enthusiastic — brought in a stuffed cat! Accuracy in word-initial position ~25% with modeling. Introduced /g/ in isolation.",
    "Great session! Sophie spontaneously said 'cat' correctly when playing with the puppet. Celebrated enthusiastically. /k/ word-initial improving. /g/ in isolation emerging. Cluster reduction targeted briefly ('stop' → 'cop' pattern discussed).",
    "Minimal pairs: 'tea' vs. 'key,' 'dote' vs. 'goat.' Sophie beginning to discriminate auditorily. Production accuracy for /k/ word-initial: ~35% without modeling. She finds the 'back of the mouth' cue helpful.",
    "Introduced /f/ in isolation using visual supports (teeth on lip picture). Sophie said 'I sound like a cat hissing!' Elicited /f/ in isolation consistently. Word-initial /f/: 'fish,' 'fun,' 'four' — ~20% accuracy. /k/ continuing to strengthen.",
    "Review probe. /k/ word-initial: 40% (up from 10%!). /g/: still emerging ~20%. /f/ isolation: 70%; words: 28%. Shared data with parent — mother very encouraged. Sent home minimal pairs homework.",
  ];

  for (let i = 0; i < sophieDates.length; i++) {
    const sess = await prisma.session.create({
      data: {
        userId,
        scheduleEntryId: sophieSched.id,
        sessionType: "INDIVIDUAL",
        sessionDate: sophieDates[i],
        startTime: "08:30",
        durationMins: 30,
        location: "Speech Room 104",
      },
    });

    await prisma.sessionStudent.create({
      data: { sessionId: sess.id, studentId: sophie.id, attendance: "PRESENT" },
    });

    await prisma.sessionNote.create({
      data: {
        sessionId: sess.id,
        studentId: sophie.id,
        noteText: sophieNotes[i] ?? "",
        isLocked: i < sophieDates.length - 2,
      },
    });

    await prisma.goalDataPoint.create({
      data: {
        goalId: sophieGoal1.id,
        sessionId: sess.id,
        accuracy: sophieVelar[i],
        trialsTotal: 20,
        trialsCorrect: Math.round(sophieVelar[i] * 20),
        cueingLevel: "MODELING",
        collectedAt: sophieDates[i],
      },
    });

    await prisma.goalDataPoint.create({
      data: {
        goalId: sophieGoal2.id,
        sessionId: sess.id,
        accuracy: sophieFric[i],
        trialsTotal: 20,
        trialsCorrect: Math.round(sophieFric[i] * 20),
        cueingLevel: "MODELING",
        collectedAt: sophieDates[i],
      },
    });
  }
}
