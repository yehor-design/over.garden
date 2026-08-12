import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  applyGoogleLinkingIndexes,
  classifyGoogleLinkingCounts,
  collectGoogleLinkingCounts,
  digestGoogleLinkingArtifact,
  GOOGLE_INDEX_CANONICAL_DEFINITIONS,
  parseGoogleLinkingApprovalArtifact,
  parseGoogleLinkingPlanArtifact,
  readGoogleLinkingProductionInventory,
  settleGoogleLinkingReadbackWithinDeadline,
  validateGoogleLinkingApproval,
  validateGoogleLinkingTerminalReceipt,
  type GoogleLinkingApprovalReceiptV1,
  type GoogleLinkingProductionCounts,
  type GoogleLinkingProductionPlanV1,
  type GoogleLinkingProductionReceiptV1,
} from "./check-google-linking-production-proof-plan";

const IMPLEMENTATION_SHA = "a".repeat(40);
const MIGRATION_DIGEST = "b".repeat(64);
const TARGET_DIGEST = "c".repeat(64);
const SAFE_COUNTS = {
  googleAccountRowCount: 3,
  duplicateGoogleSubjectGroupCount: 0,
  duplicateGoogleUserGroupCount: 0,
  missingGoogleSubjectCount: 0,
  invalidGoogleProviderRowCount: 0,
} as const satisfies GoogleLinkingProductionCounts;

function planArtifact(overrides: Partial<GoogleLinkingProductionPlanV1> = {}) {
  const plan = {
    schema: "overgarden.google-linking-production-proof-plan.v1",
    issue: "OVE-298",
    environment: "production",
    implementationSha: "$OVE298_IMPLEMENTATION_SHA",
    migrationPath: "sql/0022_ove295_google_account_uniqueness.sql",
    migrationDigest: MIGRATION_DIGEST,
    counts: SAFE_COUNTS,
    inventoryClass: "safe_to_apply",
    preflightIndexState: "both_absent",
    expectedIndexDefinitionDigests: {
      providerSubject: digestGoogleLinkingArtifact(
        GOOGLE_INDEX_CANONICAL_DEFINITIONS.providerSubject,
      ),
      userProvider: digestGoogleLinkingArtifact(
        GOOGLE_INDEX_CANONICAL_DEFINITIONS.userProvider,
      ),
    },
    configurationClass: "absent_or_false",
    googleProviderClass: "configured",
    disposableIdentityClass: "ordinary_credential_non_owner_non_admin",
    terminalSuccessConfiguration: "enabled",
    targetDigest: TARGET_DIGEST,
    effectBounds: {
      indexCreates: 2,
      configurationWrites: 1,
      disposableAccountCreates: 1,
      verificationCallbacks: 1,
      linkInitiations: 1,
      callbacks: 1,
      unlinks: 1,
      providerRevocations: 1,
      erasureExecutions: 1,
    },
    mutationOrder: [
      "database_indexes",
      "vercel_flag",
      "disposable_signup",
      "email_verification",
      "disposable_link",
      "authoritative_readback",
      "fresh_session_unlink",
      "provider_revoke",
      "erasure_cleanup",
    ],
    ...overrides,
  };
  return [
    "# Plan",
    "",
    "```json ove298-plan-v1",
    JSON.stringify(plan, null, 2),
    "```",
    "",
  ].join("\n");
}

function parsedPlan(overrides: Partial<GoogleLinkingProductionPlanV1> = {}) {
  return parseGoogleLinkingPlanArtifact(
    planArtifact(overrides),
    IMPLEMENTATION_SHA,
  );
}

function approvalFor(
  artifact: string,
  plan = parseGoogleLinkingPlanArtifact(artifact, IMPLEMENTATION_SHA),
): GoogleLinkingApprovalReceiptV1 {
  return {
    status: "approved",
    planDigest: digestGoogleLinkingArtifact(artifact),
    implementationSha: IMPLEMENTATION_SHA,
    environment: "production",
    migrationDigest: plan.migrationDigest,
    counts: { ...plan.counts },
    targetDigest: plan.targetDigest,
    disposableIdentityClass: "ordinary_credential_non_owner_non_admin",
    terminalSuccessConfiguration: "enabled",
  };
}

