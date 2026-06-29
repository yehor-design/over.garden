import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { CLOSED_PILOT_COHORT } from "@/lib/garden/pilot-invite";
import {
  evaluatePilotCohortDecision,
  summarizePilotInterviewAggregates,
  type PilotCohortDecisionEvaluation,
  type PilotCohortInterviewAggregates,
} from "@/server/pilot-cohort-decision";
import {
  getPilotHealthReadout,
  PILOT_HEALTH_RESEARCH_REFERENCES,
  type PilotFollowUpValuePulseMetrics,
  type PilotHealthReadout,
  type PilotSegmentCohortMetrics,
} from "@/server/pilot-health-repository";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const DECISION_WINDOW_KEY = "last_30_days" as const;

export interface PilotCohortDecisionReadout {
  generatedAt: Date;
  evaluationWindow: {
    key: typeof DECISION_WINDOW_KEY;
    label: string;
    since: Date;
  };
  cohort: {
    writeEligibleGardeners: number;
    founderRehearsalGardeners: number;
    inviteStarts: number;
    firstEntrySaves: number;
    firstEntrySaveRate: number;
    sameObjectFollowUps: number;
    returningGardeners: number;
    followUpRateAmongFirstSavers: number;
    segments: PilotSegmentCohortMetrics[];
  };
  productSignals: {
    photoUsageRate: number;
    publishRate: number;
    publishedEntries: number;
    offlineQueued: number;
    offlineSynced: number;
    offlineFailedObservability: "client_only_not_server_observable";
  };
  valuePulse: PilotFollowUpValuePulseMetrics;
  interviews: PilotCohortInterviewAggregates;
  decision: PilotCohortDecisionEvaluation;
  caveats: string[];
  references: typeof PILOT_HEALTH_RESEARCH_REFERENCES;
}

interface InterviewAggregateRow {
  activationResult: string;
  nextAction: string;
  observedValue: string;
  recordCount: number | string | bigint | null;
  segment: string;
}

export async function getPilotCohortDecisionReadout(
  executor: QueryExecutor = db,
  now = new Date(),
): Promise<PilotCohortDecisionReadout> {
  const [healthReadout, interviewRows] = await Promise.all([
    getPilotHealthReadout(executor, now),
    buildPilotInterviewLearningAggregateQuery(executor).execute(),
  ]);

  return assemblePilotCohortDecisionReadout(healthReadout, interviewRows, now);
}

export async function getPilotCohortDecisionReadoutSafely(
  options: {
    reader?: () => Promise<PilotCohortDecisionReadout>;
    logger?: Pick<Console, "error">;
  } = {},
): Promise<PilotCohortDecisionReadout | null> {
  const reader = options.reader ?? (() => getPilotCohortDecisionReadout());
  const logger = options.logger ?? console;

  try {
    return await reader();
  } catch (error) {
    logger.error("Pilot cohort decision readout failed.", {
      error:
        error instanceof Error
          ? error.message
          : "Unknown pilot cohort decision error.",
    });
    return null;
  }
}

export function buildPilotInterviewLearningAggregateQuery(
  executor: QueryExecutor,
) {
  return executor
    .selectFrom("pilot_interview_learnings")
    .select([
      "activation_result as activationResult",
      "next_action as nextAction",
      "observed_value as observedValue",
      "segment",
      sql<number>`count(*)`.as("recordCount"),
    ])
    .where((eb) =>
      eb.or([
        eb("pilot_cohort", "is", null),
        eb("pilot_cohort", "=", CLOSED_PILOT_COHORT),
      ]),
    )
    .groupBy(["activation_result", "next_action", "observed_value", "segment"])
    .orderBy("activation_result", "asc")
    .orderBy("next_action", "asc")
    .orderBy("observed_value", "asc")
    .orderBy("segment", "asc");
}

