import { describe, expect, it, vi } from "vitest";

import {
  OVE350_APPLY_CONFIRMATION,
  OVE350_FIRST_READ_EARLIEST_AT,
  OVE350_TARGET_BUCKET,
  assertOve350ReceiptRedacted,
  buildOve350Plan,
  classifyOve350BucketProbeError,
  classifyOve350Read,
  executeOve350Retirement,
  parseOve350Args,
  stableOve350Digest,
  verifyOve350ApplyGate,
  withBoundedCollector,
  type Ove350ApprovalReceipt,
  type Ove350Plan,
  type Ove350ReadReceipt,
  type Ove350RetirementDependencies,
} from "./verify-legacy-quarantine-provider-retirement";

describe("OVE-350 legacy quarantine provider retirement", () => {
  it("keeps read-only plan mode provider-inert", () => {
    expect(
      parseOve350Args([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--read-only-plan",
      ]),
    ).toEqual({
      mode: "read_only_plan",
      environment: "production",
      confirmEnvironment: "production",
    });
  });

  it("requires exact authorization inputs before approved apply", () => {
    expect(() =>
      parseOve350Args([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--apply",
      ]),
    ).toThrow(/plan file/i);

    expect(
      parseOve350Args([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--apply",
        "--plan-file",
        "/tmp/ove350-plan.json",
        "--approval-file",
        "/tmp/ove350-approval.json",
        "--approved-plan-digest",
        "a".repeat(64),
        "--confirm-production",
        OVE350_APPLY_CONFIRMATION,
      ]),
    ).toEqual({
      mode: "apply",
      environment: "production",
      confirmEnvironment: "production",
      planFile: "/tmp/ove350-plan.json",
      approvalFile: "/tmp/ove350-approval.json",
      approvedPlanDigest: "a".repeat(64),
      confirmProduction: OVE350_APPLY_CONFIRMATION,
    });
  });

  it("blocks identity drift and reads taken before the founder waiver", () => {
    expect(
      classifyOve350Read(
        readReceipt({ observedAt: "2026-08-24T13:45:53.999Z" }),
      ),
    ).toEqual({ state: "observing", reason: "horizon_incomplete" });
    expect(
      classifyOve350Read(
        readReceipt({ accountId: "foreign-account" as never }),
      ),
    ).toEqual({ state: "drift", reason: "account_identity_mismatch" });
    expect(
      classifyOve350Read(
        readReceipt({
          target: {
            ...readReceipt().target,
            bucket: "overgarden-public" as never,
          },
        }),
      ),
    ).toEqual({ state: "drift", reason: "target_identity_mismatch" });
  });

  it("admits an exact zero read after the explicit founder waiver", () => {
    expect(classifyOve350Read(readReceipt())).toEqual({
      state: "eligible_zero",
      reason: "exact_zero_state",
    });
  });

  it.each([
    [
      "nonzero objects",
      { target: { ...readReceipt().target, objectCount: 1 } },
    ],
    [
      "multipart upload",
      { target: { ...readReceipt().target, multipartUploads: 1 } },
    ],
    [
      "legacy writer",
      { application: { ...readReceipt().application, legacyRouteRequests: 1 } },
    ],
    [
      "legacy env",
      { application: { ...readReceipt().application, legacyEnvReferences: 1 } },
    ],
    [
      "legacy job",
      { database: { ...readReceipt().database, legacyJobsOrClaims: 1 } },
    ],
    [
      "runtime owner",
      {
        repository: { ...readReceipt().repository, legacyRuntimeReferences: 1 },
      },
    ],
  ])("blocks %s without mutation", (_name, override) => {
    expect(classifyOve350Read(readReceipt(override))).toMatchObject({
      state: "blocked",
    });
  });

  it("blocks unknown observer credential scope but plans shared-token rotation", () => {
    expect(
      classifyOve350Read(
        readReceipt({
          credentials: {
            ...readReceipt().credentials,
            observerScope: "unknown",
          },
        }),
      ),
    ).toEqual({ state: "drift", reason: "credential_scope_unknown" });

    const plan = buildOve350Plan(
      readReceipt(),
      readReceipt({ observedAt: "2026-08-24T13:46:54.000Z" }),
    );
    expect(plan.credentialAction).toBe("narrow_shared_to_public_only_in_place");
  });

  it("treats an absent retired bucket as non-authority after deletion", () => {
    expect(
      classifyOve350BucketProbeError({
        name: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      }),
    ).toBe("denied");
    expect(
      classifyOve350BucketProbeError({
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403 },
      }),
    ).toBe("denied");
    expect(classifyOve350BucketProbeError(new Error("network"))).toBe("error");
  });

  it("requires two matching zero reads at least 60 seconds apart", () => {
    const first = readReceipt();
    expect(() =>
      buildOve350Plan(
        first,
        readReceipt({ observedAt: "2026-08-24T13:46:53.999Z" }),
      ),
    ).toThrow(/60 seconds/i);
    expect(() =>
      buildOve350Plan(
        first,
        readReceipt({
          observedAt: "2026-08-24T13:46:54.000Z",
          target: { ...first.target, corsDigest: "b".repeat(64) },
        }),
      ),
    ).toThrow(/provider identity drift/i);
  });

  it("builds a deterministic exact-target plan without secret identifiers", () => {
    const first = readReceipt();
    const second = readReceipt({ observedAt: "2026-08-24T13:46:54.000Z" });
    const left = buildOve350Plan(first, second);
    const right = buildOve350Plan(
      { ...first, target: { ...first.target } },
      { ...second, target: { ...second.target } },
    );

    expect(left.planDigest).toBe(right.planDigest);
    expect(left.planDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(left.targetBucket).toBe(OVE350_TARGET_BUCKET);
    expect(left.rollback.emptyBucketShape).toMatchObject({
      publicAccess: false,
      restoreBytes: false,
      cors: { ruleId: "overgarden-quarantine-browser-upload" },
      lifecycle: { ruleId: "delete-quarantine-originals-after-1-day" },
    });
    expect(JSON.stringify(left)).not.toMatch(
      /access[_-]?key|secret|object[_-]?key|@/i,
    );
  });

  it("rejects wrong approval identity or plan digest", () => {
    const plan = approvedPlan();
    const approval = approvalReceipt(plan);
    expect(() =>
      verifyOve350ApplyGate(
        plan,
        { ...approval, planDigest: "f".repeat(64) },
        immediateRead(),
        new Date("2026-08-24T13:49:00.000Z"),
      ),
    ).toThrow(/approval digest/i);
    expect(() =>
      verifyOve350ApplyGate(
        plan,
        { ...approval, targetBucket: "overgarden-public" as never },
        immediateRead(),
        new Date("2026-08-24T13:49:00.000Z"),
      ),
    ).toThrow(/approval identity/i);
  });

  it("requires an immediate read and completed shared credential rotation", () => {
    const plan = approvedPlan();
    const approval = approvalReceipt(plan);
    expect(() =>
      verifyOve350ApplyGate(
        plan,
        approval,
        immediateRead({
          credentials: {
            ...immediateRead().credentials,
            applicationScope: "shared_public_legacy",
            observerScope: "shared_public_legacy",
          },
        }),
        new Date("2026-08-24T13:49:00.000Z"),
      ),
    ).toThrow(/shared credential rotation/i);
    expect(() =>
      verifyOve350ApplyGate(
        plan,
        approval,
        immediateRead({ observedAt: "2026-08-24T13:40:00.000Z" }),
        new Date("2026-08-24T13:49:00.000Z"),
      ),
    ).toThrow(/immediate read/i);
  });

  it("cancels an approved apply when a last-writer race appears", async () => {
    const plan = approvedPlan();
    const deps = dependencies({
      collectImmediateRead: vi.fn().mockResolvedValue(
        immediateRead({
          target: { ...immediateRead().target, objectCount: 1 },
        }),
      ),
    });

    await expect(
      executeOve350Retirement(plan, approvalReceipt(plan), deps),
    ).rejects.toThrow(/zero state/i);
    expect(deps.deleteExactBucket).not.toHaveBeenCalled();
  });

  it("treats exact absent-target replay as terminal only with the same plan", async () => {
    const plan = approvedPlan();
    const deps = dependencies({
      collectImmediateRead: vi.fn().mockResolvedValue(
        immediateRead({
          target: { ...immediateRead().target, exists: false },
        }),
      ),
    });

    const receipt = await executeOve350Retirement(
      plan,
      approvalReceipt(plan),
      deps,
    );
    expect(receipt).toMatchObject({ terminalState: "verified", replay: true });
    expect(deps.deleteExactBucket).not.toHaveBeenCalled();
  });

  it("does not claim success when delete fails", async () => {
    const plan = approvedPlan();
    const deps = dependencies({
      deleteExactBucket: vi
        .fn()
        .mockRejectedValue(new Error("provider conflict")),
    });

    await expect(
      executeOve350Retirement(plan, approvalReceipt(plan), deps),
    ).rejects.toThrow(/provider conflict/i);
    expect(deps.recreateEmptyBucket).not.toHaveBeenCalled();
  });

  it("recreates only the empty rollback shape when a post-delete canary fails", async () => {
    const plan = approvedPlan();
    const deps = dependencies({
      verifyPreservedCanaries: vi.fn().mockResolvedValue(false),
    });

    await expect(
      executeOve350Retirement(plan, approvalReceipt(plan), deps),
    ).rejects.toThrow(/preserved canary/i);
    expect(deps.recreateEmptyBucket).toHaveBeenCalledWith(
      plan.rollback.emptyBucketShape,
    );
  });

  it("bounds a Cloudflare list timeout and leaves cancellation responsive", async () => {
    vi.useFakeTimers();
    try {
      const operation = withBoundedCollector(
        "cloudflare_list",
        () => new Promise<never>(() => undefined),
        30_000,
      );
      const cancel = operation.cancel;
      expect(cancel()).toBe(true);
      await expect(operation.result).rejects.toThrow(/cancelled/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds a Vercel env read timeout without admitting late evidence", async () => {
    vi.useFakeTimers();
    try {
      const operation = withBoundedCollector(
        "vercel_env_read",
        () => new Promise<never>(() => undefined),
        30_000,
      );
      const expectation = expect(operation.result).rejects.toThrow(
        /timed out/i,
      );
      await vi.advanceTimersByTimeAsync(30_001);
      await expectation;
      expect(operation.status()).toBe("timed_out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes approved apply within the 60-second performance budget", async () => {
    const plan = approvedPlan();
    const startedAt = performance.now();
    const receipt = await executeOve350Retirement(
      plan,
      approvalReceipt(plan),
      dependencies(),
    );
    expect(receipt.terminalState).toBe("verified");
    expect(performance.now() - startedAt).toBeLessThan(60_000);
  });

  it("rejects receipts containing keys, secrets, identities, or precise location", () => {
    expect(() => assertOve350ReceiptRedacted(readReceipt())).not.toThrow();
    expect(() =>
      assertOve350ReceiptRedacted({
        ...readReceipt(),
        objectKey: "private/key",
      }),
    ).toThrow(/redaction/i);
    expect(() =>
      assertOve350ReceiptRedacted({
        ...readReceipt(),
        email: "person@example.com",
      }),
    ).toThrow(/redaction/i);
    expect(() =>
      assertOve350ReceiptRedacted({ ...readReceipt(), latitude: 42.6977 }),
    ).toThrow(/redaction/i);
  });

  it("hashes evidence independent of object property order", () => {
    expect(stableOve350Digest({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableOve350Digest({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
});

function readReceipt(
  override: DeepPartial<Ove350ReadReceipt> = {},
): Ove350ReadReceipt {
  const base: Ove350ReadReceipt = {
    version: "ove350.zeroRead.v1",
    environment: "production",
    accountId: "cb03b15042adc74edfe2d8201636300a",
    horizonStartAt: "2026-08-24T13:05:51.416Z",
    observedAt: OVE350_FIRST_READ_EARLIEST_AT,
    target: {
      bucket: OVE350_TARGET_BUCKET,
      exists: true,
      objectCount: 0,
      totalBytes: 0,
      multipartUploads: 0,
      corsDigest: "1".repeat(64),
      lifecycleDigest: "2".repeat(64),
      publicAccess: false,
    },
    application: {
      deploymentSha: "b".repeat(40),
      deploymentReadyAt: "2026-08-24T13:05:51.416Z",
      legacyEnvReferences: 0,
      legacyRouteRequests: 0,
      server5xx: 0,
      logWindowComplete: true,
    },
    database: {
      contractedSchema: true,
      legacyJobsOrClaims: 0,
    },
    repository: { legacyRuntimeReferences: 0 },
    preserved: {
      publicBucketPresent: true,
      stagingBucketPresent: true,
      publicDomainHealthy: true,
      stagingWorkerHealthy: true,
    },
    credentials: {
      observerScope: "shared_public_legacy",
      applicationScope: "shared_public_legacy",
      observerDetached: false,
    },
    durationMs: 900,
  };
  return merge(base, override);
}

function immediateRead(
  override: DeepPartial<Ove350ReadReceipt> = {},
): Ove350ReadReceipt {
  return readReceipt({
    observedAt: "2026-08-24T13:48:00.000Z",
    credentials: {
      observerScope: "public_only",
      applicationScope: "public_only",
      observerDetached: false,
    },
    ...override,
  });
}

function approvedPlan(): Ove350Plan {
  return buildOve350Plan(
    readReceipt(),
    readReceipt({ observedAt: "2026-08-24T13:46:54.000Z" }),
  );
}

function approvalReceipt(plan: Ove350Plan): Ove350ApprovalReceipt {
  return {
    version: "ove350.destructiveApproval.v1",
    decision: "approved",
    authorityClass: "maintainer",
    environment: "production",
    accountId: plan.accountId,
    targetBucket: plan.targetBucket,
    planDigest: plan.planDigest,
    approvedAt: "2026-08-24T13:47:30.000Z",
  };
}

function dependencies(
  override: Partial<Ove350RetirementDependencies> = {},
): Ove350RetirementDependencies {
  return {
    acquireLock: vi.fn().mockResolvedValue(async () => undefined),
    collectImmediateRead: vi.fn().mockResolvedValue(immediateRead()),
    deleteExactBucket: vi.fn().mockResolvedValue(undefined),
    convergeCredential: vi.fn().mockResolvedValue(undefined),
    readTargetAbsent: vi.fn().mockResolvedValue(true),
    waitBeforeSecondAbsenceRead: vi.fn().mockResolvedValue(undefined),
    verifyPreservedCanaries: vi.fn().mockResolvedValue(true),
    recreateEmptyBucket: vi.fn().mockResolvedValue(undefined),
    now: () => new Date("2026-08-24T13:49:00.000Z"),
    ...override,
  };
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function merge<T extends object>(base: T, override: DeepPartial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] =
      value &&
      current &&
      typeof value === "object" &&
      typeof current === "object" &&
      !Array.isArray(value)
        ? merge(current as object, value as never)
        : value;
  }
  return result as T;
}