function exactIndexRows() {
  return [
    {
      indexname: "account_google_provider_subject_unique_idx",
      indexdef:
        'CREATE UNIQUE INDEX account_google_provider_subject_unique_idx ON public.account USING btree ("providerId", "accountId") WHERE ("providerId" = \'google\'::text)',
    },
    {
      indexname: "account_google_user_provider_unique_idx",
      indexdef:
        'CREATE UNIQUE INDEX account_google_user_provider_unique_idx ON public.account USING btree ("userId", "providerId") WHERE ("providerId" = \'google\'::text)',
    },
  ];
}

function aggregateExecutor(
  counts: GoogleLinkingProductionCounts = SAFE_COUNTS,
) {
  return {
    query: vi.fn(async (sql: string) => {
      const key = Object.keys(counts).find((candidate) =>
        sql.includes(`/* ${candidate} */`),
      ) as keyof GoogleLinkingProductionCounts | undefined;
      if (!key) throw new Error(`Unexpected aggregate query: ${sql}`);
      return { rows: [{ count: String(counts[key]) }] };
    }),
  };
}

function transactionalClient({
  counts = SAFE_COUNTS,
  initialIndexes = "both_absent",
  migrationSql = "-- tracked migration",
}: {
  counts?: GoogleLinkingProductionCounts;
  initialIndexes?: "both_absent" | "both_exact" | "partial";
  migrationSql?: string;
} = {}) {
  let indexState = initialIndexes;
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (/^(begin|commit|rollback|set local)/i.test(sql.trim())) {
        return { rows: [], rowCount: null };
      }
      const key = Object.keys(counts).find((candidate) =>
        sql.includes(`/* ${candidate} */`),
      ) as keyof GoogleLinkingProductionCounts | undefined;
      if (key) return { rows: [{ count: String(counts[key]) }] };
      if (sql.includes("/* googleLinkingIndexReadback */")) {
        return {
          rows:
            indexState === "both_absent"
              ? []
              : indexState === "partial"
                ? exactIndexRows().slice(0, 1)
                : exactIndexRows(),
        };
      }
      if (sql === migrationSql) {
        indexState = "both_exact";
        return { rows: [], rowCount: null };
      }
      throw new Error(`Unexpected transaction query: ${sql}`);
    }),
  };
  return { client, queries };
}

