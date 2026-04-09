"use client";

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ReportData } from "./report-builder";

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  text: "#111827",
  muted: "#6B7280",
  border: "#E5E7EB",
  bg: "#F9FAFB",
  primary: "#2563EB",
  primaryLight: "#EFF6FF",
  success: "#059669",
  successLight: "#ECFDF5",
  warning: "#D97706",
  danger: "#DC2626",
  white: "#FFFFFF",
  accent: "#1E40AF",
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.text,
    paddingTop: 44,
    paddingBottom: 44,
    paddingHorizontal: 44,
  },

  // Running header (fixed on every page after page 1)
  runningHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  runningHeaderLeft: { fontSize: 8, color: C.muted },
  runningHeaderRight: { fontSize: 8, color: C.muted, fontFamily: "Helvetica-Bold" },

  // Footer
  footer: {
    position: "absolute",
    bottom: 18,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: C.muted,
  },

  // ── Cover ──
  coverRule: {
    height: 5,
    backgroundColor: C.primary,
    borderRadius: 3,
    marginBottom: 32,
  },
  coverTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    marginBottom: 3,
  },
  coverSubtitle: {
    fontSize: 11,
    color: C.muted,
    marginBottom: 24,
  },
  coverInfoBlock: {
    backgroundColor: C.bg,
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
  },
  coverRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  coverLabel: { fontSize: 8, color: C.muted, width: 120 },
  coverValue: { fontSize: 8, fontFamily: "Helvetica-Bold", flex: 1 },

  // Session count callout
  countRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  countCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    padding: 10,
    alignItems: "center",
    backgroundColor: C.bg,
  },
  countValue: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.primary,
    marginBottom: 3,
  },
  countLabel: { fontSize: 7, color: C.muted, textAlign: "center" },

  // ── Goals section on cover ──
  goalsSectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  goalCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 5,
    marginBottom: 7,
    overflow: "hidden",
  },
  goalCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  goalCardHeaderLeft: { flex: 1, paddingRight: 8 },
  goalName: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    marginBottom: 1,
  },
  domainTag: {
    fontSize: 7,
    color: C.primary,
  },
  goalMeta: { alignItems: "flex-end" },
  goalTarget: { fontSize: 7.5, color: C.muted },
  goalLatest: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.primary, marginTop: 1 },
  goalLatestGreen: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.success, marginTop: 1 },
  goalBody: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  goalText: {
    fontSize: 8,
    color: C.muted,
    lineHeight: 1.5,
  },

  // ── Session entry ──
  sessionBox: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    marginBottom: 12,
    overflow: "hidden",
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.bg,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sessionNum: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginRight: 8,
  },
  sessionDate: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    marginRight: 8,
  },
  sessionMeta: {
    fontSize: 8,
    color: C.muted,
  },
  sessionAttPresent: { fontSize: 8, color: C.success, fontFamily: "Helvetica-Bold" },
  sessionAttAbsent: { fontSize: 8, color: C.danger },
  sessionAttOther: { fontSize: 8, color: C.warning },
  sessionAttCancelled: { fontSize: 8, color: C.muted },

  sessionBody: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  // Note sub-section
  subLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  noteText: {
    fontSize: 8.5,
    color: C.text,
    lineHeight: 1.6,
    marginBottom: 10,
  },
  noNote: {
    fontSize: 8,
    color: C.muted,
    fontStyle: "italic",
    marginBottom: 8,
  },

  // Goal performance table
  tableWrap: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: C.bg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableHeadCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRowAlt: { backgroundColor: C.bg },
  tableCell: { fontSize: 8, color: C.text },
  tableCellMuted: { fontSize: 8, color: C.muted },
  tableCellGreen: { fontSize: 8, color: C.success, fontFamily: "Helvetica-Bold" },
  tableCellBold: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.text },
});

