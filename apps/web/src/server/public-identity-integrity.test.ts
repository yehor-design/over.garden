import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/types";
import {
  applyPublicIdentityBackfill,
  buildPublicIdentityIntegrityReportQuery,
  buildPublicIdentityProvisionCandidatesQuery,
  provePublicIdentityMigrationRollback,
  PUBLIC_IDENTITY_INTEGRITY_SCHEMA,
  publicIdentityIntegrityReady,
  type PublicIdentityDisplayNameReviewCandidate,
  type PublicIdentityHandleReviewCandidate,
  type PublicIdentityIntegrityReport,
  type PublicIdentityMigrationStore,
  type PublicIdentityProfileHandleReviewCandidate,
  type PublicIdentityProvisionCandidate,
} from "@/server/public-identity-integrity";

class TestPostgresDialect implements Dialect {
  createDriver(): Driver {
    return new DummyDriver();
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}

const testDb = new Kysely<Database>({ dialect: new TestPostgresDialect() });

function report(
  overrides: Partial<PublicIdentityIntegrityReport> = {},
): PublicIdentityIntegrityReport {
  const pendingHandleClaims = overrides.handleClaimsPendingPolicyReview ?? 0;
  const pendingProfileHandles =
    overrides.profilesPendingHandlePolicyReview ?? 0;
  const pendingDisplayNames = overrides.displayNamesPendingPolicyReview ?? 0;

  return {
    schema: PUBLIC_IDENTITY_INTEGRITY_SCHEMA,
    policyVersion: "ove203-identity-v1",
    totalUsers: 2,
    publicProfiles: 2,
    currentHandleClaims: 2,
    retiredHandleClaims: 0,
    usersMissingProfile: 0,
    usersMissingCurrentHandle: 0,
    duplicateCurrentHandles: 0,
    usersWithMultipleCurrentHandles: 0,
    profilesWithoutMatchingCurrentHandle: 0,
    currentHandlesWithoutMatchingProfile: 0,
    handleClaimsPendingPolicyReview: pendingHandleClaims,
    profilesPendingHandlePolicyReview: pendingProfileHandles,
    displayNamesPendingPolicyReview: pendingDisplayNames,
    unresolvedIdentityPolicyReviews:
      pendingHandleClaims + pendingProfileHandles + pendingDisplayNames,
    legacyPersonMentionsPendingReview: 0,
    ...overrides,
  };
}

class StatefulMigrationStore implements PublicIdentityMigrationStore {
  currentReport = report({
    publicProfiles: 1,
    currentHandleClaims: 1,
    usersMissingProfile: 1,
    usersMissingCurrentHandle: 1,
    handleClaimsPendingPolicyReview: 2,
    profilesPendingHandlePolicyReview: 2,
    displayNamesPendingPolicyReview: 1,
    unresolvedIdentityPolicyReviews: 5,
  });

  provisionCandidates: PublicIdentityProvisionCandidate[] = [
    { userId: "opaque-user-1" },
  ];
  handleCandidates: PublicIdentityHandleReviewCandidate[] = [
    {
      normalizedHandle: "gardener_0123456789abcdef",
      lifecycleState: "current",
      claimSource: "generated",
    },
    {
      normalizedHandle: "green_thumb",
      lifecycleState: "retired",
      claimSource: "legacy_custom",
    },
  ];
  profileCandidates: PublicIdentityProfileHandleReviewCandidate[] = [
    {
      userId: "opaque-user-1",
      handle: "gardener_0123456789abcdef",
      normalizedHandle: "gardener_0123456789abcdef",
      claimSource: "generated",
    },
    {
      userId: "opaque-user-2",
      handle: "green_thumb",
      normalizedHandle: "green_thumb",
      claimSource: "legacy_custom",
    },
  ];
  displayCandidates: PublicIdentityDisplayNameReviewCandidate[] = [
    { userId: "opaque-user-2", displayName: "Garden Friend" },
  ];

  async collectReport() {
    return this.currentReport;
  }

  async withTransaction<T>(
    callback: (store: PublicIdentityMigrationStore) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }

  async listProvisionCandidates() {
    return [...this.provisionCandidates];
  }

  async provisionUser(userId: string) {
    this.provisionCandidates = this.provisionCandidates.filter(
      (candidate) => candidate.userId !== userId,
    );
    this.currentReport = report({
      ...this.currentReport,
      publicProfiles: this.currentReport.publicProfiles + 1,
      currentHandleClaims: this.currentReport.currentHandleClaims + 1,
      usersMissingProfile: 0,
      usersMissingCurrentHandle: 0,
    });
  }

  async listHandleReviewCandidates() {
    return [...this.handleCandidates];
  }

