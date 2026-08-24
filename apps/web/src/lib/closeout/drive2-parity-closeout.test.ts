import { describe, expect, it } from "vitest";

import { AUTH_INTENT_ACTIONS } from "@/lib/auth/auth-intent-contract";
import {
  CORE_JOURNEY_ARCHETYPES,
  CORE_JOURNEY_SCENARIOS,
  CORE_JOURNEY_VIEWPORTS,
} from "@/lib/accessibility/core-journey-matrix";
import {
  assertDrive2ParityCloseoutCoverage,
  assertDrive2PublicSearchParityGate,
  buildDrive2ParityCloseoutCoverage,
  DRIVE2_CLOSEOUT_REQUIRED_OBJECT_KINDS,
} from "./drive2-parity-closeout";

describe("OVE-186 Drive2-parity closeout coverage", () => {
  it("produces a zero-gap report from the stable v10 fixture matrix", () => {
    const report = buildDrive2ParityCloseoutCoverage();

    expect(() => assertDrive2ParityCloseoutCoverage(report)).not.toThrow();
    expect(report.issue).toBe("OVE-186");
    expect(report.evidenceClass).toBe("local-deterministic-fixture");
    expect(report.fixture).toEqual({
      version: "ove187-v10",
      manifestHash:
        "3d7f3de71102ed9359fda0efb1659b2716f3221d7ec89d9caea07b61409fbf4b",
      namespace: "visual-fixtures/ove187-v10",
    });
    expect(report.summary).toMatchObject({
      scenarioCount: 171,
      routeViewportCheckCount: 642,
      archetypeCount: CORE_JOURNEY_ARCHETYPES.length,
      viewportCount: CORE_JOURNEY_VIEWPORTS.length,
    });
    expect(report.missing).toEqual({
      archetypes: [],
      states: [],
      viewports: [],
      mobileDesktopArchetypes: [],
      objectKinds: [],
      authIntentActions: [],
      guestJourneyScenarios: [],
      authenticatedJourneyScenarios: [],
      screenshotEvidenceArchetypes: [],
      unsafeEvidencePaths: [],
    });
    expect(report.screenshotEvidence).toHaveLength(
      CORE_JOURNEY_ARCHETYPES.length,
    );
  });

  it("serves OVE-186 with seam_unmet when OVE-227 search parity is not zero-gap", () => {
    expect(
      assertDrive2PublicSearchParityGate({
        zeroGap: false,
        counts: {
          missing: 1,
          extraneous: 0,
          stale: 0,
          unsafe_schema: 0,
          duplicate: 0,
          invalid_id: 0,
          overdue: 0,
          terminal_failure: 0,
        },
      }),
    ).toEqual({ serveClass: "seam_unmet", blockingCount: 1 });
  });

  it("serves OVE-186 with seam_unmet when overdue or dead indexing jobs can hide drift", () => {
    const converged = {
      missing: 0,
      extraneous: 0,
      stale: 0,
      unsafe_schema: 0,
      duplicate: 0,
      invalid_id: 0,
      overdue: 0,
      terminal_failure: 0,
    };

    expect(
      assertDrive2PublicSearchParityGate({
        zeroGap: true,
        counts: { ...converged, overdue: 1 },
      }),
    ).toEqual({ serveClass: "seam_unmet", blockingCount: 1 });

    expect(
      assertDrive2PublicSearchParityGate({
        zeroGap: true,
        counts: { ...converged, terminal_failure: 1 },
      }),
    ).toEqual({ serveClass: "seam_unmet", blockingCount: 1 });

    expect(
      assertDrive2PublicSearchParityGate({ zeroGap: true, counts: converged }),
    ).toEqual({ serveClass: "exact", blockingCount: 0 });
  });

  it("keeps every archetype reproducible at 320px and 1440px", () => {
    const report = buildDrive2ParityCloseoutCoverage();

    expect(Object.keys(report.archetypes).sort()).toEqual(
      [...CORE_JOURNEY_ARCHETYPES].sort(),
    );
    for (const archetype of CORE_JOURNEY_ARCHETYPES) {
      expect(report.archetypes[archetype].viewportIds).toEqual(
        expect.arrayContaining(["mobile-320", "desktop-1440"]),
      );
      expect(report.archetypes[archetype].scenarioCount).toBeGreaterThan(0);
    }
  });

  it("binds all mutation intents and all living-object kinds into the closeout", () => {
    const report = buildDrive2ParityCloseoutCoverage();

    expect(report.authIntentActions).toEqual([...AUTH_INTENT_ACTIONS]);
    expect(report.objectKinds).toEqual([
      ...DRIVE2_CLOSEOUT_REQUIRED_OBJECT_KINDS,
    ]);
    expect(
      report.journeys.authenticated.map(({ scenarioId }) => scenarioId),
    ).toEqual(
      expect.arrayContaining([
        "intent:ove174-i001",
        "intent:ove174-i002",
        "intent:ove174-i003",
        "intent:ove174-i005",
        "workspace:workspace-dense",
        "creation:ove182-c001",
        "creation:ove182-c002",
        "creation:ove182-c003",
        "creation:ove182-c012",
        "social:feed-dense",
        "social:notifications-dense",
      ]),
    );
  });

  it("fails closed when a required journey archetype disappears", () => {
    const scenarios = CORE_JOURNEY_SCENARIOS.filter(
      ({ archetype }) => archetype !== "community",
    );
    const report = buildDrive2ParityCloseoutCoverage({ scenarios });

    expect(report.missing.archetypes).toContain("community");
    expect(report.missing.screenshotEvidenceArchetypes).toContain("community");
    expect(report.missing.authenticatedJourneyScenarios).toContain(
      "community:ove184-community-member",
    );
    expect(() => assertDrive2ParityCloseoutCoverage(report)).toThrow(
      /OVE-186 closeout coverage is incomplete/,
    );
  });
});
