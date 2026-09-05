import { describe, expect, it } from "vitest";

import {
  evaluateSurface,
  parseArgs,
  readFailureClasses,
  renderWorkspaceResilienceReceipt,
  proveWorkspaceResilience,
  SKELETON_MARKERS,
  WORKSPACE_SURFACE_PROBES,
} from "./prove-workspace-resilience";

const PROBE = {
  surface: "profile",
  path: "/garden/profile",
  heading: "Мій публічний профіль",
};

/** A fallback that was streamed and then replaced, which is the healthy shape. */
function degradedHtml() {
  return `<main data-workspace-surface="profile" data-workspace-state="loading"><h1>Мій публічний профіль</h1></main><div hidden id="S:0"><section data-section-failure="connection_unavailable">…</section></div><script>$RC("B:0","S:0")</script>`;
}

/** The ADR-0023 defect: a fallback written, and nothing that ever completes it. */
function strandedHtml() {
  return `<main data-workspace-surface="profile" data-workspace-state="loading"><h1>Мій публічний профіль</h1><section data-section-failure="connection_unavailable">…</section></main>`;
}

describe("prove:workspace-resilience", () => {
  it("passes a surface that renders its own heading and a bounded class", () => {
    const result = evaluateSurface(
      PROBE,
      degradedHtml(),
      200,
      12,
      "connection_unavailable",
    );

    expect(result.passed).toBe(true);
    expect(result.failureClasses).toEqual(["connection_unavailable"]);
    expect(result.boundaryCompletions).toBe(1);
    expect(result.strandedSkeleton).toBe(false);
  });

  it("fails a surface whose fallback was never completed", () => {
    const result = evaluateSurface(
      PROBE,
      strandedHtml(),
      200,
      12,
      "connection_unavailable",
    );

    expect(result.passed).toBe(false);
    expect(result.strandedSkeleton).toBe(true);
    expect(result.skeletonMarkers).toEqual(['data-workspace-state="loading"']);
  });

  it("fails a surface whose boundary React gave up on", () => {
    const result = evaluateSurface(
      PROBE,
      `${degradedHtml()}<script>$RX("B:1")</script>`,
      200,
      12,
      "connection_unavailable",
    );

    expect(result.passed).toBe(false);
    expect(result.boundaryErrors).toBe(1);
  });

  it("fails a surface that shows a sibling's heading", () => {
    const result = evaluateSurface(
      PROBE,
      degradedHtml().replace("Мій публічний профіль", "Простір саду"),
      200,
      12,
      "connection_unavailable",
    );

    expect(result.passed).toBe(false);
    expect(result.headingPresent).toBe(false);
  });

  it("reads only classes from the closed set", () => {
    expect(
      readFailureClasses(
        '<i data-section-failure="schema_missing"></i><i data-section-failure="not_a_class"></i>',
      ),
    ).toEqual(["schema_missing"]);
  });

  it("covers every workspace surface left after ADR-0025, each with its own path", () => {
    const paths = WORKSPACE_SURFACE_PROBES.map((probe) => probe.path);
    expect(new Set(paths).size).toBe(paths.length);
    // ADR-0023 named eleven; the three Release Center surfaces left with the
    // Stable Registry (ADR-0025).
    expect(WORKSPACE_SURFACE_PROBES).toHaveLength(8);
    expect(SKELETON_MARKERS).toContain('data-workspace-section="loading"');
  });

  it("writes a receipt of counts and classes and nothing from the response", async () => {
    const receipt = await proveWorkspaceResilience({
      baseUrl: "http://127.0.0.1:3000",
      cookie: "better-auth.session_token=private-value",
      expectedClass: "connection_unavailable",
      probes: [PROBE],
      fetchImpl: async () =>
        new Response(degradedHtml(), {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    });
    const markdown = renderWorkspaceResilienceReceipt(receipt);

    expect(receipt.passedCount).toBe(1);
    expect(receipt.failedCount).toBe(0);
    expect(markdown).toContain("`profile`");
    expect(markdown).toContain("`connection_unavailable`");
    expect(markdown).not.toContain("private-value");
    expect(markdown).not.toContain("<main");
  });

  it("sends the owner cookie exactly as given and follows no redirect", async () => {
    const seen: RequestInit[] = [];
    await proveWorkspaceResilience({
      baseUrl: "http://127.0.0.1:3000",
      cookie: "session=abc",
      expectedClass: "connection_unavailable",
      probes: [PROBE],
      fetchImpl: async (_input, init) => {
        seen.push(init ?? {});
        return new Response(degradedHtml(), { status: 200 });
      },
    });

    expect(seen[0]?.headers).toEqual({ cookie: "session=abc" });
    expect(seen[0]?.redirect).toBe("manual");
  });

  it("defaults to the local production server and the connection class", () => {
    expect(parseArgs([])).toMatchObject({
      baseUrl: "http://127.0.0.1:3000",
      expectedClass: "connection_unavailable",
    });
    expect(parseArgs(["--base-url", "http://127.0.0.1:4000"]).baseUrl).toBe(
      "http://127.0.0.1:4000",
    );
  });
});