  async markHandleReviewed(candidate: PublicIdentityHandleReviewCandidate) {
    this.handleCandidates = this.handleCandidates.filter(
      (existing) =>
        existing.normalizedHandle !== candidate.normalizedHandle ||
        existing.lifecycleState !== candidate.lifecycleState,
    );
    this.currentReport = report({
      ...this.currentReport,
      handleClaimsPendingPolicyReview:
        this.currentReport.handleClaimsPendingPolicyReview - 1,
      unresolvedIdentityPolicyReviews:
        this.currentReport.unresolvedIdentityPolicyReviews - 1,
    });
    return true;
  }

  async listProfileHandleReviewCandidates() {
    return [...this.profileCandidates];
  }

  async markProfileHandleReviewed(userId: string) {
    this.profileCandidates = this.profileCandidates.filter(
      (candidate) => candidate.userId !== userId,
    );
    this.currentReport = report({
      ...this.currentReport,
      profilesPendingHandlePolicyReview:
        this.currentReport.profilesPendingHandlePolicyReview - 1,
      unresolvedIdentityPolicyReviews:
        this.currentReport.unresolvedIdentityPolicyReviews - 1,
    });
    return true;
  }

  async listDisplayNameReviewCandidates() {
    return [...this.displayCandidates];
  }

  async markDisplayNameReviewed(userId: string) {
    this.displayCandidates = this.displayCandidates.filter(
      (candidate) => candidate.userId !== userId,
    );
    this.currentReport = report({
      ...this.currentReport,
      displayNamesPendingPolicyReview:
        this.currentReport.displayNamesPendingPolicyReview - 1,
      unresolvedIdentityPolicyReviews:
        this.currentReport.unresolvedIdentityPolicyReviews - 1,
    });
    return true;
  }

