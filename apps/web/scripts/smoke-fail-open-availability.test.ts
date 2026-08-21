import { describe, expect, it } from "vitest";

import {
  availabilityReceiptSemanticDigest,
  runBoundedAvailabilityDependency,
  runFailOpenAvailabilitySmoke,
} from "./smoke-fail-open-availability";

describe("OVE-330 fail-open availability smoke", () => {
  it("serves every previously refused owner fixture with the closed class set", async () => {
    const report = await runFailOpenAvailabilitySmoke();

    expect(report).toMatchObject({
      schemaVersion: "ove330.failOpenAvailabilityReceipt.v1",
      issue: "OVE-330",
      status: "served_degraded",
      preciseLocationAbsent: true,
      canonicalWriteCount: 0,
      controls: {
        retryActionButton: "usable",
        continueWithoutWaitingLink: "usable",
      },
    });
    expect(report.ownerReceipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "media_presentation",
          serveClass: "clamped",
        }),
        expect.objectContaining({
          owner: "media_focal_route",
          serveClass: "clamped",
        }),
        expect.objectContaining({
          owner: "localization_coverage",
          serveClass: "probe_missing",
        }),
        expect.objectContaining({
          owner: "release_gate",
          serveClass: "seam_unmet",
        }),
        expect.objectContaining({
          owner: "operator_copy",
          serveClass: "seam_unmet",
        }),
      ]),
    );
    expect(report.classCounts).toMatchObject({
      clamped: 2,
      low_confidence: 1,
      generated: 1,
      homonymous: 2,
      probe_missing: 1,
      seam_unmet: 2,
    });
  });

  it("keeps authorization forbidden location locale keyboard and canonical evidence redacted", async () => {
    const report = await runFailOpenAvailabilitySmoke();
    const serialized = JSON.stringify(report);

    expect(report.locales).toEqual(["uk", "bg", "ru"]);
    expect(report.preciseLocationAbsent).toBe(true);
    expect(report.canonicalWriteCount).toBe(0);
    expect(report.controls).toEqual({
      retryActionButton: "usable",
      continueWithoutWaitingLink: "usable",
    });
    expect(serialized).not.toMatch(
      /ownerUserId|mediaKey|quarantineKey|latitude|longitude|coordinates|email|userAgent|ipAddress/i,
    );
  });

  it("keeps replay and concurrent class selection deterministic", async () => {
    const [first, second, concurrent] = await Promise.all([
      runFailOpenAvailabilitySmoke(),
      runFailOpenAvailabilitySmoke(),
      runFailOpenAvailabilitySmoke(),
    ]);

    expect(availabilityReceiptSemanticDigest(first)).toBe(
      availabilityReceiptSemanticDigest(second),
    );
    expect(availabilityReceiptSemanticDigest(first)).toBe(
      availabilityReceiptSemanticDigest(concurrent),
    );
  });

  it("bounds timeout and cancel while preventing a late dependency result", async () => {
    let resolveLate: (() => void) | undefined;
    let observedAbort = false;
    const startedAt = performance.now();
    const receipt = await runBoundedAvailabilityDependency({
      owner: "catalog_matching",
      deadlineMs: 20,
      fallbackClass: "low_confidence",
      dependency: (signal) =>
        new Promise<"exact">((resolve) => {
          signal.addEventListener("abort", () => {
            observedAbort = true;
          });
          resolveLate = () => resolve("exact");
        }),
    });
    const elapsedMs = performance.now() - startedAt;

    expect(receipt).toMatchObject({
      owner: "catalog_matching",
      serveClass: "low_confidence",
      dependencyState: "timed_out",
      cancellationClass: "aborted",
      canonicalWriteCount: 0,
      controls: {
        retryActionButton: "usable",
        continueWithoutWaitingLink: "usable",
      },
    });
    expect(elapsedMs).toBeLessThanOrEqual(500);
    expect(observedAbort).toBe(true);

    resolveLate?.();
    await Promise.resolve();
    expect(receipt.serveClass).toBe("low_confidence");
    expect(receipt.dependencyState).toBe("timed_out");
  });
});
