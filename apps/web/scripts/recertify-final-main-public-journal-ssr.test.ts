import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  OVE303_APPROVAL_DIGEST,
  buildPublicJournalSsrFailureReceipt,
  buildPublicJournalSsrReplayNamespace,
  classifyPublicJournalSsrHtml,
  isAuthoritativeMeiliDocumentAbsence,
  parsePublicJournalSsrCliArgs,
  resolveApprovedPublicJournalRedirect,
  runApprovedPublicJournalSsrProof,
  settlePublicJournalSsrWithinDeadline,
  type PublicJournalSsrAdapter,
  type PublicJournalSsrBoundary,
  type PublicJournalSsrCleanupReadback,
  type PublicJournalSsrReceiptV1,
  type PublicJournalSsrVerification,
} from "./recertify-final-main-public-journal-ssr";

const IMPLEMENTATION_SHA = "a".repeat(40);
const SAFE_BOUNDARY: PublicJournalSsrBoundary = {
  deploymentSha: IMPLEMENTATION_SHA,
  canaryCount: 0,
  ownerAccessClass: "task_owned_or_absent",
  evidenceClass: "closed_counts_and_booleans_only",
};
const SAFE_VERIFICATION: PublicJournalSsrVerification = {
  applyCount: 1,
  responseClass: "http_200",
  renderClass: "server_rendered",
  robotsClass: "noindex_nofollow",
  locationClass: "hidden",
  publicEligibilityClass: "canonical_public_only",
  searchProjectionClass: "exact_safe_present",
  preciseLocationPresent: false,
  privateContentPresent: false,
  anotherOwnerEffects: 0,
};
const CLEAN: PublicJournalSsrCleanupReadback = {
  taskCanaryCount: 0,
  publicRoutePresent: false,
  searchDocumentPresent: false,
  anotherOwnerEffects: 0,
};

function options(mode: "plan" | "apply" = "apply") {
  return {
    mode,
    environment: "production" as const,
    implementationSha: IMPLEMENTATION_SHA,
    approvalDigest: mode === "apply" ? OVE303_APPROVAL_DIGEST : undefined,
    timeoutMs: 30_000,
  };
}

function adapter(
  overrides: Partial<PublicJournalSsrAdapter> = {},
): PublicJournalSsrAdapter {
  let saved: PublicJournalSsrReceiptV1 | null = null;
  return {
    acquireApplyLock: vi.fn(async () => "acquired" as const),
    releaseApplyLock: vi.fn(async () => undefined),
    readBoundary: vi.fn(async () => SAFE_BOUNDARY),
    applyCanary: vi.fn(async () => SAFE_VERIFICATION),
    cleanupCanary: vi.fn(async () => CLEAN),
    readReplayReceipt: vi.fn(async () => saved),
    writeReplayReceipt: vi.fn(async (receipt) => {
      saved = receipt;
    }),
    cancellationRequested: vi.fn(async () => false),
    ...overrides,
  };
}

