import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  OVE302_APPROVAL_DIGEST,
  buildMediaProofReplayNamespace,
  buildMediaProofFailureReceipt,
  isAuthoritativePublicAbsence,
  parseMediaProofCliArgs,
  runApprovedMediaProof,
  settleMediaProofWithinDeadline,
  type MediaProofAdapter,
  type MediaProofBoundary,
  type MediaProofCleanupReadback,
  type MediaProofReceiptV1,
  type MediaProofVerification,
} from "./recertify-final-main-media-proof";

const IMPLEMENTATION_SHA = "a".repeat(40);
const OVE315_APPROVAL_DIGEST =
  "76643a09f3636efdb44cf03d257181d49726e168bf6ad138087b44f06e948406";

const SAFE_BOUNDARY: MediaProofBoundary = {
  deploymentSha: IMPLEMENTATION_SHA,
  canaryCount: 0,
  ownerAccessClass: "task_owned_or_absent",
  evidenceClass: "closed_counts_and_booleans_only",
};

const SAFE_VERIFICATION: MediaProofVerification = {
  applyCount: 1,
  processedDerivativeCount: 1,
  publicHostClass: "approved_media_host",
  publicOriginalReachable: false,
  publicQuarantineReachable: false,
  exifPresent: false,
  originalPresent: false,
  anotherOwnerEffects: 0,
};

const CLEAN: MediaProofCleanupReadback = {
  taskCanaryCount: 0,
  originalPresent: false,
  derivativePresent: false,
  anotherOwnerEffects: 0,
};

function options(mode: "plan" | "apply" = "apply") {
  return {
    mode,
    environment: "production" as const,
    implementationSha: IMPLEMENTATION_SHA,
    approvalDigest:
      mode === "apply" ? OVE315_APPROVAL_DIGEST : undefined,
    timeoutMs: 30_000,
  };
}

