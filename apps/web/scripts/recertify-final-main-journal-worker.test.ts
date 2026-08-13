import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  OVE306_APPROVAL_DIGEST,
  OVE306_APPROVED_PLAN,
  buildJournalWorkerFailureReceipt,
  buildJournalWorkerReplayNamespace,
  classifyJournalWorkerHtml,
  isAuthoritativeMeiliDocumentAbsence,
  isExactIdentifiersOnlyJournalJobPayload,
  isExactMatchingRuntimeReadback,
  parseJournalWorkerCliArgs,
  resolveApprovedArchiveRedirect,
  runApprovedJournalWorkerProof,
  settleJournalWorkerWithinDeadline,
  validateJournalWorkerRecoveryState,
  type JournalWorkerAdapter,
  type JournalWorkerBoundary,
  type JournalWorkerCleanupReadback,
  type JournalWorkerReceiptV1,
  type JournalWorkerVerification,
} from "./recertify-final-main-journal-worker";

const IMPLEMENTATION_SHA = "a".repeat(40);
const SAFE_BOUNDARY: JournalWorkerBoundary = {
  deploymentSha: IMPLEMENTATION_SHA,
  canaryCount: 0,
  ownerAccessClass: "task_owned_or_absent",
  evidenceClass: "closed_counts_and_booleans_only",
  workerCapabilityClass: "ready_exact_handlers",
};
const SAFE_VERIFICATION: JournalWorkerVerification = {
  applyCount: 1,
  indexJobClass: "done_identifiers_only",
  publicDocumentClass: "public_safe_exact_shape",
  unindexJobClass: "done_identifiers_only",
  staleDocumentClass: "authoritative_absent",
  parityClass: "converged",
  responseClass: "http_410",
  tombstoneClass: "generic_content_free",
  robotsClass: "noindex_nofollow",
  publicEligibilityClass: "revoked",
  searchProjectionClass: "authoritative_absent",
  preciseLocationPresent: false,
  privateContentPresent: false,
  anotherOwnerEffects: 0,
};
const CLEAN: JournalWorkerCleanupReadback = {
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
    approvalDigest: mode === "apply" ? OVE306_APPROVAL_DIGEST : undefined,
    timeoutMs: 30_000,
  };
}