export function assemblePilotCohortDecisionReadout(
  healthReadout: PilotHealthReadout,
  interviewRows: InterviewAggregateRow[],
  now = new Date(),
): PilotCohortDecisionReadout {
  const window =
    healthReadout.windows.find(
      (candidate) => candidate.key === DECISION_WINDOW_KEY,
    ) ?? healthReadout.windows[healthReadout.windows.length - 1]!;
  const metrics = window.metrics;
  const interviews = flattenInterviewAggregateRows(interviewRows);
  const followUpRateAmongFirstSavers = safeRate(
    metrics.invitedCohort.returningGardeners,
    metrics.invitedCohort.firstEntrySaves,
  );

  const decision = evaluatePilotCohortDecision({
    writeEligibleGardeners: healthReadout.writeAccess.writeEligibleGardeners,
    inviteStarts: metrics.invitedCohort.starts,
    firstEntrySaves: metrics.invitedCohort.firstEntrySaves,
    firstEntrySaveRate: metrics.invitedCohort.firstEntrySaveRate,
    sameObjectFollowUps: metrics.invitedCohort.sameObjectFollowUpEntries,
    returningGardeners: metrics.invitedCohort.returningGardeners,
    photoUsageRate: metrics.photoUsageRate,
    publishRate: metrics.publishRate,
    publishedEntries: metrics.publishedEntries,
    offlineQueued: metrics.offlineQueued,
    offlineSynced: metrics.offlineSynced,
    valuePulse: metrics.followUpValuePulse,
    segments: metrics.invitedCohort.segments,
    interviews,
  });

  return {
    generatedAt: now,
    evaluationWindow: {
      key: DECISION_WINDOW_KEY,
      label: window.label,
      since: window.since,
    },
    cohort: {
      writeEligibleGardeners: healthReadout.writeAccess.writeEligibleGardeners,
      founderRehearsalGardeners:
        healthReadout.writeAccess.founderRehearsalGardeners,
      inviteStarts: metrics.invitedCohort.starts,
      firstEntrySaves: metrics.invitedCohort.firstEntrySaves,
      firstEntrySaveRate: metrics.invitedCohort.firstEntrySaveRate,
      sameObjectFollowUps: metrics.invitedCohort.sameObjectFollowUpEntries,
      returningGardeners: metrics.invitedCohort.returningGardeners,
      followUpRateAmongFirstSavers,
      segments: metrics.invitedCohort.segments,
    },
    productSignals: {
      photoUsageRate: metrics.photoUsageRate,
      publishRate: metrics.publishRate,
      publishedEntries: metrics.publishedEntries,
      offlineQueued: metrics.offlineQueued,
      offlineSynced: metrics.offlineSynced,
      offlineFailedObservability: metrics.offlineFailed.observability,
    },
    valuePulse: metrics.followUpValuePulse,
    interviews,
    decision,
    caveats: [
      "This panel is decision support, not an automated strategy engine.",
      "All numbers are provisional closed-pilot calibrators grounded in OverGarden_B2_METRICS_v0.md and KILL_CRITERIA_PREREG_v2.md — not statistically validated targets.",
      "Behavioral rates use the invited-cohort enum source only; they never expose journal text, invite identity, email, media keys, IP, user agent, referrer, or raw URLs.",
      "Founder rehearsal grants and founder_rehearsal interview records are excluded from this closed-pilot decision frame; they prove operator readiness only, not OVE-53 field evidence.",
      "Interview categories are bounded enum aggregates; redacted notes and subject identifiers stay out of this readout.",
      "Offline failed mutations remain browser-local Dexie state and are not server-observable.",
      "Founder judgment still required: reconcile behavioral rates, value pulse, and interview categories before changing recruiting posture.",
    ],
    references: healthReadout.references,
  };
}

function flattenInterviewAggregateRows(
  rows: InterviewAggregateRow[],
): PilotCohortInterviewAggregates {
  const flattened = rows.flatMap((row) =>
    Array.from({ length: toNumber(row.recordCount) }, () => ({
      activationResult: row.activationResult,
      nextAction: row.nextAction,
      observedValue: row.observedValue,
      segment: row.segment,
    })),
  );

  return summarizePilotInterviewAggregates(flattened);
}

function safeRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function toNumber(value: number | string | bigint | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