function adapter(
  overrides: Partial<MediaProofAdapter> = {},
): MediaProofAdapter {
  let saved: MediaProofReceiptV1 | null = null;
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

describe("OVE-315 exact recovery plan and owner boundary", () => {
  it("classifies an exact deployed zero-canary plan with zero effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedMediaProof(options("plan"), proof);

    expect(receipt).toMatchObject({
      version: 1,
      environment: "production",
      implementationSha: IMPLEMENTATION_SHA,
      planDigest: OVE315_APPROVAL_DIGEST,
      authorizationDigest: OVE315_APPROVAL_DIGEST,
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
  ])("rejects %s before apply", async (_label, boundaryPatch) => {
    const proof = adapter({
      readBoundary: vi.fn(async () => ({
        ...SAFE_BOUNDARY,
        ...boundaryPatch,
      })),
    });

    const receipt = await runApprovedMediaProof(options(), proof);

    expect(receipt).toMatchObject({
      state: "failed",
      resultClass: "refused",
      applyCount: 0,
    });
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("requires the immutable production approval digest before lock or effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedMediaProof(
      { ...options(), approvalDigest: "f".repeat(64) },
      proof,
    );

    expect(receipt).toMatchObject({ state: "failed", resultClass: "refused" });
    expect(proof.acquireApplyLock).not.toHaveBeenCalled();
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("refuses the consumed OVE-302 digest before lock or effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedMediaProof(
      { ...options(), approvalDigest: OVE302_APPROVAL_DIGEST },
      proof,
    );

    expect(receipt).toMatchObject({
      planDigest: OVE315_APPROVAL_DIGEST,
      authorizationDigest: OVE315_APPROVAL_DIGEST,
      state: "failed",
      resultClass: "refused",
      applyCount: 0,
    });
    expect(proof.acquireApplyLock).not.toHaveBeenCalled();
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("derives a distinct OVE-315 replay namespace from the approved profile", () => {
    expect(buildMediaProofReplayNamespace(IMPLEMENTATION_SHA)).toBe(
      "b562cabd164493744a7dd3a10b7918e20f322638da414cc96d04d8d21e2d230f",
    );
  });
});

describe("OVE-315 effect, replay, race, timeout, and cleanup", () => {
  it("accepts only authoritative public absence and rejects transport/auth ambiguity", () => {
    expect(isAuthoritativePublicAbsence(404)).toBe(true);
    expect(isAuthoritativePublicAbsence(410)).toBe(true);
    expect(isAuthoritativePublicAbsence(0)).toBe(false);
    expect(isAuthoritativePublicAbsence(403)).toBe(false);
    expect(isAuthoritativePublicAbsence(500)).toBe(false);
  });

  it("accepts only the derivative-only result and proves cleanup twice", async () => {
    const proof = adapter();
    const receipt = await runApprovedMediaProof(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 1,
      resultClass: "verified_derivative_only",
      cleanupClass: "authoritative_absent_twice",
      state: "cleaned",
    });
    expect(proof.applyCanary).toHaveBeenCalledOnce();
    expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
    expect(proof.writeReplayReceipt).toHaveBeenCalledOnce();
  });

  it("returns already_cleaned on replay without a second canary effect", async () => {
    const proof = adapter();
    const first = await runApprovedMediaProof(options(), proof);
    const second = await runApprovedMediaProof(options(), proof);

    expect(first.state).toBe("cleaned");
    expect(second).toMatchObject({
      applyCount: 0,
      resultClass: "already_cleaned",
      cleanupClass: "authoritative_absent_twice",
      state: "already_cleaned",
    });
    expect(proof.applyCanary).toHaveBeenCalledOnce();
  });

  it("allows one concurrent winner and returns one bounded loser", async () => {
    let held = false;
    let effects = 0;
    let cleanups = 0;
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
      cleanupCanary: vi.fn(async () => {
        cleanups += 1;
        return CLEAN;
      }),
    });

    const winner = runApprovedMediaProof(options(), proof);
    await vi.waitFor(() => expect(effects).toBe(1));
    const loser = await runApprovedMediaProof(options(), proof);
    releaseWinner?.();
    const winnerReceipt = await winner;

    expect(winnerReceipt.state).toBe("cleaned");
    expect(loser).toMatchObject({
      state: "failed",
      resultClass: "bounded_loser",
      applyCount: 0,
    });
    expect(effects).toBe(1);
    expect(cleanups).toBe(2);
  });

  it("fails partial success, performs authoritative cleanup, and never retries", async () => {
    const applyCanary = vi.fn(async () => ({
      ...SAFE_VERIFICATION,
      originalPresent: true,
    }));
    const proof = adapter({ applyCanary });

    const receipt = await runApprovedMediaProof(options(), proof);

    expect(receipt).toMatchObject({
      state: "failed",
      resultClass: "failed",
      cleanupClass: "authoritative_absent_twice",
    });
    expect(applyCanary).toHaveBeenCalledOnce();
    expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
    expect(proof.writeReplayReceipt).not.toHaveBeenCalled();
  });

  it("records uncertain cleanup as failed and never claims terminal pass", async () => {
    const proof = adapter({
      cleanupCanary: vi
        .fn()
        .mockResolvedValueOnce(CLEAN)
        .mockResolvedValueOnce({ ...CLEAN, derivativePresent: true }),
    });

    const receipt = await runApprovedMediaProof(options(), proof);

    expect(receipt).toMatchObject({
      state: "failed",
      resultClass: "failed",
      cleanupClass: "uncertain",
    });
  });

  it("aborts at 30 seconds, rejects late completion, and leaves status/cancel adapters responsive", async () => {
    vi.useFakeTimers();
    try {
      let lateWrites = 0;
      let cancelChecks = 0;
      const pending = settleMediaProofWithinDeadline(
        (signal) =>
          new Promise<string>((resolve) => {
            signal.addEventListener("abort", () => {
              cancelChecks += 1;
              setTimeout(() => {
                lateWrites += 1;
                resolve("late");
              }, 1);
            });
          }),
        30_000,
      );
      const rejection = expect(pending).rejects.toThrow("exceeded 30000ms");

      await vi.advanceTimersByTimeAsync(30_000);
      await rejection;
      expect(cancelChecks).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(lateWrites).toBe(1);
      await expect(Promise.allSettled([pending])).resolves.toEqual([
        expect.objectContaining({ status: "rejected" }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("OVE-315 closed receipt and CLI", () => {
  it("recursively drops unsafe error payloads and emits the exact closed field set", () => {
    const receipt = buildMediaProofFailureReceipt({
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
        objectKey: "quarantine/private.jpg",
        coordinates: [50.45, 30.52],
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
      /email|cookie|object.?key|quarantine\/|coordinates|50\.45|30\.52|secret/i,
    );
  });

  it("requires exact production confirmation, SHA, mode, and apply digest", () => {
    expect(
      parseMediaProofCliArgs([
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
      parseMediaProofCliArgs([
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
      parseMediaProofCliArgs([
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
      parseMediaProofCliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        "--apply",
        "--approval-digest",
        OVE315_APPROVAL_DIGEST,
      ]),
    ).toEqual(options());

    expect(() =>
      parseMediaProofCliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        "--apply",
        "--approval-digest",
        OVE302_APPROVAL_DIGEST,
      ]),
    ).toThrow("does not match OVE-315");

    expect(() =>
      parseMediaProofCliArgs([
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

  it("pins the immutable production plan, recovery order, and canonical owners", () => {
    const runbook = readFileSync(
      new URL(
        "../../../docs/runbooks/OVE_302_FINAL_MAIN_MEDIA_PROOF.md",
        import.meta.url,
      ),
      "utf8",
    );

    expect(runbook).toContain(OVE302_APPROVAL_DIGEST);
    expect(runbook).toContain("--plan");
    expect(runbook).toContain("--apply");
    expect(runbook).toContain("--cleanup");
    expect(runbook).toContain("--status");
    expect(runbook).toContain("--cancel");
    expect(runbook).toContain("prove-r2-media-lifecycle-provider.ts");
    expect(runbook).toContain("media-repository.ts");
    expect(runbook).toContain("processor.ts");
    expect(runbook).toContain("cleanup twice");
    expect(runbook).toContain("never run a second apply");
  });
});
