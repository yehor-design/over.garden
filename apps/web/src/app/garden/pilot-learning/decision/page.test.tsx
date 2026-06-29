import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePilotHealthOperatorAccess: vi.fn(),
  getPilotCohortDecisionReadoutSafely: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: vi.fn(async () => ({
    user: { id: "00000000-0000-4000-8000-000000000999" },
  })),
  getSessionId: vi.fn(() => "operator-session"),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/pilot-health-access", () => ({
  resolvePilotHealthOperatorAccess: mocks.resolvePilotHealthOperatorAccess,
}));

vi.mock("@/server/pilot-cohort-decision-repository", () => ({
  getPilotCohortDecisionReadoutSafely:
    mocks.getPilotCohortDecisionReadoutSafely,
}));

describe("/garden/pilot-learning/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePilotHealthOperatorAccess.mockReturnValue({
      status: "allowed",
      mode: "allowlist",
    });
    mocks.getPilotCohortDecisionReadoutSafely.mockResolvedValue(null);
  });

  it("does not read aggregate decision data for a signed-in non-operator", async () => {
    mocks.resolvePilotHealthOperatorAccess.mockReturnValue({
      status: "denied",
    });

    const { default: PilotCohortDecisionPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotCohortDecisionPage());

    expect(html).toContain("Access denied.");
    expect(mocks.getPilotCohortDecisionReadoutSafely).not.toHaveBeenCalled();
  });

  it("renders the operator decision boundary for an allowlisted operator", async () => {
    const { default: PilotCohortDecisionPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotCohortDecisionPage());

    expect(html).toContain("Gate: allowlist");
    expect(html).toContain("Pilot cohort decision");
    expect(mocks.getPilotCohortDecisionReadoutSafely).toHaveBeenCalledOnce();
  });

  it("renders segment-scoped H1 slices and segment decision signal", async () => {
    mocks.getPilotCohortDecisionReadoutSafely.mockResolvedValue({
      generatedAt: new Date("2026-06-29T12:00:00.000Z"),
      evaluationWindow: {
        key: "last_30_days",
        label: "Last 30 days",
        since: new Date("2026-05-30T12:00:00.000Z"),
      },
      cohort: {
        writeEligibleGardeners: 3,
        founderRehearsalGardeners: 1,
        inviteStarts: 3,
        firstEntrySaves: 2,
        firstEntrySaveRate: 2 / 3,
        sameObjectFollowUps: 1,
        returningGardeners: 1,
        followUpRateAmongFirstSavers: 0.5,
        segments: [
          {
            segment: "casual_practical_beginner",
            label: "Casual - practical beginner with land",
            coreBucket: "casual_core",
            diagnosticBucket: "land_practical",
            writeEligibleGardeners: 2,
            starts: 2,
            firstEntrySaves: 1,
            sameObjectFollowUpEntries: 1,
            returningGardeners: 1,
            firstEntrySaveRate: 0.5,
            followUpRateAmongFirstSavers: 1,
            isUnknownSegment: false,
            isLowSample: true,
          },
        ],
      },
      productSignals: {
        photoUsageRate: 0,
        publishRate: 0,
        publishedEntries: 0,
        offlineQueued: 0,
        offlineSynced: 0,
        offlineFailedObservability: "client_only_not_server_observable",
      },
      valuePulse: {
        responses: 0,
        submitted: 0,
        skipped: 0,
        useful: 0,
        notSure: 0,
        notUseful: 0,
        withReason: 0,
        usefulRate: 0,
      },
      interviews: {
        totalRecords: 1,
        bySegment: { casual_practical_beginner: 1 },
        byActivationResult: { activated_with_follow_up: 1 },
        byNextAction: { continue_pilot: 1 },
        byObservedValue: { history_worth_keeping: 1 },
        continueSignals: 1,
        iterateSignals: 0,
        stopSignals: 0,
      },
      decision: {
        recommendation: "iterate",
        headline: "Segment the H1 proof before widening invites",
        rationale: ["Pooled H1 cannot be used as a broad pass yet."],
        behavioralSignal: "strong",
        qualitativeSignal: "supportive",
        segmentSignal: "concentrated",
        dataGaps: ["Segment sample is low."],
      },
      caveats: [],
      references: [],
    });

    const { default: PilotCohortDecisionPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotCohortDecisionPage());

    expect(html).toContain("Segment H1 slices");
    expect(html).toContain("Casual - practical beginner with land");
    expect(html).toContain("Segment signal: concentrated");
    expect(html).toContain("Founder rehearsal");
    expect(html).toContain("low sample");
  });
});
