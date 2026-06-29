import { describe, expect, it } from "vitest";

import {
  evaluatePilotCohortDecision,
  PILOT_COHORT_DECISION_THRESHOLDS,
  summarizePilotInterviewAggregates,
} from "./pilot-cohort-decision";

const emptyValuePulse = {
  responses: 0,
  submitted: 0,
  skipped: 0,
  useful: 0,
  notSure: 0,
  notUseful: 0,
  withReason: 0,
  usefulRate: 0,
};

const emptyInterviews = {
  totalRecords: 0,
  byActivationResult: {},
  byNextAction: {},
  byObservedValue: {},
  continueSignals: 0,
  iterateSignals: 0,
  stopSignals: 0,
};

function buildInput(
  overrides: Partial<Parameters<typeof evaluatePilotCohortDecision>[0]> = {},
) {
  return {
    writeEligibleGardeners: 5,
    inviteStarts: 6,
    firstEntrySaves: 5,
    firstEntrySaveRate: 5 / 6,
    sameObjectFollowUps: 3,
    returningGardeners: 2,
    photoUsageRate: 0.6,
    publishRate: 0.2,
    publishedEntries: 1,
    offlineQueued: 1,
    offlineSynced: 1,
    valuePulse: emptyValuePulse,
    interviews: emptyInterviews,
    ...overrides,
  };
}

describe("evaluatePilotCohortDecision", () => {
  it("returns insufficient_data when the cohort is too thin", () => {
    const decision = evaluatePilotCohortDecision(
      buildInput({
        writeEligibleGardeners: 1,
        inviteStarts: 0,
        firstEntrySaves: 0,
        firstEntrySaveRate: 0,
      }),
    );

    expect(decision.recommendation).toBe("insufficient_data");
    expect(decision.dataGaps.some((gap) => gap.includes("Write-eligible"))).toBe(
      true,
    );
    expect(decision.dataGaps.some((gap) => gap.includes("No invited-cohort starts"))).toBe(
      true,
    );
  });

  it("recommends continue when first-save and return rates meet provisional thresholds", () => {
    const decision = evaluatePilotCohortDecision(
      buildInput({
        firstEntrySaveRate:
          PILOT_COHORT_DECISION_THRESHOLDS.continueFirstSaveRate,
        returningGardeners: 2,
        firstEntrySaves: 5,
        interviews: summarizePilotInterviewAggregates([
          {
            activationResult: "activated_with_follow_up",
            nextAction: "continue_pilot",
            observedValue: "history_worth_keeping",
          },
        ]),
      }),
    );

    expect(decision.recommendation).toBe("continue");
    expect(decision.behavioralSignal).toBe("strong");
    expect(decision.rationale.some((line) => line.includes("H1 loop"))).toBe(true);
  });

  it("recommends iterate when first saves happen but return stays low", () => {
    const decision = evaluatePilotCohortDecision(
      buildInput({
        firstEntrySaveRate: 0.5,
        sameObjectFollowUps: 1,
        returningGardeners: 0,
        interviews: summarizePilotInterviewAggregates([
          {
            activationResult: "activated_first_entry_only",
            nextAction: "iterate_onboarding",
            observedValue: "no_clear_value_yet",
          },
        ]),
      }),
    );

    expect(decision.recommendation).toBe("iterate");
    expect(decision.behavioralSignal).toBe("mixed");
    expect(decision.rationale.some((line) => line.includes("activation-to-retention"))).toBe(
      true,
    );
  });

  it("recommends stop when invited first-save rate stays low", () => {
    const decision = evaluatePilotCohortDecision(
      buildInput({
        inviteStarts: 8,
        firstEntrySaves: 2,
        firstEntrySaveRate: 0.25,
        sameObjectFollowUps: 0,
        returningGardeners: 0,
      }),
    );

    expect(decision.recommendation).toBe("stop");
    expect(decision.behavioralSignal).toBe("weak");
  });

  it("names missing interview and value-pulse evidence without hiding gaps", () => {
    const decision = evaluatePilotCohortDecision(
      buildInput({
        sameObjectFollowUps: 2,
        valuePulse: {
          ...emptyValuePulse,
          responses: 0,
        },
        interviews: emptyInterviews,
      }),
    );

    expect(decision.dataGaps.some((gap) => gap.includes("founder interview"))).toBe(
      true,
    );
    expect(decision.dataGaps.some((gap) => gap.includes("value pulse"))).toBe(
      true,
    );
  });
});

describe("summarizePilotInterviewAggregates", () => {
  it("counts bounded enum categories without carrying private fields", () => {
    const summary = summarizePilotInterviewAggregates([
      {
        activationResult: "activated_with_follow_up",
        nextAction: "continue_pilot",
        observedValue: "history_worth_keeping",
      },
      {
        activationResult: "activated_first_entry_only",
        nextAction: "iterate_composer",
        observedValue: "no_clear_value_yet",
      },
      {
        activationResult: "dropped_after_first",
        nextAction: "pause_recruiting",
        observedValue: "no_clear_value_yet",
      },
    ]);

    expect(summary.totalRecords).toBe(3);
    expect(summary.continueSignals).toBe(1);
    expect(summary.iterateSignals).toBe(1);
    expect(summary.stopSignals).toBe(1);
    expect(summary.byActivationResult.activated_with_follow_up).toBe(1);
    expect(JSON.stringify(summary)).not.toMatch(/redacted|subject|email|body|title/i);
  });
});