// ─── Constants ────────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  ARTICULATION: "Articulation",
  PHONOLOGY: "Phonology",
  LANGUAGE_EXPRESSION: "Language (Expressive)",
  LANGUAGE_COMPREHENSION: "Language (Receptive)",
  FLUENCY: "Fluency",
  VOICE: "Voice",
  PRAGMATICS: "Pragmatics",
  AUGMENTATIVE_COMMUNICATION: "AAC",
  LITERACY: "Literacy",
  SOCIAL_COMMUNICATION: "Social Communication",
};

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "Present",
  ABSENT_EXCUSED: "Absent (Excused)",
  ABSENT_UNEXCUSED: "Absent (Unexcused)",
  CANCELLED_SLP: "Cancelled (SLP)",
  CANCELLED_SCHOOL: "Cancelled (School)",
  MAKEUP: "Make-up",
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  GROUP: "Group",
  EVALUATION: "Evaluation",
  RE_EVALUATION: "Re-Evaluation",
  CONSULTATION: "Consultation",
  PARENT_CONFERENCE: "Parent Conference",
};

const CUEING_LABELS: Record<string, string> = {
  INDEPENDENT: "Independent",
  GESTURAL: "Gestural cues",
  INDIRECT_VERBAL: "Indirect verbal",
  DIRECT_VERBAL: "Direct verbal",
  MODELING: "Modeling",
  PHYSICAL: "Physical assist",
  MAXIMUM_ASSISTANCE: "Max. assistance",
};

