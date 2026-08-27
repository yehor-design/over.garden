import { describe, expect, it } from "vitest";

import {
  classifyApplyGate,
  classifyVerifyOutcome,
  KNOWN_DEPENDENT_RELATIONS,
  OVE353_APPLY_BATCH_LIMIT,
  OVE353_APPLY_CONFIRMATION,
  OVE353_PLAN_VERSION,
  parsePlanOperatorArgs,
  planDigest,
  type JournalDeleteRetentionPlan,
} from "./plan-journal-delete-retention-transition";

const APPROVED = "a".repeat(64);
const SHA = "b".repeat(40);

function plan(
  overrides: Partial<JournalDeleteRetentionPlan> = {},
): JournalDeleteRetentionPlan {
  return {
    version: OVE353_PLAN_VERSION,
    environmentClass: "production",
    schema: {
      hasDeletedAt: true,
      hasPurgeAfter: true,
      lifecycleCheckPresent: true,
      lifecycleCheckValidated: false,
      retentionCheckPresent: true,
      retentionCheckValidated: false,
      duePurgeIndexPresent: true,
    },
    lifecycleCounts: { active: 120, deletedRetention: 3, legacyArchived: 7 },
    legacyDependencies: [...KNOWN_DEPENDENT_RELATIONS]
      .sort()
      .map((relation) => ({ relation, rowCount: 0 })),
    effects: {
      legacyMissingProjectionIntent: 2,
      legacyMissingDerivativeRevoke: 1,
    },
    candidateCount: 7,
    ...overrides,
  };
}

describe("OVE-353 plan operator arguments", () => {
  it("refuses to run without matching environment confirmation", () => {
    expect(() =>
      parsePlanOperatorArgs(["--environment", "production"]),
    ).toThrow(/matching --environment/);
    expect(() =>
      parsePlanOperatorArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "local",
      ]),
    ).toThrow(/matching --environment/);
  });

  it("defaults to the read-only mode", () => {
    const args = parsePlanOperatorArgs([
      "--environment",
      "production",
      "--confirm-environment",
      "production",
    ]);
    expect(args.mode).toBe("dry-run");
    expect(args).not.toHaveProperty("approvedDigest");
  });

  it("refuses an apply without an approved digest and the exact confirmation", () => {
    const base = [
      "--environment",
      "production",
      "--confirm-environment",
      "production",
      "--mode",
      "apply",
    ];
    expect(() => parsePlanOperatorArgs(base)).toThrow(/--approved-digest/);
    expect(() =>
      parsePlanOperatorArgs([...base, "--approved-digest", "not-a-digest"]),
    ).toThrow(/--approved-digest/);
    expect(() =>
      parsePlanOperatorArgs([...base, "--approved-digest", APPROVED]),
    ).toThrow(/exact OVE-353 apply confirmation/);

    const args = parsePlanOperatorArgs([
      ...base,
      "--approved-digest",
      APPROVED,
      "--confirm-apply",
      OVE353_APPLY_CONFIRMATION,
    ]);
    expect(args.mode).toBe("apply");
    expect(args.approvedDigest).toBe(APPROVED);
  });

  it("accepts a verify run bound to a full commit SHA and rejects a short one", () => {
    const base = [
      "--environment",
      "production",
      "--confirm-environment",
      "production",
      "--mode",
      "verify",
    ];
    expect(
      parsePlanOperatorArgs([...base, "--implementation-sha", SHA])
        .implementationSha,
    ).toBe(SHA);
    expect(() =>
      parsePlanOperatorArgs([...base, "--implementation-sha", "abc123"]),
    ).toThrow(/40-character commit/);
  });
});

describe("OVE-353 plan digest", () => {
  it("is stable under key order and changes with any classified value", () => {
    const left = plan();
    const right = plan();
    expect(planDigest(left)).toBe(planDigest(right));
    expect(planDigest(plan({ candidateCount: 8 }))).not.toBe(planDigest(left));
  });
});

describe("OVE-353 apply gate", () => {
  const allow = (overrides: Partial<JournalDeleteRetentionPlan> = {}) => {
    const subject = plan(overrides);
    return classifyApplyGate({
      plan: subject,
      observedDigest: planDigest(subject),
      approvedDigest: planDigest(subject),
      batchLimit: OVE353_APPLY_BATCH_LIMIT,
    });
  };

  it("allows exactly the approved candidate set", () => {
    expect(allow()).toEqual({ state: "allowed", candidateCount: 7 });
  });

  it("blocks when live state no longer matches the approved digest", () => {
    const subject = plan();
    expect(
      classifyApplyGate({
        plan: subject,
        observedDigest: planDigest(subject),
        approvedDigest: APPROVED,
        batchLimit: OVE353_APPLY_BATCH_LIMIT,
      }),
    ).toEqual({ state: "blocked", reason: "plan_digest_drift" });
  });

  it("blocks before the expand migration has landed", () => {
    expect(
      allow({
        schema: { ...plan().schema, hasPurgeAfter: false },
      }),
    ).toEqual({ state: "blocked", reason: "migration_0039_not_applied" });
  });

  it("blocks when there is nothing to convert rather than running empty", () => {
    expect(
      allow({
        lifecycleCounts: { active: 120, deletedRetention: 3, legacyArchived: 0 },
        candidateCount: 0,
      }),
    ).toEqual({ state: "blocked", reason: "nothing_to_convert" });
  });

  it("blocks on an unlisted dependent relation", () => {
    // A relation nobody classified means the foreign-key closure is not the one
    // this script was written against; converting would be a guess.
    expect(
      allow({
        legacyDependencies: [{ relation: "some_new_table", rowCount: 1 }],
      }),
    ).toEqual({ state: "blocked", reason: "unknown_dependent_relation" });
  });

  it("blocks a candidate set larger than one bounded batch", () => {
    const oversized = OVE353_APPLY_BATCH_LIMIT + 1;
    expect(
      allow({
        lifecycleCounts: {
          active: 120,
          deletedRetention: 3,
          legacyArchived: oversized,
        },
        candidateCount: oversized,
      }),
    ).toEqual({ state: "blocked", reason: "candidate_count_over_batch_limit" });
  });
});

describe("OVE-353 verify outcome", () => {
  const validated = {
    ...plan().schema,
    lifecycleCheckValidated: true,
    retentionCheckValidated: true,
  };

  it("verifies only a zero-legacy, fully validated schema", () => {
    expect(
      classifyVerifyOutcome({
        plan: plan({
          schema: validated,
          lifecycleCounts: {
            active: 120,
            deletedRetention: 3,
            legacyArchived: 0,
          },
        }),
      }),
    ).toEqual({ state: "verified" });
  });

  it("reports every unmet condition at once rather than the first", () => {
    const outcome = classifyVerifyOutcome({
      plan: plan({
        schema: { ...plan().schema, duePurgeIndexPresent: false },
      }),
    });
    expect(outcome.state).toBe("failed");
    expect(outcome.state === "failed" && outcome.reasons).toEqual([
      "legacy_archived_rows_remain",
      "lifecycle_check_not_validated",
      "retention_check_not_validated",
      "due_purge_index_absent",
    ]);
  });
});
