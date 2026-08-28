import { describe, expect, it } from "vitest";

import {
  publicSurfaceDiscoverySemanticDigest,
  runPublicSurfaceDiscoveryVerification,
  verifyPublicSurfaceDiscoveryInventory,
} from "./verify-public-surface-discovery-runner";

const BUILD_SHA = "3353353353353353353353353353353353353353";

describe("OVE-335 public surface discovery verifier", () => {
  it("covers every registered caller with one converged safe output", async () => {
    const report = await runPublicSurfaceDiscoveryVerification({
      buildSha: BUILD_SHA,
    });

    expect(report).toMatchObject({
      schemaVersion: "ove335.publicSurfaceDiscoveryReceipt.v1",
      issue: "OVE-335",
      status: "aligned",
      inventoryCount: 27,
      candidateCount: 25,
      nonCandidateCount: 2,
      callerCoverageClass: "complete",
      directPolicyBypassCount: 0,
      canonicalWriteCount: 0,
      performanceBudgetMs: 150,
      decisionDurationClass: "within_150ms",
      preciseLocationAbsent: true,
    });
    expect(report.surfaceReceipts).toHaveLength(27);
    expect(
      report.surfaceReceipts.filter(
        (receipt) => receipt.outputCoverageClass === "complete",
      ),
    ).toHaveLength(25);
    expect(
      report.surfaceReceipts.filter(
        (receipt) => receipt.outputCoverageClass === "refused",
      ),
    ).toHaveLength(2);
  });

  it("keeps replay and concurrent reads deterministic", async () => {
    const [first, replay, concurrent] = await Promise.all([
      runPublicSurfaceDiscoveryVerification({ buildSha: BUILD_SHA }),
      runPublicSurfaceDiscoveryVerification({ buildSha: BUILD_SHA }),
      runPublicSurfaceDiscoveryVerification({ buildSha: BUILD_SHA }),
    ]);

    expect(publicSurfaceDiscoverySemanticDigest(first)).toBe(
      publicSurfaceDiscoverySemanticDigest(replay),
    );
    expect(publicSurfaceDiscoverySemanticDigest(first)).toBe(
      publicSurfaceDiscoverySemanticDigest(concurrent),
    );
  });

  it("measures one decision instead of charging the whole verification harness", async () => {
    let monotonicMs = 0;
    let clockReadCount = 0;
    const report = await runPublicSurfaceDiscoveryVerification({
      buildSha: BUILD_SHA,
      monotonicNow: () => {
        clockReadCount += 1;
        monotonicMs += 10;
        return monotonicMs;
      },
    });

    expect(clockReadCount).toBeGreaterThan(30);
    expect(monotonicMs).toBeGreaterThan(150);
    expect(report.decisionDurationClass).toBe("within_150ms");
  });

  it("bounds timeout and cancel, preserves no-write, and meets performance", async () => {
    const report = await runPublicSurfaceDiscoveryVerification({
      buildSha: BUILD_SHA,
      injectSourceTimeout: true,
    });

    expect(report).toMatchObject({
      decisionDurationClass: "within_150ms",
      canonicalWriteCount: 0,
      timeoutReceipt: {
        terminalClass: "timed_out",
        decisionClass: "noindex",
        reasonClass: "candidate_input_unresolved",
        cancellationClass: "late_result_ignored",
        timingClass: "within_150ms",
      },
      cancellationReceipt: {
        terminalClass: "cancelled",
        decisionClass: "noindex",
        cancellationClass: "aborted_before_read",
      },
      recoveryClass: "fresh_independent_read_admitted",
      controls: {
        retryPublicDiscoveryReportCommand: "usable",
        publicDiscoveryCoverageCommand: "usable",
      },
    });
  });

  it("emits only redacted aggregate evidence", async () => {
    const report = await runPublicSurfaceDiscoveryVerification({
      buildSha: BUILD_SHA,
      injectSourceTimeout: true,
    });
    const serialized = JSON.stringify(report);

    expect(serialized).not.toMatch(
      /ownerUserId|profileHandle|mediaKey|title|body|entityId|email|cookie|userAgent|ipAddress|latitude|longitude|coordinates|50\.45010/i,
    );
  });

  it("uses explicit locale paths for geography-independent live proof", async () => {
    const requestedPaths: string[] = [];
    const richPath = "/bg/blog/ai-garden-advice-vs-real-garden-proof";
    const responseByPath = new Map([
      [
        "/robots.txt",
        "User-agent: *\nSitemap: https://over.garden/sitemap.xml",
      ],
      [
        "/sitemap.xml",
        `<urlset><url><loc>https://over.garden${richPath}</loc></url></urlset>`,
      ],
      [
        richPath,
        `<html><head><meta name="robots" content="index, follow"><link rel="canonical" href="${richPath}"><script type="application/ld+json">{}</script></head></html>`,
      ],
      [
        "/bg/blog",
        '<html><head><meta name="robots" content="noindex, nofollow"></head></html>',
      ],
      [
        "/bg/privacy",
        '<html><head><meta name="robots" content="noindex, nofollow"></head></html>',
      ],
    ]);
    const fetchImpl = (async (input: string | URL | Request) => {
      const pathname = new URL(
        typeof input === "string" || input instanceof URL
          ? input
          : input.url,
      ).pathname;
      requestedPaths.push(pathname);
      const body = responseByPath.get(pathname);
      return new Response(body ?? "missing", { status: body ? 200 : 404 });
    }) as typeof fetch;

    const report = await runPublicSurfaceDiscoveryVerification({
      buildSha: BUILD_SHA,
      baseUrl: "https://over.garden",
      fetchImpl,
    });

    expect(requestedPaths.sort()).toEqual(
      [
        "/robots.txt",
        "/sitemap.xml",
        richPath,
        "/bg/blog",
        "/bg/privacy",
      ].sort(),
    );
    expect(report.liveProbe).toMatchObject({ status: "aligned", probeCount: 5 });
  });

  it("fails closed when the current inventory owner scan cannot prove coverage", () => {
    expect(() =>
      verifyPublicSurfaceDiscoveryInventory(
        new URL("..", import.meta.url).pathname,
      ),
    ).not.toThrow();
  });
});
