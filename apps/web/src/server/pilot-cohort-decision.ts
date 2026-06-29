import type { PilotFollowUpValuePulseMetrics } from "@/server/pilot-health-repository";

export const PILOT_COHORT_DECISION_THRESHOLDS = {
  minWriteEligibleGardeners: 3,
  minInviteStarts: 1,
  continueFirstSaveRate: 2 / 3,
  continueReturningRateAmongFirstSavers: 0.3,
  stopFirstSaveRate: 0.35,
} as const;

export type PilotCohortDecisionRecommendation =
  | "continue"
  | "iterate"
  | "stop"
  | "insufficient_data";

export type PilotCohortBehavioralSignal = "strong" | "mixed" | "weak" | "missing";
export type PilotCohortQualitativeSignal =
  | "supportive"
  | "mixed"
  | "adverse"
  | "missing";

export interface PilotCohortInterviewAggregates {
  totalRecords: number;
  byActivationResult: Record<string, number>;
  byNextAction: Record<string, number>;
  byObservedValue: Record<string, number>;
  continueSignals: number;
  iterateSignals: number;
  stopSignals: number;
}

export interface PilotCohortDecisionInput {
  writeEligibleGardeners: number;
  inviteStarts: number;
  firstEntrySaves: number;
  firstEntrySaveRate: number;
  sameObjectFollowUps: number;
  returningGardeners: number;
  photoUsageRate: number;
  publishRate: number;
  publishedEntries: number;
  offlineQueued: number;
  offlineSynced: number;
  valuePulse: PilotFollowUpValuePulseMetrics;
  interviews: PilotCohortInterviewAggregates;
}

export interface PilotCohortDecisionEvaluation {
  recommendation: PilotCohortDecisionRecommendation;
  headline: string;
  rationale: string[];
  behavioralSignal: PilotCohortBehavioralSignal;
  qualitativeSignal: PilotCohortQualitativeSignal;
  dataGaps: string[];
}

export function evaluatePilotCohortDecision(
  input: PilotCohortDecisionInput,
): PilotCohortDecisionEvaluation {
  const dataGaps = collectPilotCohortDataGaps(input);
  const behavioralSignal = evaluateBehavioralSignal(input);
  const qualitativeSignal = evaluateQualitativeSignal(input.interviews);

  if (hasCriticalDataGaps(input, dataGaps)) {
    return {
      recommendation: "insufficient_data",
      headline: "Not enough cohort evidence yet",
      rationale: [
        "Behavioral and interview signals are too thin for a provisional continue / iterate / stop call.",
        "Collect more invited starts, first saves, follow-ups, and structured interview learnings before treating this panel as decision-ready.",
      ],
      behavioralSignal,
      qualitativeSignal,
      dataGaps,
    };
  }

  const followUpRateAmongFirstSavers = safeRate(
    input.returningGardeners,
    input.firstEntrySaves,
  );
  const rationale: string[] = [];

  if (
    input.firstEntrySaveRate >=
      PILOT_COHORT_DECISION_THRESHOLDS.continueFirstSaveRate &&
    followUpRateAmongFirstSavers >=
      PILOT_COHORT_DECISION_THRESHOLDS.continueReturningRateAmongFirstSavers
  ) {
    rationale.push(
      `Invited first-save rate is ${formatPercent(input.firstEntrySaveRate)} and returning gardeners are ${formatPercent(followUpRateAmongFirstSavers)} of first savers — the closed-pilot H1 loop looks real enough to widen invites.`,
    );
    appendValuePulseRationale(input.valuePulse, rationale);
    appendInterviewRationale(input.interviews, rationale, "continue");

    return {
      recommendation: "continue",
      headline: "Continue the closed pilot",
      rationale,
      behavioralSignal,
      qualitativeSignal,
      dataGaps,
    };
  }

  if (
    input.firstEntrySaveRate <
    PILOT_COHORT_DECISION_THRESHOLDS.stopFirstSaveRate
  ) {
    rationale.push(
      `Invited first-save rate is only ${formatPercent(input.firstEntrySaveRate)} — most invited gardeners who start are not saving a first entry.`,
    );
    rationale.push(
      "This matches the provisional stop posture: pause inviting and revisit ICP/JTBD before scaling.",
    );
    appendInterviewRationale(input.interviews, rationale, "stop");

    return {
      recommendation: "stop",
      headline: "Pause inviting and re-segment",
      rationale,
      behavioralSignal,
      qualitativeSignal,
      dataGaps,
    };
  }

  rationale.push(
    `Invited gardeners are saving first entries (${formatPercent(input.firstEntrySaveRate)} of starts), but same-object return is still low (${input.sameObjectFollowUps} follow-ups, ${input.returningGardeners} returning gardeners).`,
  );
  rationale.push(
    "Treat this as an activation-to-retention iteration: improve the return prompt and same-object follow-up path before inviting more people.",
  );
  appendValuePulseRationale(input.valuePulse, rationale);
  appendInterviewRationale(input.interviews, rationale, "iterate");

  return {
    recommendation: "iterate",
    headline: "Iterate the return loop before scaling invites",
    rationale,
    behavioralSignal,
    qualitativeSignal,
    dataGaps,
  };
}

