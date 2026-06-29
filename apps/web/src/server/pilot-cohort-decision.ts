import type {
  PilotFollowUpValuePulseMetrics,
  PilotSegmentCohortMetrics,
} from "@/server/pilot-health-repository";

export const PILOT_COHORT_DECISION_THRESHOLDS = {
  minWriteEligibleGardeners: 3,
  minInviteStarts: 1,
  minSegmentFirstSavesForSignal: 2,
  continueFirstSaveRate: 2 / 3,
  continueReturningRateAmongFirstSavers: 0.3,
  stopFirstSaveRate: 0.35,
} as const;

export type PilotCohortDecisionRecommendation =
  | "continue"
  | "iterate"
  | "stop"
  | "insufficient_data";

export type PilotCohortBehavioralSignal =
  | "strong"
  | "mixed"
  | "weak"
  | "missing";
export type PilotCohortQualitativeSignal =
  | "supportive"
  | "mixed"
  | "adverse"
  | "missing";
export type PilotCohortSegmentSignal =
  | "distributed"
  | "concentrated"
  | "unknown_gap"
  | "missing";

export interface PilotCohortInterviewAggregates {
  totalRecords: number;
  bySegment: Record<string, number>;
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
  segments: PilotSegmentCohortMetrics[];
  interviews: PilotCohortInterviewAggregates;
}

export interface PilotCohortDecisionEvaluation {
  recommendation: PilotCohortDecisionRecommendation;
  headline: string;
  rationale: string[];
  behavioralSignal: PilotCohortBehavioralSignal;
  qualitativeSignal: PilotCohortQualitativeSignal;
  segmentSignal: PilotCohortSegmentSignal;
  dataGaps: string[];
}

