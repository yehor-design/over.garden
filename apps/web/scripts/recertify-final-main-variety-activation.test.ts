import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  OVE305_APPROVAL_DIGEST,
  OVE305_APPROVED_PLAN,
  buildVarietyActivationFailureReceipt,
  buildVarietyActivationReplayNamespace,
  classifyPublicVarietyPreselectionPath,
  parseVarietyActivationCliArgs,
  runApprovedVarietyActivationProof,
  settleVarietyActivationWithinDeadline,
  validateVarietyActivationRecoveryState,
  type VarietyActivationAdapter,
  type VarietyActivationBoundary,
  type VarietyActivationCleanupReadback,
  type VarietyActivationReceiptV1,
  type VarietyActivationVerification,
} from "./recertify-final-main-variety-activation";

const IMPLEMENTATION_SHA = "a".repeat(40);
const SAFE_BOUNDARY: VarietyActivationBoundary = {
  deploymentSha: IMPLEMENTATION_SHA,
  canaryCount: 0,
  catalogClass: "eligible_public_variety",
  ownerAccessClass: "task_owned_or_absent",
  evidenceClass: "closed_counts_and_booleans_only",
};
const SAFE_VERIFICATION: VarietyActivationVerification = {
  applyCount: 1,
  ctaClass: "canonical_safe_slug",
  preselectionClass: "catalog_selected_public_variety",
  ownerScopeClass: "one_owner_object_entry",
  attributionClass: "public_variety",
  preciseLocationPresent: false,
  forbiddenEvidencePresent: false,
  anotherOwnerEffects: 0,
};
const CLEAN: VarietyActivationCleanupReadback = {
  taskCanaryCount: 0,
  attributionPresent: false,
  durableIntentPresent: false,
  anotherOwnerEffects: 0,
};

function options(mode: "plan" | "apply" = "apply") {
  return {
    mode,
    environment: "production" as const,
    implementationSha: IMPLEMENTATION_SHA,
    approvalDigest: mode === "apply" ? OVE305_APPROVAL_DIGEST : undefined,
    timeoutMs: 30_000,
  };
}