function adapter(
  overrides: Partial<JournalWorkerAdapter> = {},
): JournalWorkerAdapter {
  let saved: JournalWorkerReceiptV1 | null = null;
  let attempted = false;
  return {
    acquireApplyLock: vi.fn(async () => "acquired" as const),
    releaseApplyLock: vi.fn(async () => undefined),
    readBoundary: vi.fn(async () => SAFE_BOUNDARY),
    readApplyAttempt: vi.fn(async () => attempted),
    claimApplyAttempt: vi.fn(async () => {
      if (attempted) return "already_claimed" as const;
      attempted = true;
      return "claimed" as const;
    }),
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

describe("OVE-306 exact plan and privacy boundary", () => {
  it("classifies an exact deployed zero-canary plan with zero effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedJournalWorkerProof(options("plan"), proof);

    expect(receipt).toMatchObject({
      environment: "production",
      implementationSha: IMPLEMENTATION_SHA,
      planDigest: OVE306_APPROVAL_DIGEST,
      authorizationDigest: OVE306_APPROVAL_DIGEST,
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
    [
      "worker capability drift",
      { workerCapabilityClass: "unexpected" as const },
    ],
  ])("refuses %s before apply", async (_label, boundaryPatch) => {
    const proof = adapter({
      readBoundary: vi.fn(async () => ({
        ...SAFE_BOUNDARY,
        ...boundaryPatch,
      })),
    });

    const receipt = await runApprovedJournalWorkerProof(options(), proof);

    expect(receipt).toMatchObject({
      state: "failed",
      resultClass: "refused",
      applyCount: 0,
    });
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("requires the immutable production approval digest before lock or effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedJournalWorkerProof(
      { ...options(), approvalDigest: "f".repeat(64) },
      proof,
    );

    expect(receipt).toMatchObject({ state: "failed", resultClass: "refused" });
    expect(proof.acquireApplyLock).not.toHaveBeenCalled();
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("refuses a read-only plan after the single-use attempt fence exists", async () => {
    const proof = adapter({ readApplyAttempt: vi.fn(async () => true) });

    const receipt = await runApprovedJournalWorkerProof(options("plan"), proof);

    expect(receipt).toMatchObject({
      state: "failed",
      resultClass: "refused",
      applyCount: 0,
    });
    expect(proof.readBoundary).not.toHaveBeenCalled();
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("uses an OVE-306-only replay namespace", () => {
    expect(buildJournalWorkerReplayNamespace(IMPLEMENTATION_SHA)).toBe(
      "15cbebc453594159eadbb57df1bacf302dbe99bfb2d4970b254011cb45d57f68",
    );
  });

  it("pins the approved operation to its exact normalized plan", () => {
    expect(
      createHash("sha256").update(OVE306_APPROVED_PLAN).digest("hex"),
    ).toBe(OVE306_APPROVAL_DIGEST);
    expect(OVE306_APPROVED_PLAN).toContain("OVE-306|production");
    expect(OVE306_APPROVED_PLAN).toContain(
      "observe one identifiers-only index job reach done",
    );
    expect(OVE306_APPROVED_PLAN).toContain(
      "observe unindex reach done and absence",
    );
    expect(OVE306_APPROVED_PLAN).toContain("one-canary");
  });

  it("accepts only exact identifiers-only worker payloads", () => {
    const entryId = "00000000-0000-4000-8000-000000000306";
    const userId = "00000000-0000-4000-8000-000000000307";
    const exact = {
      kind: "journal_entry_index",
      journalEntryId: entryId,
      userId,
    };

    expect(
      isExactIdentifiersOnlyJournalJobPayload(
        exact,
        "journal_entry_index",
        entryId,
        userId,
      ),
    ).toBe(true);
    for (const payload of [
      { ...exact, body: "private journal text" },
      { ...exact, ownerUserId: userId },
      { ...exact, kind: "journal_entry_unindex" },
      { ...exact, userId: "00000000-0000-4000-8000-000000000308" },
    ]) {
      expect(
        isExactIdentifiersOnlyJournalJobPayload(
          payload,
          "journal_entry_index",
          entryId,
          userId,
        ),
      ).toBe(false);
    }
  });

  it("accepts only the exact live six-handler ready contract", () => {
    const capabilities = {
      schemaVersion: "ove194.matchingRuntime.v1",
      service: "overgarden-matching",
      status: "available",
      release: {
        commitSha: "b".repeat(40),
        imageDigest: `sha256:${"c".repeat(64)}`,
        schemaCompatibilityClass: "ove190.matching-schema.v1",
      },
      queue: {
        name: "matching",
        supportedHandlers: [
          "catalog_alias_suggestions_refresh",
          "catalog_fuzzy_duplicate_qa_refresh",
          "catalog_match_suggestions_refresh",
          "catalog_typeahead_reindex",
          "journal_entry_index",
          "journal_entry_unindex",
        ],
      },
    };
    const readiness = {
      ...capabilities,
      status: "ready",
      dependencies: {
        api: { status: "available" },
        postgres: { status: "available" },
        jobQueue: { status: "available" },
        meilisearch: { status: "available" },
        worker: { status: "available" },
        queueRecovery: {
          claimCompatible: "available",
          handlerCompatible: "available",
          unsupportedRetryingClass: "none",
        },
      },
    };

    expect(isExactMatchingRuntimeReadback(capabilities, false)).toBe(true);
    expect(isExactMatchingRuntimeReadback(readiness, true)).toBe(true);
    expect(
      isExactMatchingRuntimeReadback(
        {
          ...readiness,
          queue: {
            ...readiness.queue,
            supportedHandlers: ["journal_entry_index"],
          },
        },
        true,
      ),
    ).toBe(false);
    expect(
      isExactMatchingRuntimeReadback(
        {
          ...readiness,
          dependencies: {
            ...readiness.dependencies,
            worker: { status: "unavailable" },
          },
        },
        true,
      ),
    ).toBe(false);
    expect(
      isExactMatchingRuntimeReadback(
        {
          ...readiness,
          dependencies: {
            ...readiness.dependencies,
            queueRecovery: undefined,
          },
          queueRecovery: readiness.dependencies.queueRecovery,
        },
        true,
      ),
    ).toBe(false);
  });

  it("accepts only the generic noindex 410 shell without entry or precise-location evidence", () => {
    expect(
      classifyJournalWorkerHtml(
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
      classifyJournalWorkerHtml(
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
      classifyJournalWorkerHtml(
        "<!doctype html><header><span>OverGarden</span></header><main>noindex, nofollow</main>",
        [],
        "noindex, nofollow",
      ),
    ).toMatchObject({
      tombstoneClass: "generic_content_free",
      robotsClass: "unexpected",
    });

    expect(
      classifyJournalWorkerHtml(
        '<!doctype html><meta name="robots" content="noindex, nofollow"/><header><span>OverGarden</span></header><main>00000000-0000-4000-8000-000000000306</main>',
        ["00000000-0000-4000-8000-000000000306"],
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
    const entryId = "00000000-0000-4000-8000-000000000306";
    expect(
      validateJournalWorkerRecoveryState(
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
        validateJournalWorkerRecoveryState(
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

describe("OVE-306 effect, replay, race, timeout, and cleanup", () => {
  it("accepts one exact worker result and proves cleanup twice", async () => {
    const proof = adapter();
    const receipt = await runApprovedJournalWorkerProof(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 1,
      resultClass: "verified_journal_worker",
      cleanupClass: "authoritative_absent_twice",
      state: "cleaned",
    });
    expect(proof.applyCanary).toHaveBeenCalledOnce();
    expect(proof.claimApplyAttempt).toHaveBeenCalledOnce();
    expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
    expect(proof.writeReplayReceipt).toHaveBeenCalledOnce();
  });

  it("refuses a repeated apply without a second effect", async () => {
    const proof = adapter();
    const first = await runApprovedJournalWorkerProof(options(), proof);
    const second = await runApprovedJournalWorkerProof(options(), proof);

    expect(first.state).toBe("cleaned");
    expect(second).toMatchObject({
      applyCount: 0,
      resultClass: "refused",
      cleanupClass: "not_started",
      state: "failed",
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

    const winner = runApprovedJournalWorkerProof(options(), proof);
    await vi.waitFor(() => expect(effects).toBe(1));
    const loser = await runApprovedJournalWorkerProof(options(), proof);
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

    const receipt = await runApprovedJournalWorkerProof(options(), proof);

    expect(receipt).toMatchObject({
      state: "failed",
      resultClass: "failed",
      cleanupClass: "authoritative_absent_twice",
    });
    expect(applyCanary).toHaveBeenCalledOnce();
    expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
    expect(proof.writeReplayReceipt).not.toHaveBeenCalled();

    const second = await runApprovedJournalWorkerProof(options(), proof);
    expect(second).toMatchObject({
      applyCount: 0,
      resultClass: "refused",
      cleanupClass: "not_started",
      state: "failed",
    });
    expect(applyCanary).toHaveBeenCalledOnce();
  });

  it("fails when either worker job or exact public document proof drifts", async () => {
    for (const verification of [
      { ...SAFE_VERIFICATION, indexJobClass: "unexpected" as const },
      { ...SAFE_VERIFICATION, publicDocumentClass: "unexpected" as const },
      { ...SAFE_VERIFICATION, unindexJobClass: "unexpected" as const },
      { ...SAFE_VERIFICATION, parityClass: "unexpected" as const },
    ]) {
      const proof = adapter({ applyCanary: vi.fn(async () => verification) });
      const receipt = await runApprovedJournalWorkerProof(options(), proof);
      expect(receipt).toMatchObject({
        state: "failed",
        resultClass: "failed",
        cleanupClass: "authoritative_absent_twice",
      });
    }
  });

  it("persists the single-use attempt fence before the effect starts", async () => {
    const order: string[] = [];
    const proof = adapter({
      claimApplyAttempt: vi.fn(async () => {
        order.push("attempt");
        return "claimed" as const;
      }),
      applyCanary: vi.fn(async () => {
        order.push("effect");
        return SAFE_VERIFICATION;
      }),
    });

    await runApprovedJournalWorkerProof(options(), proof);

    expect(order).toEqual(["attempt", "effect"]);
  });

  it("records uncertain cleanup as failed", async () => {
    const proof = adapter({
      cleanupCanary: vi
        .fn()
        .mockResolvedValueOnce(CLEAN)
        .mockResolvedValueOnce({ ...CLEAN, searchDocumentPresent: true }),
    });

    const receipt = await runApprovedJournalWorkerProof(options(), proof);

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
      const pending = settleJournalWorkerWithinDeadline(
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

describe("OVE-306 closed receipt, CLI, and runbook", () => {
  it("drops unsafe error payloads and emits the exact closed field set", () => {
    const receipt = buildJournalWorkerFailureReceipt({
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
      parseJournalWorkerCliArgs([
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
      parseJournalWorkerCliArgs([
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
      parseJournalWorkerCliArgs([
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
      parseJournalWorkerCliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        "--apply",
        "--approval-digest",
        OVE306_APPROVAL_DIGEST,
      ]),
    ).toEqual(options());

    expect(() =>
      parseJournalWorkerCliArgs([
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
        "../../../docs/runbooks/OVE_306_FINAL_MAIN_JOURNAL_WORKER.md",
        import.meta.url,
      ),
      "utf8",
    );

    expect(runbook).toContain(OVE306_APPROVAL_DIGEST);
    expect(runbook).toContain("--plan");
    expect(runbook).toContain("--apply");
    expect(runbook).toContain("--cleanup");
    expect(runbook).toContain("--status");
    expect(runbook).toContain("--cancel");
    expect(runbook).toContain("journal-repository.ts");
    expect(runbook).toContain("job-queue-manifest.ts");
    expect(runbook).toContain("services/matching/app/worker.py");
    expect(runbook).toContain("journal_entry_index");
    expect(runbook).toContain("journal_entry_unindex");
    expect(runbook).toContain("public-projection-outbox.ts");
    expect(runbook).toContain("public-journal-entry-lifecycle.ts");
    expect(runbook).toContain("one-hop locale redirect");
    expect(runbook).toContain("cleanup twice");
    expect(runbook).toContain("never run a second apply");
    const source = readFileSync(
      new URL("./recertify-final-main-journal-worker.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("delete from job_queue");
    expect(source).toContain("payload->>'journalEntryId'");
    expect(source).toContain("claimApplyAttempt");
  });
});