  async insertRollbackProbe() {
    this.currentReport = report({
      ...this.currentReport,
      totalUsers: this.currentReport.totalUsers + 1,
      publicProfiles: this.currentReport.publicProfiles + 1,
      currentHandleClaims: this.currentReport.currentHandleClaims + 1,
    });
  }
}

describe("OVE-203 public identity integrity tooling", () => {
  it("compiles one aggregate-only integrity report across every invariant", () => {
    const compiled = buildPublicIdentityIntegrityReportQuery().compile(testDb);

    expect(compiled.sql).toContain('from "user"');
    expect(compiled.sql).toContain("users_missing_profile");
    expect(compiled.sql).toContain("users_missing_current_handle");
    expect(compiled.sql).toContain("duplicate_current_handles");
    expect(compiled.sql).toContain("users_with_multiple_current_handles");
    expect(compiled.sql).toContain("profiles_without_matching_current_handle");
    expect(compiled.sql).toContain("current_handles_without_matching_profile");
    expect(compiled.sql).toContain("handle_claims_pending_policy_review");
    expect(compiled.sql).toContain("display_names_pending_policy_review");
    expect(compiled.sql).toContain("legacy_person_mentions_pending_review");
    expect(compiled.sql).not.toMatch(/select\s+[^()]*email/i);
    expect(compiled.sql).not.toMatch(/select\s+[^()]*display_name\s+as/i);
    expect(compiled.parameters).toEqual([
      "ove203-identity-v1",
      "ove203-identity-v1",
      "ove203-identity-v1",
    ]);
  });

  it("selects only users missing a profile or a current claim for provisioning", () => {
    const compiled =
      buildPublicIdentityProvisionCandidatesQuery(testDb).compile();

    expect(compiled.sql).toContain('select "auth_user"."id" as "userId"');
    expect(compiled.sql).toContain("not exists");
    expect(compiled.sql).toContain("user_public_profiles");
    expect(compiled.sql).toContain("user_handle_registry");
    expect(compiled.parameters).toEqual([]);
  });

  it("provisions missing identities, reviews safe legacy values, and is idempotent", async () => {
    const store = new StatefulMigrationStore();

    const first = await applyPublicIdentityBackfill(store);
    const second = await applyPublicIdentityBackfill(store);

    expect(first).toMatchObject({
      usersProvisionedOrReconciled: 1,
      handleClaimsReviewed: 2,
      profileHandlesReviewed: 2,
      displayNamesReviewed: 1,
      ready: true,
    });
    expect(first.after).toMatchObject({
      usersMissingProfile: 0,
      usersMissingCurrentHandle: 0,
      unresolvedIdentityPolicyReviews: 0,
    });
    expect(second).toMatchObject({
      usersProvisionedOrReconciled: 0,
      handleClaimsReviewed: 0,
      profileHandlesReviewed: 0,
      displayNamesReviewed: 0,
      ready: true,
    });
    expect(second.before).toEqual(first.after);
    expect(second.after).toEqual(first.after);
  });

  it("leaves rejected legacy values pending without exposing them in results", async () => {
    const markHandleReviewed = vi.fn(async () => true);
    const markDisplayNameReviewed = vi.fn(async () => true);
    const pendingReport = report({
      handleClaimsPendingPolicyReview: 1,
      displayNamesPendingPolicyReview: 1,
      unresolvedIdentityPolicyReviews: 2,
    });
    const store: PublicIdentityMigrationStore = {
      collectReport: async () => pendingReport,
      withTransaction: async (callback) => callback(store),
      listProvisionCandidates: async () => [],
      provisionUser: async () => undefined,
      listHandleReviewCandidates: async () => [
        {
          normalizedHandle: "admin",
          lifecycleState: "current",
          claimSource: "legacy_custom",
        },
      ],
      markHandleReviewed,
      listProfileHandleReviewCandidates: async () => [],
      markProfileHandleReviewed: async () => false,
      listDisplayNameReviewCandidates: async () => [
        { userId: "opaque-user-1", displayName: "\u202e" },
      ],
      markDisplayNameReviewed,
      insertRollbackProbe: async () => undefined,
    };

    const result = await applyPublicIdentityBackfill(store);
    const serialized = JSON.stringify(result);

    expect(result.ready).toBe(false);
    expect(result.after.unresolvedIdentityPolicyReviews).toBe(2);
    expect(markHandleReviewed).not.toHaveBeenCalled();
    expect(markDisplayNameReviewed).not.toHaveBeenCalled();
    expect(serialized).not.toContain("admin");
    expect(serialized).not.toContain("opaque-user");
    expect(serialized).not.toContain("\u202e");
  });

  it("does not attest a non-canonical legacy display name without rewriting it", async () => {
    const markDisplayNameReviewed = vi.fn(async () => true);
    const pendingReport = report({
      displayNamesPendingPolicyReview: 1,
      unresolvedIdentityPolicyReviews: 1,
    });
    const store: PublicIdentityMigrationStore = {
      collectReport: async () => pendingReport,
      withTransaction: async (callback) => callback(store),
      listProvisionCandidates: async () => [],
      provisionUser: async () => undefined,
      listHandleReviewCandidates: async () => [],
      markHandleReviewed: async () => false,
      listProfileHandleReviewCandidates: async () => [],
      markProfileHandleReviewed: async () => false,
      listDisplayNameReviewCandidates: async () => [
        { userId: "opaque-user-1", displayName: " Garden Friend " },
      ],
      markDisplayNameReviewed,
      insertRollbackProbe: async () => undefined,
    };

    const result = await applyPublicIdentityBackfill(store);

    expect(result.ready).toBe(false);
    expect(result.displayNamesReviewed).toBe(0);
    expect(markDisplayNameReviewed).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("Garden Friend");
    expect(JSON.stringify(result)).not.toContain("opaque-user");
  });

  it("fails verify readiness for every missing, duplicate, mismatch, or review gap", () => {
    const blockers: (keyof PublicIdentityIntegrityReport)[] = [
      "usersMissingProfile",
      "usersMissingCurrentHandle",
      "duplicateCurrentHandles",
      "usersWithMultipleCurrentHandles",
      "profilesWithoutMatchingCurrentHandle",
      "currentHandlesWithoutMatchingProfile",
      "unresolvedIdentityPolicyReviews",
      "legacyPersonMentionsPendingReview",
    ];

    expect(publicIdentityIntegrityReady(report())).toBe(true);
    for (const blocker of blockers) {
      expect(publicIdentityIntegrityReady(report({ [blocker]: 1 }))).toBe(
        false,
      );
    }
  });

  it("proves a real transactional mutation was rolled back to identical aggregates", async () => {
    const store = new StatefulMigrationStore();
    store.currentReport = report();
    store.provisionCandidates = [];
    store.handleCandidates = [];
    store.profileCandidates = [];
    store.displayCandidates = [];

    store.withTransaction = async <T>(
      callback: (transactionStore: PublicIdentityMigrationStore) => Promise<T>,
    ) => {
      const snapshot = structuredClone(store.currentReport);
      try {
        return await callback(store);
      } catch (error) {
        store.currentReport = snapshot;
        throw error;
      }
    };

    const proof = await provePublicIdentityMigrationRollback(store);

    expect(proof.transactionalMutationObserved).toBe(true);
    expect(proof.aggregateStateUnchanged).toBe(true);
    expect(proof.after).toEqual(proof.before);
  });
});
