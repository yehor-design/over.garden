import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  OVE304_APPROVAL_DIGEST,
  OVE304_APPROVED_PLAN,
  buildArchive410FailureReceipt,
  buildArchive410ReplayNamespace,
  classifyArchive410Html,
  isAuthoritativeMeiliDocumentAbsence,
  parseArchive410CliArgs,
  resolveApprovedArchiveRedirect,
  runApprovedArchive410Proof,
  settleArchive410WithinDeadline,
  validateArchive410RecoveryState,
  type Archive410Adapter,
  type Archive410Boundary,
  type Archive410CleanupReadback,
  type Archive410ReceiptV1,
  type Archive410Verification,
} from "./recertify-final-main-archive-410";

const IMPLEMENTATION_SHA = "a".repeat(40);
const SAFE_BOUNDARY: Archive410Boundary = {
  deploymentSha: IMPLEMENTATION_SHA,
  canaryCount: 0,
  ownerAccessClass: "task_owned_or_absent",
  evidenceClass: "closed_counts_and_booleans_only",
};
const SAFE_VERIFICATION: Archive410Verification = {
  applyCount: 1,
  responseClass: "http_410",
  tombstoneClass: "generic_content_free",
  robotsClass: "noindex_nofollow",
  publicEligibilityClass: "revoked",
  searchProjectionClass: "authoritative_absent",
  preciseLocationPresent: false,
  privateContentPresent: false,
  anotherOwnerEffects: 0,
};
const CLEAN: Archive410CleanupReadback = {
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
    approvalDigest: mode === "apply" ? OVE304_APPROVAL_DIGEST : undefined,
    timeoutMs: 30_000,
  };
}