export function evaluatePilotCohortDecision(
  input: PilotCohortDecisionInput,
): PilotCohortDecisionEvaluation {
  const dataGaps = collectPilotCohortDataGaps(input);
  const behavioralSignal = evaluateBehavioralSignal(input);
  const qualitativeSignal = evaluateQualitativeSignal(input.interviews);
  const segmentSignal = evaluateSegmentSignal(input.segments);

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
      segmentSignal,
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
    if (!canClaimBroadSegmentPass(input.segments)) {
      rationale.push(
        `Pooled invited-cohort H1 rates pass (${formatPercent(input.firstEntrySaveRate)} first-save, ${formatPercent(followUpRateAmongFirstSavers)} return among first savers), but the signal is not distributed across known pilot segments.`,
      );
      appendSegmentRationale(input.segments, rationale);
      rationale.push(
        "Treat this as iterate / segment before widening invites: prove casual-core distribution and separate land/practical beginners from micro/balcony gardeners.",
      );
      appendValuePulseRationale(input.valuePulse, rationale);
      appendInterviewRationale(input.interviews, rationale, "iterate");

      return {
        recommendation: "iterate",
        headline: "Segment the H1 proof before widening invites",
        rationale,
        behavioralSignal,
        qualitativeSignal,
        segmentSignal,
        dataGaps,
      };
    }

    rationale.push(
      `Invited first-save rate is ${formatPercent(input.firstEntrySaveRate)} and returning gardeners are ${formatPercent(followUpRateAmongFirstSavers)} of first savers — the closed-pilot H1 loop looks real enough to widen invites.`,
    );
    appendSegmentRationale(input.segments, rationale);
    appendValuePulseRationale(input.valuePulse, rationale);
    appendInterviewRationale(input.interviews, rationale, "continue");

    return {
      recommendation: "continue",
      headline: "Continue the closed pilot",
      rationale,
      behavioralSignal,
      qualitativeSignal,
      segmentSignal,
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
      segmentSignal,
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
  appendSegmentRationale(input.segments, rationale);
  appendInterviewRationale(input.interviews, rationale, "iterate");

  return {
    recommendation: "iterate",
    headline: "Iterate the return loop before scaling invites",
    rationale,
    behavioralSignal,
    qualitativeSignal,
    segmentSignal,
    dataGaps,
  };
}

export function summarizePilotInterviewAggregates(
  rows: ReadonlyArray<{
    segment?: string;
    activationResult: string;
    nextAction: string;
    observedValue: string;
  }>,
): PilotCohortInterviewAggregates {
  const bySegment: Record<string, number> = {};
  const byActivationResult: Record<string, number> = {};
  const byNextAction: Record<string, number> = {};
  const byObservedValue: Record<string, number> = {};
  let continueSignals = 0;
  let iterateSignals = 0;
  let stopSignals = 0;

  for (const row of rows) {
    if (row.segment) incrementCount(bySegment, row.segment);
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
    bySegment,
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
    gaps.push(
      "No invited first-entry saves recorded in the evaluation window.",
    );
  }

  if (input.interviews.totalRecords === 0) {
    gaps.push(
      "No structured founder interview learnings captured yet — qualitative categories are missing.",
    );
  }

  const unknownSegment = input.segments.find(
    (segment) => segment.isUnknownSegment,
  );
  if (
    unknownSegment &&
    (unknownSegment.writeEligibleGardeners > 0 ||
      unknownSegment.firstEntrySaves > 0 ||
      unknownSegment.sameObjectFollowUpEntries > 0)
  ) {
    gaps.push(
      `Unknown-segment pilot subjects are present (${unknownSegment.writeEligibleGardeners} write-eligible, ${unknownSegment.firstEntrySaves} first saves). Classify them before treating H1 as segment-proven.`,
    );
  }

  const knownFirstSaveSegments = input.segments.filter(
    (segment) => !segment.isUnknownSegment && segment.firstEntrySaves > 0,
  );
  if (input.firstEntrySaves > 0 && knownFirstSaveSegments.length === 0) {
    gaps.push(
      "No known-segment first-entry saves yet — pooled cohort rates cannot support an ICP decision.",
    );
  }

  for (const segment of input.segments) {
    if (!segment.isLowSample) continue;
    gaps.push(
      `${segment.label} has only ${segment.firstEntrySaves} first save; treat its follow-up rate as a low-sample data gap.`,
    );
  }

  if (input.sameObjectFollowUps > 0 && input.valuePulse.responses === 0) {
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

function evaluateSegmentSignal(
  segments: PilotSegmentCohortMetrics[],
): PilotCohortSegmentSignal {
  if (segments.length === 0) return "missing";

  const workingKnownSegments = getWorkingKnownSegments(segments);
  if (
    segments.some(
      (segment) =>
        segment.isUnknownSegment &&
        (segment.writeEligibleGardeners > 0 ||
          segment.firstEntrySaves > 0 ||
          segment.sameObjectFollowUpEntries > 0),
    )
  ) {
    return "unknown_gap";
  }

  if (workingKnownSegments.length === 0) return "missing";
  if (canClaimBroadSegmentPass(segments)) return "distributed";
  return "concentrated";
}

function canClaimBroadSegmentPass(
  segments: PilotSegmentCohortMetrics[],
): boolean {
  const workingKnownSegments = getWorkingKnownSegments(segments);
  if (workingKnownSegments.length < 2) return false;

  const hasCasualCore = workingKnownSegments.some(
    (segment) => segment.coreBucket === "casual_core",
  );
  if (!hasCasualCore) return false;

  const workingDiagnosticBuckets = new Set(
    workingKnownSegments.map((segment) => segment.diagnosticBucket),
  );
  if (workingDiagnosticBuckets.size < 2) return false;
  if (
    workingDiagnosticBuckets.has("land_practical") &&
    !workingDiagnosticBuckets.has("micro_balcony")
  ) {
    return false;
  }

  const hasUnknownSegmentActivity = segments.some(
    (segment) =>
      segment.isUnknownSegment &&
      (segment.firstEntrySaves > 0 ||
        segment.sameObjectFollowUpEntries > 0 ||
        segment.returningGardeners > 0),
  );
  if (hasUnknownSegmentActivity) return false;

  return true;
}

function getWorkingKnownSegments(segments: PilotSegmentCohortMetrics[]) {
  return segments.filter(
    (segment) =>
      !segment.isUnknownSegment &&
      segment.firstEntrySaves >=
        PILOT_COHORT_DECISION_THRESHOLDS.minSegmentFirstSavesForSignal &&
      segment.returningGardeners > 0 &&
      segment.followUpRateAmongFirstSavers >=
        PILOT_COHORT_DECISION_THRESHOLDS.continueReturningRateAmongFirstSavers,
  );
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

function appendSegmentRationale(
  segments: PilotSegmentCohortMetrics[],
  rationale: string[],
) {
  if (segments.length === 0) return;

  const workingKnownSegments = getWorkingKnownSegments(segments);
  const workingLabels = workingKnownSegments.map((segment) => segment.label);
  const powerOnly =
    workingKnownSegments.length > 0 &&
    workingKnownSegments.every(
      (segment) => segment.coreBucket === "power_core",
    );
  const landWorking = workingKnownSegments.some(
    (segment) => segment.diagnosticBucket === "land_practical",
  );
  const microWorking = workingKnownSegments.some(
    (segment) => segment.diagnosticBucket === "micro_balcony",
  );

  if (workingLabels.length > 0) {
    rationale.push(
      `Segment-scoped H1 is currently working in: ${workingLabels.join(", ")}.`,
    );
  }

  if (powerOnly) {
    rationale.push(
      "The working H1 signal is concentrated in power-core gardeners, so this is not a broad casual-core pass.",
    );
  }

  if (landWorking && !microWorking) {
    rationale.push(
      "Land/practical beginners show stronger signal than micro/balcony gardeners; read this as a possible land-owner pivot, not top-of-funnel micro-grower validation.",
    );
  }
}

function appendInterviewRationale(
  interviews: PilotCohortInterviewAggregates,
  rationale: string[],
  recommendation: Exclude<
    PilotCohortDecisionRecommendation,
    "insufficient_data"
  >,
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

  if (recommendation === "stop" && interviews.continueSignals > 0) {
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