describe("OVE-298 Google linking production proof plan", () => {
  it("keeps the tracked production plan machine-readable and approval-bound", () => {
    const artifact = readFileSync(
      path.resolve(
        "../../docs/runbooks/OVE_298_PRODUCTION_GOOGLE_LINK_PROOF_PLAN.md",
      ),
      "utf8",
    );
    const plan = parseGoogleLinkingPlanArtifact(artifact, IMPLEMENTATION_SHA);

    expect(plan).toMatchObject({
      implementationSha: IMPLEMENTATION_SHA,
      migrationDigest:
        "6392a41f971176eb9de748f54fc15beb76a6a77f8a755694d327fe8eae40f6bd",
      counts: {
        googleAccountRowCount: 1,
        duplicateGoogleSubjectGroupCount: 0,
        duplicateGoogleUserGroupCount: 0,
        missingGoogleSubjectCount: 0,
        invalidGoogleProviderRowCount: 0,
      },
      preflightIndexState: "both_absent",
      targetDigest:
        "84503a97fba4e9febf14db87091ce05d2866796d78109f812a649c23f9c36462",
      disposableIdentityClass: "ordinary_credential_non_owner_non_admin",
      terminalSuccessConfiguration: "enabled",
    });
    expect(digestGoogleLinkingArtifact(artifact)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the post-rollback retry plan exact-index and zero-index-effect bound", () => {
    const artifact = readFileSync(
      path.resolve(
        "../../docs/runbooks/OVE_298_PRODUCTION_GOOGLE_LINK_PROOF_RETRY_PLAN.md",
      ),
      "utf8",
    );
    const plan = parseGoogleLinkingPlanArtifact(artifact, IMPLEMENTATION_SHA);

    expect(plan).toMatchObject({
      implementationSha: IMPLEMENTATION_SHA,
      counts: {
        googleAccountRowCount: 1,
        duplicateGoogleSubjectGroupCount: 0,
        duplicateGoogleUserGroupCount: 0,
        missingGoogleSubjectCount: 0,
        invalidGoogleProviderRowCount: 0,
      },
      preflightIndexState: "both_exact",
      effectBounds: { indexCreates: 0 },
      targetDigest:
        "84503a97fba4e9febf14db87091ce05d2866796d78109f812a649c23f9c36462",
    });
    expect(digestGoogleLinkingArtifact(artifact)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the deadline-bound second retry exact-index and zero-index-effect bound", () => {
    const artifact = readFileSync(
      path.resolve(
        "../../docs/runbooks/OVE_298_PRODUCTION_GOOGLE_LINK_PROOF_RETRY_2_PLAN.md",
      ),
      "utf8",
    );
    const plan = parseGoogleLinkingPlanArtifact(artifact, IMPLEMENTATION_SHA);

    expect(plan).toMatchObject({
      implementationSha: IMPLEMENTATION_SHA,
      counts: {
        googleAccountRowCount: 1,
        duplicateGoogleSubjectGroupCount: 0,
        duplicateGoogleUserGroupCount: 0,
        missingGoogleSubjectCount: 0,
        invalidGoogleProviderRowCount: 0,
      },
      preflightIndexState: "both_exact",
      effectBounds: {
        indexCreates: 0,
        configurationWrites: 1,
        disposableAccountCreates: 1,
        verificationCallbacks: 1,
        linkInitiations: 1,
        callbacks: 1,
        unlinks: 1,
        providerRevocations: 1,
        erasureExecutions: 1,
      },
      targetDigest:
        "84503a97fba4e9febf14db87091ce05d2866796d78109f812a649c23f9c36462",
    });
    expect(digestGoogleLinkingArtifact(artifact)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("classifies exactly five aggregate counts and fails closed for every safety count", () => {
    expect(classifyGoogleLinkingCounts(SAFE_COUNTS)).toBe("safe_to_apply");
    for (const key of [
      "duplicateGoogleSubjectGroupCount",
      "duplicateGoogleUserGroupCount",
      "missingGoogleSubjectCount",
      "invalidGoogleProviderRowCount",
    ] as const) {
      expect(classifyGoogleLinkingCounts({ ...SAFE_COUNTS, [key]: 1 })).toBe(
        "blocked_by_inventory",
      );
    }
    expect(
      classifyGoogleLinkingCounts({
        ...SAFE_COUNTS,
        googleAccountRowCount: -1,
      }),
    ).toBe("inventory_inconclusive");
    expect(
      classifyGoogleLinkingCounts({
        ...SAFE_COUNTS,
        duplicateGoogleSubjectGroupCount: 4,
      }),
    ).toBe("inventory_inconclusive");
  });

  it("returns only the five approved aggregate values", async () => {
    const executor = aggregateExecutor();

    await expect(collectGoogleLinkingCounts(executor)).resolves.toEqual(
      SAFE_COUNTS,
    );
    expect(executor.query).toHaveBeenCalledTimes(5);
    expect(
      JSON.stringify(await collectGoogleLinkingCounts(executor)),
    ).not.toMatch(/@|bearer|signed-token|provider-secret|example\.com/i);
  });

  it("settles read-only inventory once within 30 seconds and fences late completion", async () => {
    vi.useFakeTimers();
    let resolveLate!: (value: string) => void;
    try {
      const result = settleGoogleLinkingReadbackWithinDeadline(
        () => new Promise<string>((resolve) => (resolveLate = resolve)),
        30_000,
      );
      const timedOut = expect(result).rejects.toThrow(
        "read-back deadline exceeded",
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await timedOut;
      resolveLate("unsafe-late-value");
      await Promise.resolve();
      await expect(result).rejects.toThrow("read-back deadline exceeded");
    } finally {
      vi.useRealTimers();
    }
  });

  it("classifies the bounded repeatable-read inventory without row evidence", async () => {
    const { client } = transactionalClient();

    await expect(
      readGoogleLinkingProductionInventory({
        client,
        environment: "production",
        implementationSha: IMPLEMENTATION_SHA,
        migrationDigest: MIGRATION_DIGEST,
        targetDigest: TARGET_DIGEST,
        deadlineMs: 30_000,
        now: (() => {
          let value = 100;
          return () => (value += 12);
        })(),
      }),
    ).resolves.toMatchObject({
      schema: "overgarden.google-linking-production-inventory.v1",
      issue: "OVE-298",
      environment: "production",
      resultClass: "safe_to_apply",
      counts: SAFE_COUNTS,
      indexState: "both_absent",
      evidenceSafety: "five_counts_digests_and_classes_only",
    });
  });

  it("parses one byte-exact plan and rejects migration, target, count, or shape drift", () => {
    const artifact = planArtifact();
    expect(
      parseGoogleLinkingPlanArtifact(artifact, IMPLEMENTATION_SHA),
    ).toEqual(
      expect.objectContaining({
        implementationSha: IMPLEMENTATION_SHA,
        migrationDigest: MIGRATION_DIGEST,
        counts: SAFE_COUNTS,
        targetDigest: TARGET_DIGEST,
      }),
    );
    expect(() =>
      parseGoogleLinkingPlanArtifact(
        `${artifact}${artifact}`,
        IMPLEMENTATION_SHA,
      ),
    ).toThrow("exactly one");
    expect(() => parsedPlan({ migrationDigest: "d".repeat(64) })).not.toThrow();
    expect(() =>
      parsedPlan({
        expectedIndexDefinitionDigests: {
          providerSubject: "0".repeat(64),
          userProvider: "0".repeat(64),
        },
      }),
    ).toThrow("index definition digest");
    expect(() =>
      parsedPlan({ disposableIdentityClass: "sealed_owner" as never }),
    ).toThrow("disposable identity");
    expect(() => parsedPlan({ preflightIndexState: "both_exact" })).toThrow(
      "effect bounds drifted",
    );
  });

  it("requires an exact closed approval receipt", () => {
    const artifact = planArtifact();
    const plan = parseGoogleLinkingPlanArtifact(artifact, IMPLEMENTATION_SHA);
    const approval = approvalFor(artifact, plan);
    const parsedApproval = parseGoogleLinkingApprovalArtifact(
      JSON.stringify(approval),
    );

    expect(
      validateGoogleLinkingApproval({
        plan,
        planDigest: digestGoogleLinkingArtifact(artifact),
        approval: parsedApproval,
        current: {
          implementationSha: IMPLEMENTATION_SHA,
          migrationDigest: MIGRATION_DIGEST,
          counts: SAFE_COUNTS,
          targetDigest: TARGET_DIGEST,
          indexState: "both_absent",
        },
      }),
    ).toEqual({ ok: true, class: "approved_exact_plan" });

    for (const drift of [
      { ...approval, status: "pending" as const },
      { ...approval, planDigest: "f".repeat(64) },
      { ...approval, implementationSha: "f".repeat(40) },
      { ...approval, migrationDigest: "f".repeat(64) },
      { ...approval, counts: { ...SAFE_COUNTS, googleAccountRowCount: 4 } },
      { ...approval, targetDigest: "f".repeat(64) },
    ]) {
      expect(
        validateGoogleLinkingApproval({
          plan,
          planDigest: digestGoogleLinkingArtifact(artifact),
          approval: drift,
          current: {
            implementationSha: IMPLEMENTATION_SHA,
            migrationDigest: MIGRATION_DIGEST,
            counts: SAFE_COUNTS,
            targetDigest: TARGET_DIGEST,
            indexState: "both_absent",
          },
        }),
      ).toEqual({ ok: false, class: "approval_missing_or_drifted" });
    }
  });

  it("applies only the tracked migration after a locked matching preflight", async () => {
    const migrationSql = "-- tracked migration";
    const migrationDigest = digestGoogleLinkingArtifact(migrationSql);
    const artifact = planArtifact({ migrationDigest });
    const plan = parseGoogleLinkingPlanArtifact(artifact, IMPLEMENTATION_SHA);
    const approval = approvalFor(artifact, plan);
    const { client, queries } = transactionalClient({ migrationSql });

    await expect(
      applyGoogleLinkingIndexes({
        client,
        plan,
        planDigest: digestGoogleLinkingArtifact(artifact),
        approval,
        implementationSha: IMPLEMENTATION_SHA,
        migrationSql,
        targetDigest: TARGET_DIGEST,
      }),
    ).resolves.toMatchObject({
      resultClass: "indexes_verified",
      effectClass: "created_two_indexes",
      before: { counts: SAFE_COUNTS, indexState: "both_absent" },
      after: { counts: SAFE_COUNTS, indexState: "both_exact" },
    });
    expect(queries.filter((query) => query === migrationSql)).toHaveLength(1);
    expect(queries.at(-1)).toBe("commit");
  });

  it("is idempotent for exact indexes and rejects partial apply or drift", async () => {
    const migrationSql = "-- tracked migration";
    const migrationDigest = digestGoogleLinkingArtifact(migrationSql);
    const exactArtifact = planArtifact({
      migrationDigest,
      preflightIndexState: "both_exact",
      effectBounds: {
        indexCreates: 0,
        configurationWrites: 1,
        disposableAccountCreates: 1,
        verificationCallbacks: 1,
        linkInitiations: 1,
        callbacks: 1,
        unlinks: 1,
        providerRevocations: 1,
        erasureExecutions: 1,
      },
    });
    const exactPlan = parseGoogleLinkingPlanArtifact(
      exactArtifact,
      IMPLEMENTATION_SHA,
    );
    const exactClient = transactionalClient({
      migrationSql,
      initialIndexes: "both_exact",
    });
    await expect(
      applyGoogleLinkingIndexes({
        client: exactClient.client,
        plan: exactPlan,
        planDigest: digestGoogleLinkingArtifact(exactArtifact),
        approval: approvalFor(exactArtifact, exactPlan),
        implementationSha: IMPLEMENTATION_SHA,
        migrationSql,
        targetDigest: TARGET_DIGEST,
      }),
    ).resolves.toMatchObject({ effectClass: "already_exact" });
    expect(
      exactClient.queries.filter((query) => query === migrationSql),
    ).toHaveLength(0);

    const partial = transactionalClient({
      migrationSql,
      initialIndexes: "partial",
    });
    const absentArtifact = planArtifact({ migrationDigest });
    const absentPlan = parseGoogleLinkingPlanArtifact(
      absentArtifact,
      IMPLEMENTATION_SHA,
    );
    await expect(
      applyGoogleLinkingIndexes({
        client: partial.client,
        plan: absentPlan,
        planDigest: digestGoogleLinkingArtifact(absentArtifact),
        approval: approvalFor(absentArtifact, absentPlan),
        implementationSha: IMPLEMENTATION_SHA,
        migrationSql,
        targetDigest: TARGET_DIGEST,
      }),
    ).rejects.toThrow("missing or drifted");
    expect(partial.queries).toContain("rollback");
    expect(partial.queries).not.toContain(migrationSql);
  });

  it("admits a terminal receipt only after unlink, provider revocation, and cleanup", () => {
    const completed = {
      schema: "overgarden.google-linking-production-receipt.v1",
      issue: "OVE-298",
      version: 1,
      planDigest: "d".repeat(64),
      implementationSha: IMPLEMENTATION_SHA,
      deploymentSha: "e".repeat(40),
      migrationDigest: MIGRATION_DIGEST,
      environmentClass: "production_over_garden",
      state: "completed",
      fiveCounts: SAFE_COUNTS,
      indexDefinitionDigests: {
        providerSubject: digestGoogleLinkingArtifact(
          GOOGLE_INDEX_CANONICAL_DEFINITIONS.providerSubject,
        ),
        userProvider: digestGoogleLinkingArtifact(
          GOOGLE_INDEX_CANONICAL_DEFINITIONS.userProvider,
        ),
      },
      configurationClass: "enabled",
      linkOutcome: "linked_once",
      readbackOutcome: "current_user_google_present",
      unlinkOutcome: "google_absent_credential_present",
      providerCleanupOutcome: "revoked",
      sessionCleanupOutcome: "disposable_absent",
      rollbackOutcome: "not_required",
      evidenceDigest: "f".repeat(64),
    } as const satisfies GoogleLinkingProductionReceiptV1;

    expect(validateGoogleLinkingTerminalReceipt(completed)).toEqual({
      ok: true,
      class: "completed",
    });
    for (const drift of [
      { ...completed, unlinkOutcome: "uncertain" as const },
      { ...completed, providerCleanupOutcome: "uncertain" as const },
      { ...completed, sessionCleanupOutcome: "uncertain" as const },
      { ...completed, configurationClass: "absent_or_false" as const },
    ]) {
      expect(validateGoogleLinkingTerminalReceipt(drift)).toEqual({
        ok: false,
        class: "incomplete_or_drifted",
      });
    }
    expect(() =>
      validateGoogleLinkingTerminalReceipt({
        ...completed,
        email: "forbidden@example.com",
      } as never),
    ).toThrow("unexpected field");
  });
});