describe("OVE-303 exact plan and privacy boundary", () => {
  it("classifies an exact deployed zero-canary plan with zero effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedPublicJournalSsrProof(
      options("plan"),
      proof,
    );

    expect(receipt).toMatchObject({
      environment: "production",
      implementationSha: IMPLEMENTATION_SHA,
      planDigest: OVE303_APPROVAL_DIGEST,
      authorizationDigest: OVE303_APPROVAL_DIGEST,
      canaryCountBefore: 0,
      applyCount: 0,
      resultClass: "zero_effect_plan",
      cleanupClass: "not_applicable",
      state: "code_deployed",
    });
    expect(proof.applyCanary).not.toHaveBeenCalled();
    expect(proof.cleanupCanary).not.toHaveBeenCalled();
  });

  it.each([
    ["deployment drift", { deploymentSha: "f".repeat(40) }],
    ["count drift", { canaryCount: 1 }],
    ["another owner", { ownerAccessClass: "another_owner" as const }],
    ["unsafe evidence", { evidenceClass: "unsafe" as const }],
  ])("refuses %s before apply", async (_label, boundaryPatch) => {
    const proof = adapter({
      readBoundary: vi.fn(async () => ({
        ...SAFE_BOUNDARY,
        ...boundaryPatch,
      })),
    });

    const receipt = await runApprovedPublicJournalSsrProof(options(), proof);

    expect(receipt).toMatchObject({
      state: "failed",
      resultClass: "refused",
      applyCount: 0,
    });
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("requires the immutable production approval digest before lock or effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedPublicJournalSsrProof(
      { ...options(), approvalDigest: "f".repeat(64) },
      proof,
    );

    expect(receipt).toMatchObject({ state: "failed", resultClass: "refused" });
    expect(proof.acquireApplyLock).not.toHaveBeenCalled();
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("uses an OVE-303-only replay namespace", () => {
    expect(buildPublicJournalSsrReplayNamespace(IMPLEMENTATION_SHA)).toBe(
      "dfdb34b57871b6153817e68bcbecf7502657dbd06f7a02cccf25f6821382f67d",
    );
  });

  it("accepts only server-rendered noindex HTML without private or precise-location evidence", () => {
    expect(
      classifyPublicJournalSsrHtml(
        '<meta name="robots" content="noindex, nofollow"/><main data-public-journal-entry="true">Safe proof</main>',
        "private-marker",
      ),
    ).toEqual({
      responseClass: "http_200",
      renderClass: "server_rendered",
      robotsClass: "noindex_nofollow",
      preciseLocationPresent: false,
      privateContentPresent: false,
    });

    expect(
      classifyPublicJournalSsrHtml(
        '<main data-public-journal-entry="true">50.4501, 30.5234 private-marker</main>',
        "private-marker",
      ),
    ).toMatchObject({
      robotsClass: "unexpected",
      preciseLocationPresent: true,
      privateContentPresent: true,
    });
  });

  it("follows only one exact same-origin locale redirect for a public journal", () => {
    expect(
      resolveApprovedPublicJournalRedirect(
        "/journal/safe-proof",
        307,
        "/bg/journal/safe-proof",
      ),
    ).toBe("https://over.garden/bg/journal/safe-proof");
    expect(
      resolveApprovedPublicJournalRedirect(
        "/journal/safe-proof",
        307,
        "https://over.garden/ru/journal/safe-proof",
      ),
    ).toBe("https://over.garden/ru/journal/safe-proof");

    for (const [status, location] of [
      [308, "/bg/journal/safe-proof"],
      [307, "/uk/journal/safe-proof"],
      [307, "/bg/journal/another-proof"],
      [307, "/bg/journal/safe-proof?private=1"],
      [307, "https://example.com/bg/journal/safe-proof"],
      [307, "//example.com/bg/journal/safe-proof"],
    ] as const) {
      expect(
        resolveApprovedPublicJournalRedirect(
          "/journal/safe-proof",
          status,
          location,
        ),
      ).toBeNull();
    }
  });

  it("accepts only the provider's exact document-not-found class as search absence", () => {
    expect(
      isAuthoritativeMeiliDocumentAbsence({ code: "document_not_found" }),
    ).toBe(true);
    expect(
      isAuthoritativeMeiliDocumentAbsence(
        new Error("Meilisearch document_not_found"),
      ),
    ).toBe(true);
    expect(isAuthoritativeMeiliDocumentAbsence(new Error("not found"))).toBe(
      false,
    );
    expect(
      isAuthoritativeMeiliDocumentAbsence({ code: "invalid_api_key" }),
    ).toBe(false);
    expect(
      isAuthoritativeMeiliDocumentAbsence(new Error("network error")),
    ).toBe(false);
  });
});