const GRADE_LABELS: Record<string, string> = {
  PRE_K: "Pre-K", KINDERGARTEN: "Kindergarten",
  FIRST: "1st Grade", SECOND: "2nd Grade", THIRD: "3rd Grade",
  FOURTH: "4th Grade", FIFTH: "5th Grade", SIXTH: "6th Grade",
  SEVENTH: "7th Grade", EIGHTH: "8th Grade", NINTH: "9th Grade",
  TENTH: "10th Grade", ELEVENTH: "11th Grade", TWELFTH: "12th Grade",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function fmtShort(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function age(dob: string | Date) {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Footer({ period }: { period: { start: string; end: string } }) {
  return (
    <View style={s.footer} fixed>
      <Text>Session Notes Log · {fmtDate(period.start)} – {fmtDate(period.end)}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function RunningHeader({ studentName }: { studentName: string }) {
  return (
    <View style={s.runningHeader} fixed>
      <Text style={s.runningHeaderLeft}>Session Notes Log</Text>
      <Text style={s.runningHeaderRight}>{studentName}</Text>
    </View>
  );
}

// ─── Main document ────────────────────────────────────────────────────────────

export function SessionReportPDF({ data }: { data: ReportData }) {
  const { student, sessions, period, summary } = data;
  const studentName = `${student.firstName} ${student.lastName}`;

  // Sort chronologically
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime()
  );

  return (
    <Document
      title={`Session Notes Log – ${studentName}`}
      author="Speech-Language Pathology"
    >
      {/* ══════════════════════════════════════════════
          PAGE 1: Cover + IEP Goals Summary
      ══════════════════════════════════════════════ */}
      <Page size="LETTER" style={s.page}>
        <Footer period={period} />

        {/* Accent bar */}
        <View style={s.coverRule} />

        {/* Title */}
        <Text style={s.coverTitle}>Session Notes Log</Text>
        <Text style={s.coverSubtitle}>Speech-Language Pathology</Text>

        {/* Student info block */}
        <View style={s.coverInfoBlock}>
          <View style={s.coverRow}>
            <Text style={s.coverLabel}>Student</Text>
            <Text style={s.coverValue}>{studentName}</Text>
          </View>
          <View style={s.coverRow}>
            <Text style={s.coverLabel}>Date of Birth</Text>
            <Text style={s.coverValue}>
              {fmtDate(student.dateOfBirth)} (Age {age(student.dateOfBirth)})
            </Text>
          </View>
          <View style={s.coverRow}>
            <Text style={s.coverLabel}>Grade</Text>
            <Text style={s.coverValue}>
              {GRADE_LABELS[student.gradeLevel] ?? student.gradeLevel}
            </Text>
          </View>
          <View style={s.coverRow}>
            <Text style={s.coverLabel}>School</Text>
            <Text style={s.coverValue}>{student.schoolName}</Text>
          </View>
          <View style={s.coverRow}>
            <Text style={s.coverLabel}>Report Period</Text>
            <Text style={s.coverValue}>
              {fmtDate(period.start)} – {fmtDate(period.end)}
            </Text>
          </View>
          <View style={{ ...s.coverRow, marginBottom: 0 }}>
            <Text style={s.coverLabel}>Generated</Text>
            <Text style={s.coverValue}>{fmtDate(new Date())}</Text>
          </View>
        </View>

        {/* Session count row */}
        <View style={s.countRow}>
          <View style={s.countCard}>
            <Text style={s.countValue}>{summary.totalSessions}</Text>
            <Text style={s.countLabel}>Total{"\n"}Sessions</Text>
          </View>
          <View style={s.countCard}>
            <Text style={[s.countValue, { color: C.success }]}>
              {summary.attendedSessions}
            </Text>
            <Text style={s.countLabel}>Sessions{"\n"}Attended</Text>
          </View>
          {summary.cancelledSessions > 0 && (
            <View style={s.countCard}>
              <Text style={[s.countValue, { color: C.muted }]}>
                {summary.cancelledSessions}
              </Text>
              <Text style={s.countLabel}>Sessions{"\n"}Cancelled</Text>
            </View>
          )}
          <View style={s.countCard}>
            <Text style={s.countValue}>{student.goals.length}</Text>
            <Text style={s.countLabel}>IEP{"\n"}Goals</Text>
          </View>
        </View>

        {/* IEP Goals */}
        {student.goals.length > 0 && (
          <>
            <Text style={s.goalsSectionTitle}>IEP Goals</Text>
            {student.goals.map((goal) => {
              const pts = goal.dataPoints;
              const latest = pts.length > 0 ? pts[pts.length - 1].accuracy : null;
              const atTarget = latest != null && latest >= goal.targetAccuracy;

              return (
                <View key={goal.id} style={s.goalCard} wrap={false}>
                  <View style={s.goalCardHeader}>
                    <View style={s.goalCardHeaderLeft}>
                      <Text style={s.goalName}>
                        {goal.shortName || DOMAIN_LABELS[goal.domain] || goal.domain}
                      </Text>
                      <Text style={s.domainTag}>
                        {DOMAIN_LABELS[goal.domain] ?? goal.domain}
                        {goal.status === "MASTERED" ? " · Mastered" : ""}
                      </Text>
                    </View>
                    <View style={s.goalMeta}>
                      <Text style={s.goalTarget}>Target: {Math.round(goal.targetAccuracy * 100)}%</Text>
                      {latest != null && (
                        <Text style={atTarget ? s.goalLatestGreen : s.goalLatest}>
                          Latest: {Math.round(latest * 100)}%
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={s.goalBody}>
                    <Text style={s.goalText}>{goal.goalText}</Text>
                    {goal.baselineScore != null && (
                      <Text style={[s.goalText, { marginTop: 3, color: C.muted }]}>
                        Baseline: {Math.round(goal.baselineScore * 100)}%
                        {goal.baselineDate ? ` (${fmtDate(goal.baselineDate)})` : ""}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </Page>

      {/* ══════════════════════════════════════════════
          PAGE 2+: Session Notes Log (one entry per session)
      ══════════════════════════════════════════════ */}
      <Page size="LETTER" style={s.page}>
        <RunningHeader studentName={studentName} />
        <Footer period={period} />

        {sorted.map((session, idx) => {
          const att = session.sessionStudents[0]?.attendance ?? "";
          const attLabel = ATTENDANCE_LABELS[att] ?? att;
          const typeLabel = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType;
          const noteText = session.notes[0]?.noteText ?? "";
          const isLocked = session.notes[0]?.isLocked ?? false;

          // Deduplicate data points by goal (keep first occurrence)
          const goalMap = new Map<string, typeof session.dataPoints[0]>();
          for (const dp of session.dataPoints) {
            if (!goalMap.has(dp.goalId)) goalMap.set(dp.goalId, dp);
          }
          const goalEntries = Array.from(goalMap.values());

          const attStyle =
            session.isCancelled
              ? s.sessionAttCancelled
              : att === "PRESENT"
              ? s.sessionAttPresent
              : att === "ABSENT_UNEXCUSED"
              ? s.sessionAttAbsent
              : s.sessionAttOther;

          return (
            <View key={session.id} style={s.sessionBox} wrap={false}>
              {/* Session header bar */}
              <View style={s.sessionHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <Text style={s.sessionNum}>
                    Session {idx + 1} of {sorted.length} ·{" "}
                  </Text>
                  <Text style={s.sessionDate}>{fmtShort(session.sessionDate)}</Text>
                  <Text style={s.sessionMeta}>
                    {typeLabel}
                    {session.durationMins ? ` · ${session.durationMins} min` : ""}
                    {isLocked ? " · Locked" : ""}
                  </Text>
                </View>
                <Text style={attStyle}>
                  {session.isCancelled ? "Cancelled" : attLabel}
                </Text>
              </View>

              {/* Session body */}
              <View style={s.sessionBody}>
                {/* Note */}
                {noteText ? (
                  <>
                    <Text style={s.subLabel}>Session Note</Text>
                    <Text style={s.noteText}>{noteText}</Text>
                  </>
                ) : !session.isCancelled ? (
                  <Text style={s.noNote}>No session note recorded.</Text>
                ) : null}

                {/* Goal performance */}
                {goalEntries.length > 0 && (
                  <>
                    <Text style={s.subLabel}>Goal Performance</Text>
                    <View style={s.tableWrap}>
                      <View style={s.tableHead}>
                        <Text style={[s.tableHeadCell, { flex: 1 }]}>Goal</Text>
                        <Text style={[s.tableHeadCell, { width: 58, textAlign: "right" }]}>
                          Accuracy
                        </Text>
                        <Text style={[s.tableHeadCell, { width: 52, textAlign: "right" }]}>
                          Trials
                        </Text>
                        <Text style={[s.tableHeadCell, { width: 110, paddingLeft: 10 }]}>
                          Cueing
                        </Text>
                      </View>
                      {goalEntries.map((dp, i) => {
                        const atTarget = dp.accuracy >= dp.goal.targetAccuracy;
                        return (
                          <View
                            key={dp.id}
                            style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
                          >
                            <View style={{ flex: 1, paddingRight: 6 }}>
                              <Text style={s.tableCellBold}>
                                {dp.goal.shortName ||
                                  DOMAIN_LABELS[dp.goal.domain] ||
                                  dp.goal.domain}
                              </Text>
                              <Text style={[s.tableCellMuted, { fontSize: 7 }]}>
                                Target: {Math.round(dp.goal.targetAccuracy * 100)}%
                              </Text>
                            </View>
                            <Text
                              style={[
                                atTarget ? s.tableCellGreen : s.tableCellBold,
                                { width: 58, textAlign: "right" },
                              ]}
                            >
                              {Math.round(dp.accuracy * 100)}%
                            </Text>
                            <Text
                              style={[s.tableCellMuted, { width: 52, textAlign: "right" }]}
                            >
                              {dp.trialsCorrect != null && dp.trialsTotal != null
                                ? `${dp.trialsCorrect}/${dp.trialsTotal}`
                                : "—"}
                            </Text>
                            <Text style={[s.tableCellMuted, { width: 110, paddingLeft: 10 }]}>
                              {dp.cueingLevel
                                ? (CUEING_LABELS[dp.cueingLevel] ?? dp.cueingLevel)
                                : "—"}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </Page>
    </Document>
  );
}
