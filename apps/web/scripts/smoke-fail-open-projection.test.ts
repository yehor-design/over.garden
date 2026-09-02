import { describe, expect, it } from "vitest";

import {
  projectionReceiptSemanticDigest,
  runBoundedProjectionDependency,
  runFailOpenProjectionSmoke,
} from "./smoke-fail-open-projection";

describe("OVE-331 fail-open projection smoke", () => {
  it("serves verified and partial search media projection classes", async () => {
    const report = await runFailOpenProjectionSmoke();

    expect(report).toMatchObject({
      schemaVersion: "ove331.failOpenProjectionReceipt.v1",
      issue: "OVE-331",
      status: "served_with_quality",
      durationScope: "projection_admission_decision",
      performanceBudgetMs: 750,
      canonicalWriteCount: 0,
      locales: ["uk", "bg", "ru"],
      controls: {
        retryProjectionRebuildCommand: "usable",
        projectionStatusCommand: "usable",
      },
    });
    expect(report.ownerReceipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "search_projection",
          scenario: "missing_coarse_region",
          outcome: "admitted_partial",
          qualityClass: "partial",
          qualityReasons: ["coarse_region_unavailable"],
        }),
        expect.objectContaining({
          owner: "search_projection",
          scenario: "unusable_optional_cover",
          outcome: "admitted_partial",
          qualityReasons: ["media_projection_unresolved"],
        }),
        expect.objectContaining({
          owner: "media_projection",
          scenario: "converted_transitional_media",
          outcome: "excluded",
          qualityClass: "unverified",
          qualityReasons: ["media_projection_unresolved"],
        }),
      ]),
    );
    expect(report.classCounts.verified).toBeGreaterThan(0);
    expect(report.classCounts.partial).toBeGreaterThan(0);
  });

  it("keeps private erased revoked forbidden precise location locale and canonical evidence excluded", async () => {
    const report = await runFailOpenProjectionSmoke();
    const serialized = JSON.stringify(report);

    expect(report.hardExclusionCounts).toEqual({
      erased_journal: 1,
      forbidden_field: 1,
      invalid_identity: 1,
      private_journal: 1,
      revoked_media: 1,
    });
    expect(report.canonicalWriteCount).toBe(0);
    expect(serialized).not.toMatch(
      /ownerUserId|mediaKey|quarantineKey|latitude|longitude|coordinates|email|userAgent|ipAddress|50\.45010/i,
    );
  });

  it("keeps replay and concurrent projection decisions deterministic", async () => {
    const [first, replay, concurrent] = await Promise.all([
      runFailOpenProjectionSmoke(),
      runFailOpenProjectionSmoke(),
      runFailOpenProjectionSmoke(),
    ]);

    expect(projectionReceiptSemanticDigest(first)).toBe(
      projectionReceiptSemanticDigest(replay),
    );
    expect(projectionReceiptSemanticDigest(first)).toBe(
      projectionReceiptSemanticDigest(concurrent),
    );
  });

  it("returns explicit analytics delivery classes without a false persistence claim", async () => {
    const report = await runFailOpenProjectionSmoke();

    expect(report.ownerReceipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "analytics_delivery",
          scenario: "event_recorded",
          outcome: "recorded_verified",
          qualityClass: "verified",
          qualityReasons: [],
        }),
        expect.objectContaining({
          owner: "analytics_delivery",
          scenario: "event_store_unavailable",
          outcome: "delivery_degraded",
          qualityClass: "unverified",
          qualityReasons: ["analytics_delivery_unavailable"],
        }),
      ]),
    );
  });

  it("bounds timeout and cancellation while preventing a late result", async () => {
    let resolveLate: (() => void) | undefined;
    let observedAbort = false;
    const receipt = await runBoundedProjectionDependency({
      owner: "analytics_delivery",
      deadlineMs: 20,
      fallback: {
        qualityClass: "unverified",
        qualityReasons: ["analytics_delivery_unavailable"],
      },
      dependency: (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            observedAbort = true;
          });
          resolveLate = () =>
            resolve({ qualityClass: "verified", qualityReasons: [] });
        }),
    });

    expect(receipt).toMatchObject({
      owner: "analytics_delivery",
      dependencyState: "timed_out",
      cancellationClass: "aborted",
      qualityClass: "unverified",
      qualityReasons: ["analytics_delivery_unavailable"],
      canonicalWriteCount: 0,
    });
    expect(receipt.durationMs).toBeLessThanOrEqual(750);
    expect(observedAbort).toBe(true);

    resolveLate?.();
    await Promise.resolve();
    expect(receipt.qualityClass).toBe("unverified");
    expect(receipt.dependencyState).toBe("timed_out");
  });
});