describe("OVE-303 effect, replay, race, timeout, and cleanup", () => {
  it("accepts one exact SSR result and proves cleanup twice", async () => {
    const proof = adapter();
    const receipt = await runApprovedPublicJournalSsrProof(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 1,
      resultClass: "verified_public_journal_ssr",
      cleanupClass: "authoritative_absent_twice",
      state: "cleaned",
    });
    expect(proof.applyCanary).toHaveBeenCalledOnce();
    expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
    expect(proof.writeReplayReceipt).toHaveBeenCalledOnce();
  });

  it("returns already_cleaned on replay without a second effect", async () => {
    const proof = adapter();
    const first = await runApprovedPublicJournalSsrProof(options(), proof);
    const second = await runApprovedPublicJournalSsrProof(options(), proof);

    expect(first.state).toBe("cleaned");
    expect(second).toMatchObject({
      applyCount: 0,
      resultClass: "already_cleaned",
      cleanupClass: "authoritative_absent_twice",
      state: "already_cleaned",
    });
    expect(proof.applyCanary).toHaveBeenCalledOnce();
  });

  it("allows one concurrent winner and one bounded loser", async () => {
    let held = false;
    let effects = 0;
    let releaseWinner: (() => void) | undefined;
    const winnerBarrier = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });
    const proof = adapter({
      acquireApplyLock: vi.fn(async () => {
        if (held) return "contended" as const;
        held = true;
        return "acquired" as const;
      }),
      releaseApplyLock: vi.fn(async () => {
        held = false;
      }),
      applyCanary: vi.fn(async () => {
        effects += 1;
        await winnerBarrier;
        return SAFE_VERIFICATION;
      }),
    });

    const winner = runApprovedPublicJournalSsrProof(options(), proof);
    await vi.waitFor(() => expect(effects).toBe(1));
    const loser = await runApprovedPublicJournalSsrProof(options(), proof);
    releaseWinner?.();
    const winnerReceipt = await winner;

    expect(winnerReceipt.state).toBe("cleaned");
    expect(loser).toMatchObject({
      state: "failed",
      resultClass: "bounded_loser",
      applyCount: 0,
    });
    expect(effects).toBe(1);
  });

  it("fails unsafe partial success, cleans twice, and never retries", async () => {
    const applyCanary = vi.fn(async () => ({
      ...SAFE_VERIFICATION,
      preciseLocationPresent: true,
    }));
    const proof = adapter({ applyCanary });

    const receipt = await runApprovedPublicJournalSsrProof(options(), proof);

    expect(receipt).toMatchObject({
      state: "failed",
      resultClass: "failed",
      cleanupClass: "authoritative_absent_twice",
    });
    expect(applyCanary).toHaveBeenCalledOnce();
    expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
    expect(proof.writeReplayReceipt).not.toHaveBeenCalled();
  });

  it("records uncertain cleanup as failed", async () => {
    const proof = adapter({
      cleanupCanary: vi
        .fn()
        .mockResolvedValueOnce(CLEAN)
        .mockResolvedValueOnce({ ...CLEAN, searchDocumentPresent: true }),
    });

    const receipt = await runApprovedPublicJournalSsrProof(options(), proof);

    expect(receipt).toMatchObject({
      state: "failed",
      resultClass: "failed",
      cleanupClass: "uncertain",
    });
  });

  it("fences late completion at the 30-second budget", async () => {
    vi.useFakeTimers();
    try {
      let aborts = 0;
      const pending = settlePublicJournalSsrWithinDeadline(
        (signal) =>
          new Promise<string>((resolve) => {
            signal.addEventListener("abort", () => {
              aborts += 1;
              setTimeout(() => resolve("late"), 1);
            });
          }),
        30_000,
      );
      const rejection = expect(pending).rejects.toThrow("exceeded 30000ms");

      await vi.advanceTimersByTimeAsync(30_000);
      await rejection;
      expect(aborts).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(Promise.allSettled([pending])).resolves.toEqual([
        expect.objectContaining({ status: "rejected" }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("OVE-303 closed receipt, CLI, and runbook", () => {
  it("drops unsafe error payloads and emits the exact closed field set", () => {
    const receipt = buildPublicJournalSsrFailureReceipt({
      environment: "production",
      implementationSha: IMPLEMENTATION_SHA,
      canaryCountBefore: 0,
      applyCount: 0,
      durationMs: 30_000,
      resultClass: "failed",
      cleanupClass: "uncertain",
      unsafeError: {
        email: "gardener@example.com",
        cookie: "secret",
        coordinates: [50.45, 30.52],
        body: "private text",
      },
    });

    expect(Object.keys(receipt).sort()).toEqual(
      [
        "version",
        "environment",
        "implementationSha",
        "planDigest",
        "authorizationDigest",
        "canaryCountBefore",
        "applyCount",
        "resultClass",
        "cleanupClass",
        "durationMs",
        "state",
        "evidenceDigest",
      ].sort(),
    );
    expect(JSON.stringify(receipt)).not.toMatch(
      /email|cookie|coordinates|50\.45|30\.52|secret|private text/i,
    );
  });

  it("requires exact production confirmation, SHA, one mode, and apply digest", () => {
    expect(
      parsePublicJournalSsrCliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        "--plan",
      ]),
    ).toEqual(options("plan"));

    expect(() =>
      parsePublicJournalSsrCliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "local",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        "--plan",
      ]),
    ).toThrow("--confirm-environment production");

    expect(() =>
      parsePublicJournalSsrCliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        "--apply",
      ]),
    ).toThrow("--approval-digest");

    expect(
      parsePublicJournalSsrCliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        "--apply",
        "--approval-digest",
        OVE303_APPROVAL_DIGEST,
      ]),
    ).toEqual(options());

    expect(() =>
      parsePublicJournalSsrCliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        "--plan",
        "--broad-user-sweep",
      ]),
    ).toThrow("unsupported flag");
  });

  it("pins the immutable plan, canonical owners, controls, and cleanup order", () => {
    const runbook = readFileSync(
      new URL(
        "../../../docs/runbooks/OVE_303_FINAL_MAIN_PUBLIC_JOURNAL_SSR.md",
        import.meta.url,
      ),
      "utf8",
    );

    expect(runbook).toContain(OVE303_APPROVAL_DIGEST);
    expect(runbook).toContain("--plan");
    expect(runbook).toContain("--apply");
    expect(runbook).toContain("--cleanup");
    expect(runbook).toContain("--status");
    expect(runbook).toContain("--cancel");
    expect(runbook).toContain("journal-repository.ts");
    expect(runbook).toContain("public-projection-outbox.ts");
    expect(runbook).toContain("public-surface-indexing-policy.ts");
    expect(runbook).toContain("one-hop locale redirect");
    expect(runbook).toContain("cleanup twice");
    expect(runbook).toContain("never run a second apply");
  });
});
