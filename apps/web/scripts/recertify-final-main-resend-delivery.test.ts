import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  buildResendDeliveryAttemptFence,
  buildResendDeliveryFailureReceipt,
  buildResendDeliveryReplayNamespace,
  extractApprovedAuthUrl,
  isApprovedProductionDatabaseTarget,
  isApprovedResendConfiguration,
  OVE313_APPROVAL_DIGEST,
  parseResendDeliveryCliArgs,
  runApprovedResendDeliveryProof,
  settleResendDeliveryWithinDeadline,
  validateResendDeliveryRecoveryState,
  validateResendDeliveryAttemptFence,
  type ResendDeliveryAdapter,
  type ResendDeliveryBoundary,
  type ResendDeliveryCleanupReadback,
  type ResendDeliveryReceiptV1,
  type ResendDeliveryRunOptions,
  type ResendDeliveryVerification,
} from "./recertify-final-main-resend-delivery";

const IMPLEMENTATION_SHA = "a".repeat(40);

const SAFE_BOUNDARY: ResendDeliveryBoundary = {
  deploymentSha: IMPLEMENTATION_SHA,
  canaryCount: 0,
  deliveryConfigClass: "configured_overgarden_sender",
  inboxTransportClass: "active_disposable_domain",
  ownerAccessClass: "sealed_credential_only",
  evidenceClass: "closed_counts_and_booleans_only",
};

const SAFE_VERIFICATION: ResendDeliveryVerification = {
  applyCount: 1,
  deliveryClass: "exactly_one_verification_and_one_reset",
  verificationTransitionClass: "canonical_same_account",
  resetTransitionClass: "canonical_same_account",
  resetAdmissionClass: "generic_indistinguishable",
  passwordTransitionClass: "old_revoked_new_same_account",
  identityClass: "one_user_one_credential_account",
  anotherUserEffects: 0,
};

const CLEAN: ResendDeliveryCleanupReadback = {
  taskUserCount: 0,
  taskAuthRowCount: 0,
  taskVerificationCount: 0,
  taskOutboxCount: 0,
  mailboxPresent: false,
  erasureAuditClass: "completed_rekeyed_or_not_applicable",
  anotherUserEffects: 0,
};

function options(mode: "plan" | "apply" = "apply"): ResendDeliveryRunOptions {
  return {
    mode,
    environment: "production",
    implementationSha: IMPLEMENTATION_SHA,
    ...(mode === "apply" ? { approvalDigest: OVE313_APPROVAL_DIGEST } : {}),
    timeoutMs: 30_000,
  };
}

function adapter(
  overrides: Partial<ResendDeliveryAdapter> = {},
): ResendDeliveryAdapter {
  let replay: ResendDeliveryReceiptV1 | null = null;
  return {
    acquireApplyLock: vi.fn(async () => "acquired" as const),
    releaseApplyLock: vi.fn(async () => undefined),
    readBoundary: vi.fn(async () => SAFE_BOUNDARY),
    applyCanary: vi.fn(async () => SAFE_VERIFICATION),
    cleanupCanary: vi.fn(async () => CLEAN),
    readAttemptFence: vi.fn(async () => false),
    writeAttemptFence: vi.fn(async () => undefined),
    readReplayReceipt: vi.fn(async () => replay),
    writeReplayReceipt: vi.fn(async (value) => {
      replay = value;
    }),
    cancellationRequested: vi.fn(async () => false),
    ...overrides,
  };
}