function adapter(
  overrides: Partial<VarietyActivationAdapter> = {},
): VarietyActivationAdapter {
  let saved: VarietyActivationReceiptV1 | null = null;
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

describe("OVE-305 exact plan and privacy boundary", () => {
  it("classifies an exact deployed zero-canary plan with zero effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedVarietyActivationProof(
      options("plan"),
      proof,
    );

    expect(receipt).toMatchObject({
      environment: "production",
      implementationSha: IMPLEMENTATION_SHA,
      planDigest: OVE305_APPROVAL_DIGEST,
      authorizationDigest: OVE305_APPROVAL_DIGEST,
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
    ["catalog drift", { catalogClass: "unexpected" as const }],
    ["another owner", { ownerAccessClass: "another_owner" as const }],
    ["unsafe evidence", { evidenceClass: "unsafe" as const }],
  ])("refuses %s before apply", async (_label, boundaryPatch) => {
    const proof = adapter({
      readBoundary: vi.fn(async () => ({
        ...SAFE_BOUNDARY,
        ...boundaryPatch,
      })),
    });

    const receipt = await runApprovedVarietyActivationProof(options(), proof);

    expect(receipt).toMatchObject({
      state: "failed",
      resultClass: "refused",
      applyCount: 0,
    });
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("requires the immutable production approval digest before lock or effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedVarietyActivationProof(
      { ...options(), approvalDigest: "f".repeat(64) },
      proof,
    );

    expect(receipt).toMatchObject({ state: "failed", resultClass: "refused" });
    expect(proof.acquireApplyLock).not.toHaveBeenCalled();
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("uses an OVE-305-only replay namespace", () => {
    expect(buildVarietyActivationReplayNamespace(IMPLEMENTATION_SHA)).toBe(
      "524227bd28624ebc6d9ba397c5ed36b2550bdc00f58e68433fc8a6ec949cc309",
    );
  });

  it("pins the approved operation to its exact normalized plan", () => {
    expect(
      createHash("sha256").update(OVE305_APPROVED_PLAN).digest("hex"),
    ).toBe(OVE305_APPROVAL_DIGEST);
    expect(OVE305_APPROVED_PLAN).toContain("OVE-305|production");
    expect(OVE305_APPROVED_PLAN).toContain("safe plant-variety slug");
    expect(OVE305_APPROVED_PLAN).toContain("gardenFirstEntryPreselectionPath");
    expect(OVE305_APPROVED_PLAN).toContain("public_variety enum");
    expect(OVE305_APPROVED_PLAN).toContain("one-canary");
  });

  it("accepts only the canonical safe-slug public-variety preselection path", () => {
    expect(
      classifyPublicVarietyPreselectionPath(
        "/garden?catalog=black-krim-0000000305&source=public-variety",
        "black-krim-0000000305",
      ),
    ).toEqual({
      ctaClass: "canonical_safe_slug",
      preciseLocationPresent: false,
      forbiddenEvidencePresent: false,
    });

    expect(
      classifyPublicVarietyPreselectionPath(
        "https://example.com/garden?catalog=black-krim-0000000305&source=public-variety",
        "black-krim-0000000305",
      ),
    ).toMatchObject({
      ctaClass: "unexpected",
      forbiddenEvidencePresent: true,
    });

    expect(
      classifyPublicVarietyPreselectionPath(
        "/garden?catalog=another-slug&source=public-variety",
        "black-krim-0000000305",
      ),
    ).toMatchObject({
      ctaClass: "unexpected",
    });

    expect(
      classifyPublicVarietyPreselectionPath(
        "/garden?catalog=black-krim-0000000305&source=public-variety&referrer=secret",
        "black-krim-0000000305",
      ),
    ).toMatchObject({
      ctaClass: "unexpected",
      forbiddenEvidencePresent: true,
    });

    expect(
      classifyPublicVarietyPreselectionPath(
        "/garden?catalog=black-krim-0000000305&source=public-variety&location=50.4501,30.5234",
        "black-krim-0000000305",
      ),
    ).toMatchObject({
      ctaClass: "unexpected",
      preciseLocationPresent: true,
    });
  });

  it("accepts only one exact task-scoped recovery identity", () => {
    const entryId = "00000000-0000-4000-8000-000000000305";
    const plantObjectId = "10000000-0000-4000-8000-000000000305";
    expect(
      validateVarietyActivationRecoveryState(
        {
          version: 1,
          implementationSha: IMPLEMENTATION_SHA,
          entryIds: [entryId],
          plantObjectIds: [plantObjectId],
        },
        IMPLEMENTATION_SHA,
      ),
    ).toEqual({
      version: 1,
      implementationSha: IMPLEMENTATION_SHA,
      entryIds: [entryId],
      plantObjectIds: [plantObjectId],
    });

    for (const drift of [
      { implementationSha: "f".repeat(40) },
      { entryIds: [entryId, "00000000-0000-4000-8000-000000000306"] },
      { entryIds: ["not-a-uuid"] },
      { plantObjectIds: ["not-a-uuid"] },
      {
        plantObjectIds: [plantObjectId, "10000000-0000-4000-8000-000000000306"],
      },
    ]) {
      expect(() =>
        validateVarietyActivationRecoveryState(
          {
            version: 1,
            implementationSha: IMPLEMENTATION_SHA,
            entryIds: [entryId],
            plantObjectIds: [plantObjectId],
            ...drift,
          },
          IMPLEMENTATION_SHA,
        ),
      ).toThrow("recovery state");
    }
  });
});

describe("OVE-305 effect, replay, race, timeout, and cleanup", () => {
  it("accepts one exact public-variety activation and proves cleanup twice", async () => {
    const proof = adapter();
    const receipt = await runApprovedVarietyActivationProof(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 1,
      resultClass: "verified_variety_activation",
      cleanupClass: "authoritative_absent_twice",
      state: "cleaned",
    });
    expect(proof.applyCanary).toHaveBeenCalledOnce();
    expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
    expect(proof.writeReplayReceipt).toHaveBeenCalledOnce();
  });

  it("returns already_cleaned on replay without a second effect", async () => {
    const proof = adapter();
    const first = await runApprovedVarietyActivationProof(options(), proof);
    const second = await runApprovedVarietyActivationProof(options(), proof);

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

    const winner = runApprovedVarietyActivationProof(options(), proof);
    await vi.waitFor(() => expect(effects).toBe(1));
    const loser = await runApprovedVarietyActivationProof(options(), proof);
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
      forbiddenEvidencePresent: true,
    }));
    const proof = adapter({ applyCanary });

    const receipt = await runApprovedVarietyActivationProof(options(), proof);

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
        .mockResolvedValueOnce({ ...CLEAN, attributionPresent: true }),
    });

    const receipt = await runApprovedVarietyActivationProof(options(), proof);

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
      const pending = settleVarietyActivationWithinDeadline(
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

describe("OVE-305 closed receipt, CLI, and runbook", () => {
  it("drops unsafe error payloads and emits the exact closed field set", () => {
    const receipt = buildVarietyActivationFailureReceipt({
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
      parseVarietyActivationCliArgs([
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
      parseVarietyActivationCliArgs([
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
      parseVarietyActivationCliArgs([
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
      parseVarietyActivationCliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        "--apply",
        "--approval-digest",
        OVE305_APPROVAL_DIGEST,
      ]),
    ).toEqual(options());

    expect(() =>
      parseVarietyActivationCliArgs([
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
        "../../../docs/runbooks/OVE_305_FINAL_MAIN_VARIETY_ACTIVATION.md",
        import.meta.url,
      ),
      "utf8",
    );

    expect(runbook).toContain(OVE305_APPROVAL_DIGEST);
    expect(runbook).toContain("--plan");
    expect(runbook).toContain("--apply");
    expect(runbook).toContain("--cleanup");
    expect(runbook).toContain("--status");
    expect(runbook).toContain("--cancel");
    expect(runbook).toContain("catalog-evidence-route.tsx");
    expect(runbook).toContain("public-paths.ts");
    expect(runbook).toContain("catalog-repository.ts");
    expect(runbook).toContain("journal-repository.ts");
    expect(runbook).toContain("analytics-events.ts");
    expect(runbook).toContain("safe plant-variety slug");
    expect(runbook).toContain("gardenFirstEntryPreselectionPath");
    expect(runbook).toContain("public_variety");
    expect(runbook).toContain("cleanup twice");
    expect(runbook).toContain("never run a second apply");
  });
});