function adapter(
  overrides: Partial<Archive410Adapter> = {},
): Archive410Adapter {
  let saved: Archive410ReceiptV1 | null = null;
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

describe("OVE-304 exact plan and privacy boundary", () => {
  it("classifies an exact deployed zero-canary plan with zero effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedArchive410Proof(options("plan"), proof);

    expect(receipt).toMatchObject({
      environment: "production",
      implementationSha: IMPLEMENTATION_SHA,
      planDigest: OVE304_APPROVAL_DIGEST,
      authorizationDigest: OVE304_APPROVAL_DIGEST,
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

    const receipt = await runApprovedArchive410Proof(options(), proof);

    expect(receipt).toMatchObject({
      state: "failed",
      resultClass: "refused",
      applyCount: 0,
    });
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("requires the immutable production approval digest before lock or effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedArchive410Proof(
      { ...options(), approvalDigest: "f".repeat(64) },
      proof,
    );

    expect(receipt).toMatchObject({ state: "failed", resultClass: "refused" });
    expect(proof.acquireApplyLock).not.toHaveBeenCalled();
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("uses an OVE-304-only replay namespace", () => {
    expect(buildArchive410ReplayNamespace(IMPLEMENTATION_SHA)).toBe(
      "205db79b804ca846c68764aca95ec36ccf6ee88688808c86ea3f6bab3206192d",
    );
  });

  it("pins the approved operation to its exact normalized plan", () => {
    expect(
      createHash("sha256").update(OVE304_APPROVED_PLAN).digest("hex"),
    ).toBe(OVE304_APPROVAL_DIGEST);
    expect(OVE304_APPROVED_PLAN).toContain("OVE-304|production");
    expect(OVE304_APPROVED_PLAN).toContain("archive it once");
    expect(OVE304_APPROVED_PLAN).toContain("one-canary");
  });

  it("accepts only the generic noindex 410 shell without entry or precise-location evidence", () => {
    expect(
      classifyArchive410Html(
        '<!doctype html><meta name="robots" content="noindex, nofollow"/><header><span>OverGarden</span></header><main><h1>Removed</h1></main>',
        ["private-marker", "canary title", "canary body"],
        "noindex, nofollow",
      ),
    ).toEqual({
      tombstoneClass: "generic_content_free",
      robotsClass: "noindex_nofollow",
      preciseLocationPresent: false,
      privateContentPresent: false,
    });

    expect(
      classifyArchive410Html(
        '<main data-public-journal-entry="true">50.4501, 30.5234 private-marker</main>',
        ["private-marker"],
        null,
      ),
    ).toMatchObject({
      tombstoneClass: "unexpected",
      robotsClass: "unexpected",
      preciseLocationPresent: true,
      privateContentPresent: true,
    });

    expect(
      classifyArchive410Html(
        "<!doctype html><header><span>OverGarden</span></header><main>noindex, nofollow</main>",
        [],
        "noindex, nofollow",
      ),
    ).toMatchObject({
      tombstoneClass: "generic_content_free",
      robotsClass: "unexpected",
    });

    expect(
      classifyArchive410Html(
        '<!doctype html><meta name="robots" content="noindex, nofollow"/><header><span>OverGarden</span></header><main>00000000-0000-4000-8000-000000000304</main>',
        ["00000000-0000-4000-8000-000000000304"],
        "noindex, nofollow",
      ),
    ).toMatchObject({
      tombstoneClass: "unexpected",
      privateContentPresent: true,
    });
  });

  it("follows only one exact same-origin locale redirect for a public journal", () => {
    expect(
      resolveApprovedArchiveRedirect(
        "/journal/safe-proof",
        307,
        "/bg/journal/safe-proof",
      ),
    ).toBe("https://over.garden/bg/journal/safe-proof");
    expect(
      resolveApprovedArchiveRedirect(
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
        resolveApprovedArchiveRedirect("/journal/safe-proof", status, location),
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
      isAuthoritativeMeiliDocumentAbsence({
        cause: {
          code: "document_not_found",
          type: "invalid_request",
        },
        response: { status: 404 },
      }),
    ).toBe(true);
    expect(
      isAuthoritativeMeiliDocumentAbsence({
        cause: {
          code: "document_not_found",
          type: "invalid_request",
        },
        response: { status: 500 },
      }),
    ).toBe(false);
    expect(
      isAuthoritativeMeiliDocumentAbsence({
        cause: {
          code: "invalid_api_key",
          type: "auth",
        },
        response: { status: 404 },
      }),
    ).toBe(false);
    expect(
      isAuthoritativeMeiliDocumentAbsence(new Error("network error")),
    ).toBe(false);
  });

  it("accepts only one exact task-scoped recovery identity", () => {
    const entryId = "00000000-0000-4000-8000-000000000304";
    expect(
      validateArchive410RecoveryState(
        {
          version: 1,
          implementationSha: IMPLEMENTATION_SHA,
          entryIds: [entryId],
          publicPaths: ["/journal/ove-304-disposable-proof"],
        },
        IMPLEMENTATION_SHA,
      ),
    ).toEqual({
      version: 1,
      implementationSha: IMPLEMENTATION_SHA,
      entryIds: [entryId],
      publicPaths: ["/journal/ove-304-disposable-proof"],
    });

    for (const drift of [
      { implementationSha: "f".repeat(40) },
      { entryIds: [entryId, "00000000-0000-4000-8000-000000000305"] },
      { entryIds: ["not-a-uuid"] },
      { publicPaths: ["https://example.com/journal/proof"] },
      { publicPaths: ["/journal/proof?private=1"] },
    ]) {
      expect(() =>
        validateArchive410RecoveryState(
          {
            version: 1,
            implementationSha: IMPLEMENTATION_SHA,
            entryIds: [entryId],
            publicPaths: ["/journal/ove-304-disposable-proof"],
            ...drift,
          },
          IMPLEMENTATION_SHA,
        ),
      ).toThrow("recovery state");
    }
  });
});

describe("OVE-304 effect, replay, race, timeout, and cleanup", () => {
  it("accepts one exact archive result and proves cleanup twice", async () => {
    const proof = adapter();
    const receipt = await runApprovedArchive410Proof(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 1,
      resultClass: "verified_archive_410",
      cleanupClass: "authoritative_absent_twice",
      state: "cleaned",
    });
    expect(proof.applyCanary).toHaveBeenCalledOnce();
    expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
    expect(proof.writeReplayReceipt).toHaveBeenCalledOnce();
  });

  it("returns already_cleaned on replay without a second effect", async () => {
    const proof = adapter();
    const first = await runApprovedArchive410Proof(options(), proof);
    const second = await runApprovedArchive410Proof(options(), proof);

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

    const winner = runApprovedArchive410Proof(options(), proof);
    await vi.waitFor(() => expect(effects).toBe(1));
    const loser = await runApprovedArchive410Proof(options(), proof);
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

    const receipt = await runApprovedArchive410Proof(options(), proof);

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

    const receipt = await runApprovedArchive410Proof(options(), proof);

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
      const pending = settleArchive410WithinDeadline(
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

describe("OVE-304 closed receipt, CLI, and runbook", () => {
  it("drops unsafe error payloads and emits the exact closed field set", () => {
    const receipt = buildArchive410FailureReceipt({
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
      parseArchive410CliArgs([
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
      parseArchive410CliArgs([
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
      parseArchive410CliArgs([
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
      parseArchive410CliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        "--apply",
        "--approval-digest",
        OVE304_APPROVAL_DIGEST,
      ]),
    ).toEqual(options());

    expect(() =>
      parseArchive410CliArgs([
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
        "../../../docs/runbooks/OVE_304_FINAL_MAIN_ARCHIVE_410.md",
        import.meta.url,
      ),
      "utf8",
    );

    expect(runbook).toContain(OVE304_APPROVAL_DIGEST);
    expect(runbook).toContain("--plan");
    expect(runbook).toContain("--apply");
    expect(runbook).toContain("--cleanup");
    expect(runbook).toContain("--status");
    expect(runbook).toContain("--cancel");
    expect(runbook).toContain("journal-repository.ts");
    expect(runbook).toContain("public-projection-outbox.ts");
    expect(runbook).toContain("public-journal-entry-lifecycle.ts");
    expect(runbook).toContain("one-hop locale redirect");
    expect(runbook).toContain("cleanup twice");
    expect(runbook).toContain("never run a second apply");
  });
});