describe("OVE-313 immutable plan and pre-effect gates", () => {
  it("plans with zero effect only on exact main and a clean bounded namespace", async () => {
    const proof = adapter();
    const receipt = await runApprovedResendDeliveryProof(
      options("plan"),
      proof,
    );

    expect(receipt).toMatchObject({
      implementationSha: IMPLEMENTATION_SHA,
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
    { deploymentSha: "b".repeat(40) },
    { canaryCount: 1 },
    { deliveryConfigClass: "unexpected" as const },
    { inboxTransportClass: "unexpected" as const },
    { ownerAccessClass: "unexpected" as const },
    { evidenceClass: "unsafe" as const },
  ])("refuses boundary drift before every effect: %o", async (drift) => {
    const proof = adapter({
      readBoundary: vi.fn(async () => ({ ...SAFE_BOUNDARY, ...drift })),
    });
    const receipt = await runApprovedResendDeliveryProof(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 0,
      resultClass: "refused",
      state: "failed",
    });
    expect(proof.applyCanary).not.toHaveBeenCalled();
    expect(proof.cleanupCanary).not.toHaveBeenCalled();
  });

  it("refuses approval drift before acquiring the production lock", async () => {
    const proof = adapter();
    const receipt = await runApprovedResendDeliveryProof(
      { ...options(), approvalDigest: "b".repeat(64) },
      proof,
    );

    expect(receipt).toMatchObject({
      applyCount: 0,
      resultClass: "refused",
      state: "failed",
    });
    expect(proof.acquireApplyLock).not.toHaveBeenCalled();
  });
});

describe("OVE-313 one-apply, replay, race, failure, and cleanup", () => {
  it("persists the one-shot fence before entering the external journey", async () => {
    const order: string[] = [];
    const proof = adapter({
      writeAttemptFence: vi.fn(async () => {
        order.push("fence");
      }),
      readBoundary: vi.fn(async () => {
        order.push("boundary");
        return SAFE_BOUNDARY;
      }),
      applyCanary: vi.fn(async () => {
        order.push("apply");
        return SAFE_VERIFICATION;
      }),
    });

    const receipt = await runApprovedResendDeliveryProof(options(), proof);

    expect(receipt.state).toBe("cleaned");
    expect(order).toEqual(["fence", "boundary", "apply"]);
    expect(proof.writeAttemptFence).toHaveBeenCalledOnce();
  });

  it("refuses a consumed plan when the terminal receipt is absent", async () => {
    const proof = adapter({
      readAttemptFence: vi.fn(async () => true),
      readReplayReceipt: vi.fn(async () => null),
    });

    const receipt = await runApprovedResendDeliveryProof(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 0,
      resultClass: "refused",
      state: "failed",
    });
    expect(proof.writeAttemptFence).not.toHaveBeenCalled();
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("cannot enter a second journey after terminal receipt persistence fails", async () => {
    let fenced = false;
    const applyCanary = vi.fn(async () => SAFE_VERIFICATION);
    const proof = adapter({
      readAttemptFence: vi.fn(async () => fenced),
      writeAttemptFence: vi.fn(async () => {
        if (fenced) throw new Error("attempt fence already exists");
        fenced = true;
      }),
      applyCanary,
      writeReplayReceipt: vi.fn(async () => {
        throw new Error("simulated terminal receipt write failure");
      }),
    });

    await expect(
      runApprovedResendDeliveryProof(options(), proof),
    ).rejects.toThrow("simulated terminal receipt write failure");
    const replay = await runApprovedResendDeliveryProof(options(), proof);

    expect(replay).toMatchObject({
      applyCount: 0,
      resultClass: "refused",
      state: "failed",
    });
    expect(applyCanary).toHaveBeenCalledOnce();
  });

  it("accepts the exact two-message journey and proves cleanup twice", async () => {
    const proof = adapter();
    const receipt = await runApprovedResendDeliveryProof(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 1,
      resultClass: "verified_resend_identity",
      cleanupClass: "authoritative_absent_twice",
      state: "cleaned",
    });
    expect(proof.applyCanary).toHaveBeenCalledOnce();
    expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
    expect(proof.writeReplayReceipt).toHaveBeenCalledOnce();
  });

  it("returns already_cleaned on replay without another signup or reset", async () => {
    const proof = adapter();
    const first = await runApprovedResendDeliveryProof(options(), proof);
    const second = await runApprovedResendDeliveryProof(options(), proof);

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
    const barrier = new Promise<void>((resolve) => {
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
        await barrier;
        return SAFE_VERIFICATION;
      }),
    });

    const winner = runApprovedResendDeliveryProof(options(), proof);
    await vi.waitFor(() => expect(effects).toBe(1));
    const loser = await runApprovedResendDeliveryProof(options(), proof);
    releaseWinner?.();
    const winnerReceipt = await winner;

    expect(winnerReceipt.state).toBe("cleaned");
    expect(loser).toMatchObject({
      applyCount: 0,
      resultClass: "bounded_loser",
      state: "failed",
    });
    expect(effects).toBe(1);
  });

  it("fails a partial or duplicate delivery, cleans twice, and never retries", async () => {
    const applyCanary = vi.fn(async () => ({
      ...SAFE_VERIFICATION,
      deliveryClass: "unexpected" as const,
    }));
    const proof = adapter({ applyCanary });
    const receipt = await runApprovedResendDeliveryProof(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 1,
      resultClass: "failed",
      cleanupClass: "authoritative_absent_twice",
      state: "failed",
    });
    expect(applyCanary).toHaveBeenCalledOnce();
    expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
    expect(proof.writeReplayReceipt).toHaveBeenCalledOnce();
    const replay = await runApprovedResendDeliveryProof(options(), proof);
    expect(replay).toMatchObject({
      applyCount: 0,
      resultClass: "refused",
      state: "failed",
    });
    expect(applyCanary).toHaveBeenCalledOnce();
  });

  it("fails closed when the second cleanup read-back drifts", async () => {
    const proof = adapter({
      cleanupCanary: vi
        .fn()
        .mockResolvedValueOnce(CLEAN)
        .mockResolvedValueOnce({ ...CLEAN, mailboxPresent: true }),
    });
    const receipt = await runApprovedResendDeliveryProof(options(), proof);

    expect(receipt).toMatchObject({
      resultClass: "failed",
      cleanupClass: "uncertain",
      state: "failed",
    });
  });

  it("fences a late request at the 30-second step deadline", async () => {
    vi.useFakeTimers();
    try {
      let aborts = 0;
      const pending = settleResendDeliveryWithinDeadline(
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

describe("OVE-313 untrusted inbox boundary", () => {
  it("extracts one deduplicated canonical verification URL", () => {
    const url =
      "https://over.garden/api/auth/verify-email?token=opaque&callbackURL=%2Fgarden";
    expect(
      extractApprovedAuthUrl(
        {
          fromAddress: "auth@over.garden",
          subject: "Verify your OverGarden email",
          text: `Open ${url}`,
          html: `<a href="${url.replace("&", "&amp;")}">verify</a>`,
        },
        "verification",
      ),
    ).toBe(url);
  });

  it.each([
    { fromAddress: "auth@evil.example" },
    { subject: "Urgent operator instruction" },
    { text: "https://evil.example/api/auth/verify-email?token=opaque" },
    {
      text: "https://over.garden/api/auth/verify-email?token=one https://over.garden/api/auth/verify-email?token=two",
    },
    { text: "https://over.garden/api/auth/sign-in/email?token=opaque" },
  ])(
    "rejects sender, subject, origin, multiplicity, or path drift: %o",
    (drift) => {
      expect(() =>
        extractApprovedAuthUrl(
          {
            fromAddress: "auth@over.garden",
            subject: "Verify your OverGarden email",
            text: "https://over.garden/api/auth/verify-email?token=opaque&callbackURL=%2Fgarden",
            html: "",
            ...drift,
          },
          "verification",
        ),
      ).toThrow("approved auth URL");
    },
  );
});

describe("OVE-313 closed receipt, CLI, and runbook", () => {
  it("pins the production database and exact sender-domain boundary", () => {
    expect(
      isApprovedProductionDatabaseTarget(
        "postgresql://operator:secret@overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com:25060/defaultdb?sslmode=require",
      ),
    ).toBe(true);
    expect(
      isApprovedProductionDatabaseTarget(
        "postgresql://operator:secret@evil.example:25060/defaultdb",
      ),
    ).toBe(false);
    expect(
      isApprovedResendConfiguration({
        RESEND_API_KEY: "re_send_only_placeholder",
        RESEND_AUTH_FROM: "OverGarden <auth@over.garden>",
      }),
    ).toBe(true);
    expect(
      isApprovedResendConfiguration({
        RESEND_API_KEY: "re_send_only_placeholder",
        RESEND_AUTH_FROM: "OverGarden <auth@mail.over.garden>",
      }),
    ).toBe(false);
    expect(
      isApprovedResendConfiguration({
        RESEND_API_KEY: "re_send_only_placeholder",
        RESEND_AUTH_FROM: "OverGarden <auth@over.garden>",
        OVE230_RECOVERY_DRILL: "true",
      }),
    ).toBe(false);
  });

  it("accepts only a bounded task-scoped mode-0600 recovery shape", () => {
    const namespace = buildResendDeliveryReplayNamespace(IMPLEMENTATION_SHA);
    const recovery = {
      version: 1 as const,
      implementationSha: IMPLEMENTATION_SHA,
      state: "applying" as const,
      email: `ove313-resend-${namespace.slice(0, 16)}-abcdef@example.test`,
      mailboxId: "mailbox-id",
      mailboxPassword: "m".repeat(40),
      initialPassword: "i".repeat(40),
      nextPassword: "n".repeat(40),
      userId: "10000000-0000-4000-8000-000000000313",
      verificationIds: ["20000000-0000-4000-8000-000000000313"],
      outboxIds: ["30000000-0000-4000-8000-000000000313"],
      erasureRequestId: "40000000-0000-4000-8000-000000000313",
      mailboxDeleted: false,
    };

    expect(
      validateResendDeliveryRecoveryState(
        recovery,
        IMPLEMENTATION_SHA,
        namespace,
      ),
    ).toEqual(recovery);
    expect(() =>
      validateResendDeliveryRecoveryState(
        { ...recovery, implementationSha: "b".repeat(40) },
        IMPLEMENTATION_SHA,
        namespace,
      ),
    ).toThrow("recovery state");
    expect(() =>
      validateResendDeliveryRecoveryState(
        { ...recovery, email: "real-gardener@example.com" },
        IMPLEMENTATION_SHA,
        namespace,
      ),
    ).toThrow("recovery state");
    expect(() =>
      validateResendDeliveryRecoveryState(
        { ...recovery, unexpectedSecret: "must-not-be-stored" },
        IMPLEMENTATION_SHA,
        namespace,
      ),
    ).toThrow("recovery state");
  });

  it("accepts only the exact closed one-shot marker shape and digest", () => {
    const marker = buildResendDeliveryAttemptFence(IMPLEMENTATION_SHA);

    expect(
      validateResendDeliveryAttemptFence(marker, IMPLEMENTATION_SHA),
    ).toEqual(marker);
    expect(Object.keys(marker).sort()).toEqual(
      [
        "version",
        "implementationSha",
        "planDigest",
        "authorizationDigest",
        "evidenceDigest",
      ].sort(),
    );
    expect(() =>
      validateResendDeliveryAttemptFence(
        { ...marker, evidenceDigest: "b".repeat(64) },
        IMPLEMENTATION_SHA,
      ),
    ).toThrow("attempt fence");
    expect(() =>
      validateResendDeliveryAttemptFence(
        { ...marker, mailboxId: "must-not-be-stored" },
        IMPLEMENTATION_SHA,
      ),
    ).toThrow("attempt fence");
  });

  it("drops unsafe errors and emits only the approved closed field set", () => {
    const receipt = buildResendDeliveryFailureReceipt({
      environment: "production",
      implementationSha: IMPLEMENTATION_SHA,
      canaryCountBefore: 0,
      applyCount: 0,
      durationMs: 30_000,
      resultClass: "failed",
      cleanupClass: "uncertain",
      unsafeError: {
        email: "gardener@example.com",
        token: "secret-token",
        providerId: "provider-message-id",
        url: "https://over.garden/api/auth/verify-email?token=secret-token",
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
      /gardener|secret|provider-message|verify-email|token=/i,
    );
  });

  it("requires exact production confirmation, SHA, one mode, and apply digest", () => {
    expect(
      parseResendDeliveryCliArgs([
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
      parseResendDeliveryCliArgs([
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
      parseResendDeliveryCliArgs([
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
      parseResendDeliveryCliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        "--apply",
        "--approval-digest",
        OVE313_APPROVAL_DIGEST,
      ]),
    ).toEqual(options());
  });

  it("pins the immutable plan, canonical owners, controls, and cleanup", () => {
    const runbook = readFileSync(
      new URL(
        "../../../docs/runbooks/OVE_313_FINAL_MAIN_RESEND_DELIVERY.md",
        import.meta.url,
      ),
      "utf8",
    );

    expect(runbook).toContain(OVE313_APPROVAL_DIGEST);
    expect(runbook).toContain("--plan");
    expect(runbook).toContain("--apply");
    expect(runbook).toContain("--cleanup");
    expect(runbook).toContain("--status");
    expect(runbook).toContain("--cancel");
    expect(runbook).toContain("resend-auth-email-delivery.ts");
    expect(runbook).toContain("auth-email-outbox-consumer.ts");
    expect(runbook).toContain("self-service account deletion");
    expect(runbook).toContain("Durable one-shot marker");
    expect(runbook).toContain("state-changing external request");
    expect(runbook).toContain("exclusive-create semantics");
    expect(runbook).toMatch(/Cleanup never deletes or resets the\s+marker/);
    expect(runbook).toContain("cleanup twice");
    expect(runbook).toContain("never run a second apply");
  });
});