export function summarizePilotInterviewAggregates(
  rows: ReadonlyArray<{
    activationResult: string;
    nextAction: string;
    observedValue: string;
  }>,
): PilotCohortInterviewAggregates {
  const byActivationResult: Record<string, number> = {};
  const byNextAction: Record<string, number> = {};
  const byObservedValue: Record<string, number> = {};
  let continueSignals = 0;
  let iterateSignals = 0;
  let stopSignals = 0;

  for (const row of rows) {
    incrementCount(byActivationResult, row.activationResult);
    incrementCount(byNextAction, row.nextAction);
    incrementCount(byObservedValue, row.observedValue);

    if (row.nextAction === "continue_pilot") {
      continueSignals += 1;
    } else if (row.nextAction.startsWith("iterate_")) {
      iterateSignals += 1;
    } else if (
      row.nextAction === "pause_recruiting" ||
      row.nextAction === "close_track"
    ) {
      stopSignals += 1;
    }
  }

  return {
    totalRecords: rows.length,
    byActivationResult,
    byNextAction,
    byObservedValue,
    continueSignals,
    iterateSignals,
    stopSignals,
  };
}

function collectPilotCohortDataGaps(input: PilotCohortDecisionInput) {
  const gaps: string[] = [];

  if (
    input.writeEligibleGardeners <
    PILOT_COHORT_DECISION_THRESHOLDS.minWriteEligibleGardeners
  ) {
    gaps.push(
      `Write-eligible gardeners (${input.writeEligibleGardeners}) are below the provisional minimum of ${PILOT_COHORT_DECISION_THRESHOLDS.minWriteEligibleGardeners}.`,
    );
  }

  if (input.inviteStarts < PILOT_COHORT_DECISION_THRESHOLDS.minInviteStarts) {
    gaps.push("No invited-cohort starts recorded in the evaluation window.");
  }

  if (input.firstEntrySaves === 0) {
    gaps.push("No invited first-entry saves recorded in the evaluation window.");
  }

  if (input.interviews.totalRecords === 0) {
    gaps.push(
      "No structured founder interview learnings captured yet — qualitative categories are missing.",
    );
  }

  if (
    input.sameObjectFollowUps > 0 &&
    input.valuePulse.responses === 0
  ) {
    gaps.push(
      "Same-object follow-ups exist, but no follow-up value pulse responses were recorded yet.",
    );
  }

  if (input.offlineQueued > 0 && input.offlineSynced === 0) {
    gaps.push(
      "Offline entries were queued, but none synced in-window — offline reliability is unproven.",
    );
  }

  return gaps;
}

function hasCriticalDataGaps(
  input: PilotCohortDecisionInput,
  dataGaps: string[],
) {
  if (dataGaps.length === 0) return false;

  return (
    input.inviteStarts < PILOT_COHORT_DECISION_THRESHOLDS.minInviteStarts ||
    input.writeEligibleGardeners <
      PILOT_COHORT_DECISION_THRESHOLDS.minWriteEligibleGardeners ||
    input.firstEntrySaves === 0
  );
}

function evaluateBehavioralSignal(
  input: PilotCohortDecisionInput,
): PilotCohortBehavioralSignal {
  if (input.inviteStarts === 0 || input.firstEntrySaves === 0) {
    return "missing";
  }

  const followUpRateAmongFirstSavers = safeRate(
    input.returningGardeners,
    input.firstEntrySaves,
  );

  if (
    input.firstEntrySaveRate >=
      PILOT_COHORT_DECISION_THRESHOLDS.continueFirstSaveRate &&
    followUpRateAmongFirstSavers >=
      PILOT_COHORT_DECISION_THRESHOLDS.continueReturningRateAmongFirstSavers
  ) {
    return "strong";
  }

  if (
    input.firstEntrySaveRate <
    PILOT_COHORT_DECISION_THRESHOLDS.stopFirstSaveRate
  ) {
    return "weak";
  }

  return "mixed";
}

function evaluateQualitativeSignal(
  interviews: PilotCohortInterviewAggregates,
): PilotCohortQualitativeSignal {
  if (interviews.totalRecords === 0) return "missing";

  if (interviews.stopSignals > interviews.continueSignals) {
    return "adverse";
  }

  if (
    interviews.continueSignals > 0 &&
    interviews.continueSignals >= interviews.iterateSignals &&
    interviews.stopSignals === 0
  ) {
    return "supportive";
  }

  return "mixed";
}

function appendValuePulseRationale(
  valuePulse: PilotFollowUpValuePulseMetrics,
  rationale: string[],
) {
  if (valuePulse.submitted === 0) return;

  rationale.push(
    `Follow-up value pulse: ${valuePulse.useful} useful / ${valuePulse.notSure} not sure / ${valuePulse.notUseful} not useful among ${valuePulse.submitted} submitted responses (${formatPercent(valuePulse.usefulRate)} useful rate).`,
  );
}

function appendInterviewRationale(
  interviews: PilotCohortInterviewAggregates,
  rationale: string[],
  recommendation: Exclude<PilotCohortDecisionRecommendation, "insufficient_data">,
) {
  if (interviews.totalRecords === 0) return;

  rationale.push(
    `Structured interviews (${interviews.totalRecords} records): ${interviews.continueSignals} continue, ${interviews.iterateSignals} iterate, ${interviews.stopSignals} stop/pause signals.`,
  );

  if (
    recommendation === "continue" &&
    interviews.iterateSignals > interviews.continueSignals
  ) {
    rationale.push(
      "Interview next-action categories lean iterate even though behavioral rates look strong — review qualitative categories manually before widening invites.",
    );
  }

  if (
    recommendation === "stop" &&
    interviews.continueSignals > 0
  ) {
    rationale.push(
      "Some interview records still suggest continuing with individual gardeners — reconcile qualitative outliers before pausing the whole cohort.",
    );
  }
}

function incrementCount(bucket: Record<string, number>, key: string) {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

function safeRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
