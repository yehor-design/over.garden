import "server-only";

import { randomUUID } from "node:crypto";

import { type Kysely, sql } from "kysely";

import type { Database } from "@/db/types";
import {
  evaluatePublicIdentity,
  IDENTITY_POLICY_VERSION,
  isTrustedGeneratedHandle,
  parsePublicHandleSyntax,
} from "@/server/identity-policy";
import { ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID } from "@/server/system-actors";

export const PUBLIC_IDENTITY_INTEGRITY_SCHEMA =
  "ove203.public-identity-integrity.v1";

export interface PublicIdentityIntegrityReport {
  schema: typeof PUBLIC_IDENTITY_INTEGRITY_SCHEMA;
  policyVersion: string;
  totalUsers: number;
  publicProfiles: number;
  currentHandleClaims: number;
  retiredHandleClaims: number;
  usersMissingProfile: number;
  usersMissingCurrentHandle: number;
  duplicateCurrentHandles: number;
  usersWithMultipleCurrentHandles: number;
  profilesWithoutMatchingCurrentHandle: number;
  currentHandlesWithoutMatchingProfile: number;
  handleClaimsPendingPolicyReview: number;
  profilesPendingHandlePolicyReview: number;
  displayNamesPendingPolicyReview: number;
  unresolvedIdentityPolicyReviews: number;
  legacyPersonMentionsPendingReview: number;
}

export interface PublicIdentityApplyResult {
  schema: typeof PUBLIC_IDENTITY_INTEGRITY_SCHEMA;
  policyVersion: string;
  before: PublicIdentityIntegrityReport;
  after: PublicIdentityIntegrityReport;
  usersProvisionedOrReconciled: number;
  handleClaimsReviewed: number;
  profileHandlesReviewed: number;
  displayNamesReviewed: number;
  ready: boolean;
}

export interface PublicIdentityRollbackProof {
  schema: typeof PUBLIC_IDENTITY_INTEGRITY_SCHEMA;
  policyVersion: string;
  before: PublicIdentityIntegrityReport;
  after: PublicIdentityIntegrityReport;
  transactionalMutationObserved: boolean;
  aggregateStateUnchanged: boolean;
}

interface PublicIdentityIntegrityRow {
  total_users: unknown;
  public_profiles: unknown;
  current_handle_claims: unknown;
  retired_handle_claims: unknown;
  users_missing_profile: unknown;
  users_missing_current_handle: unknown;
  duplicate_current_handles: unknown;
  users_with_multiple_current_handles: unknown;
  profiles_without_matching_current_handle: unknown;
  current_handles_without_matching_profile: unknown;
  handle_claims_pending_policy_review: unknown;
  profiles_pending_handle_policy_review: unknown;
  display_names_pending_policy_review: unknown;
  legacy_person_mentions_pending_review: unknown;
}

export interface PublicIdentityProvisionCandidate {
  userId: string;
}

export interface PublicIdentityHandleReviewCandidate {
  normalizedHandle: string;
  lifecycleState: string;
  claimSource: string;
}

export interface PublicIdentityProfileHandleReviewCandidate {
  userId: string;
  handle: string;
  normalizedHandle: string;
  claimSource: string;
}

export interface PublicIdentityDisplayNameReviewCandidate {
  userId: string;
  displayName: string;
}

/**
 * Storage boundary used by the migration orchestrator. Candidate values stay
 * inside this server process and are never included in any public result.
 */
export interface PublicIdentityMigrationStore {
  collectReport(): Promise<PublicIdentityIntegrityReport>;
  withTransaction<T>(
    callback: (store: PublicIdentityMigrationStore) => Promise<T>,
  ): Promise<T>;
  listProvisionCandidates(): Promise<
    readonly PublicIdentityProvisionCandidate[]
  >;
  provisionUser(userId: string): Promise<void>;
  listHandleReviewCandidates(): Promise<
    readonly PublicIdentityHandleReviewCandidate[]
  >;
  markHandleReviewed(
    candidate: PublicIdentityHandleReviewCandidate,
  ): Promise<boolean>;
  listProfileHandleReviewCandidates(): Promise<
    readonly PublicIdentityProfileHandleReviewCandidate[]
  >;
  markProfileHandleReviewed(userId: string): Promise<boolean>;
  listDisplayNameReviewCandidates(): Promise<
    readonly PublicIdentityDisplayNameReviewCandidate[]
  >;
  markDisplayNameReviewed(userId: string): Promise<boolean>;
  insertRollbackProbe(): Promise<void>;
}

export function buildPublicIdentityIntegrityReportQuery() {
  return sql<PublicIdentityIntegrityRow>`
    select
      (
        select count(*) from "user"
        where id <> ${ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID}::uuid
      ) as total_users,
      (select count(*) from user_public_profiles) as public_profiles,
      (
        select count(*)
        from user_handle_registry
        where lifecycle_state = 'current'
      ) as current_handle_claims,
      (
        select count(*)
        from user_handle_registry
        where lifecycle_state = 'retired'
      ) as retired_handle_claims,
      (
        select count(*)
        from "user" auth_user
        where auth_user.id <> ${ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID}::uuid
          and not exists (
          select 1
          from user_public_profiles profile
          where profile.user_id = auth_user.id
        )
      ) as users_missing_profile,
      (
        select count(*)
        from "user" auth_user
        where auth_user.id <> ${ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID}::uuid
          and not exists (
          select 1
          from user_handle_registry registry
          where registry.user_id = auth_user.id
            and registry.lifecycle_state = 'current'
        )
      ) as users_missing_current_handle,
      (
        select count(*)
        from (
          select registry.normalized_handle
          from user_handle_registry registry
          where registry.lifecycle_state = 'current'
          group by registry.normalized_handle
          having count(*) > 1
        ) duplicate_handle_groups
      ) as duplicate_current_handles,
      (
        select count(*)
        from (
          select registry.user_id
          from user_handle_registry registry
          where registry.lifecycle_state = 'current'
          group by registry.user_id
          having count(*) > 1
        ) duplicate_user_groups
      ) as users_with_multiple_current_handles,
      (
        select count(*)
        from user_public_profiles profile
        where not exists (
          select 1
          from user_handle_registry registry
          where registry.user_id = profile.user_id
            and registry.normalized_handle = profile.normalized_handle
            and registry.lifecycle_state = 'current'
        )
      ) as profiles_without_matching_current_handle,
      (
        select count(*)
        from user_handle_registry registry
        where registry.lifecycle_state = 'current'
          and not exists (
            select 1
            from user_public_profiles profile
            where profile.user_id = registry.user_id
              and profile.normalized_handle = registry.normalized_handle
          )
      ) as current_handles_without_matching_profile,
      (
        select count(*)
        from user_handle_registry registry
        where registry.policy_version <> ${IDENTITY_POLICY_VERSION}
      ) as handle_claims_pending_policy_review,
      (
        select count(*)
        from user_public_profiles profile
        where profile.identity_policy_version <> ${IDENTITY_POLICY_VERSION}
      ) as profiles_pending_handle_policy_review,
      (
        select count(*)
        from user_public_profiles profile
        where profile.display_name is not null
          and profile.display_name_policy_version is distinct from ${IDENTITY_POLICY_VERSION}
      ) as display_names_pending_policy_review,
      (
        select count(*)
        from lineage_provenance_edges edge
        where edge.source_kind = 'source_reference'
          and edge.source_reference_kind = 'person'
          and edge.source_owner_user_id is null
          and lower(btrim(edge.source_reference_label))
            ~ '^handle [a-z0-9][a-z0-9_]{2,29}$'
      ) as legacy_person_mentions_pending_review
  `;
}

export function buildPublicIdentityProvisionCandidatesQuery(
  db: Kysely<Database>,
) {
  return db
    .selectFrom("user as auth_user")
    .select("auth_user.id as userId")
    .where("auth_user.id", "!=", ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID)
    .where(
      sql<boolean>`
        not exists (
          select 1
          from user_public_profiles profile
          where profile.user_id = auth_user.id
        )
        or not exists (
          select 1
          from user_handle_registry registry
          where registry.user_id = auth_user.id
            and registry.lifecycle_state = 'current'
        )
      `,
    )
    .orderBy("auth_user.id", "asc")
    .forUpdate();
}

export function publicIdentityIntegrityReady(
  report: PublicIdentityIntegrityReport,
): boolean {
  return (
    report.usersMissingProfile === 0 &&
    report.usersMissingCurrentHandle === 0 &&
    report.duplicateCurrentHandles === 0 &&
    report.usersWithMultipleCurrentHandles === 0 &&
    report.profilesWithoutMatchingCurrentHandle === 0 &&
    report.currentHandlesWithoutMatchingProfile === 0 &&
    report.unresolvedIdentityPolicyReviews === 0 &&
    report.legacyPersonMentionsPendingReview === 0
  );
}

export function createKyselyPublicIdentityMigrationStore(
  db: Kysely<Database>,
): PublicIdentityMigrationStore {
  return new KyselyPublicIdentityMigrationStore(db);
}

export async function applyPublicIdentityBackfill(
  store: PublicIdentityMigrationStore,
): Promise<PublicIdentityApplyResult> {
  const before = await store.collectReport();

  const result = await store.withTransaction(async (transactionStore) => {
    const provisionCandidates =
      await transactionStore.listProvisionCandidates();

    for (const candidate of provisionCandidates) {
      await transactionStore.provisionUser(candidate.userId);
    }

    let handleClaimsReviewed = 0;
    for (const candidate of await transactionStore.listHandleReviewCandidates()) {
      if (
        handleReviewPasses(candidate) &&
        (await transactionStore.markHandleReviewed(candidate))
      ) {
        handleClaimsReviewed += 1;
      }
    }

    let profileHandlesReviewed = 0;
    for (const candidate of await transactionStore.listProfileHandleReviewCandidates()) {
      if (
        profileHandleReviewPasses(candidate) &&
        (await transactionStore.markProfileHandleReviewed(candidate.userId))
      ) {
        profileHandlesReviewed += 1;
      }
    }

    let displayNamesReviewed = 0;
    for (const candidate of await transactionStore.listDisplayNameReviewCandidates()) {
      const evaluation = evaluatePublicIdentity({
        surface: "display_name",
        value: candidate.displayName,
      });
      if (
        evaluation.ok &&
        evaluation.value === candidate.displayName &&
        (await transactionStore.markDisplayNameReviewed(candidate.userId))
      ) {
        displayNamesReviewed += 1;
      }
    }

    return {
      after: await transactionStore.collectReport(),
      usersProvisionedOrReconciled: provisionCandidates.length,
      handleClaimsReviewed,
      profileHandlesReviewed,
      displayNamesReviewed,
    };
  });

  return {
    schema: PUBLIC_IDENTITY_INTEGRITY_SCHEMA,
    policyVersion: IDENTITY_POLICY_VERSION,
    before,
    ...result,
    ready: publicIdentityIntegrityReady(result.after),
  };
}

export async function provePublicIdentityMigrationRollback(
  store: PublicIdentityMigrationStore,
): Promise<PublicIdentityRollbackProof> {
  const before = await store.collectReport();
  let transactionalMutationObserved = false;

  try {
    await store.withTransaction(async (transactionStore) => {
      await transactionStore.insertRollbackProbe();
      const during = await transactionStore.collectReport();
      transactionalMutationObserved = rollbackProbeWasProvisioned(
        before,
        during,
      );

      if (!transactionalMutationObserved) {
        throw new PublicIdentityRollbackProofFailure();
      }

      throw new PublicIdentityRollbackSentinel();
    });
  } catch (error) {
    if (!(error instanceof PublicIdentityRollbackSentinel)) {
      throw new PublicIdentityRollbackProofFailure();
    }
  }

  const after = await store.collectReport();
  const aggregateStateUnchanged = reportsEqual(before, after);

  if (!transactionalMutationObserved || !aggregateStateUnchanged) {
    throw new PublicIdentityRollbackProofFailure();
  }

  return {
    schema: PUBLIC_IDENTITY_INTEGRITY_SCHEMA,
    policyVersion: IDENTITY_POLICY_VERSION,
    before,
    after,
    transactionalMutationObserved,
    aggregateStateUnchanged,
  };
}

function handleReviewPasses(
  candidate: PublicIdentityHandleReviewCandidate,
): boolean {
  if (candidate.claimSource === "generated") {
    return isTrustedGeneratedHandle(candidate.normalizedHandle);
  }

  if (candidate.claimSource === "legacy_generated") {
    return parsePublicHandleSyntax(candidate.normalizedHandle).ok;
  }

  return evaluatePublicIdentity({
    surface: "handle",
    value: candidate.normalizedHandle,
  }).ok;
}

function profileHandleReviewPasses(
  candidate: PublicIdentityProfileHandleReviewCandidate,
): boolean {
  const parsed = parsePublicHandleSyntax(candidate.handle);

  if (!parsed.ok || parsed.normalizedHandle !== candidate.normalizedHandle) {
    return false;
  }

  return handleReviewPasses({
    normalizedHandle: candidate.normalizedHandle,
    lifecycleState: "current",
    claimSource: candidate.claimSource,
  });
}

function rollbackProbeWasProvisioned(
  before: PublicIdentityIntegrityReport,
  during: PublicIdentityIntegrityReport,
): boolean {
  const expected: PublicIdentityIntegrityReport = {
    ...before,
    totalUsers: before.totalUsers + 1,
    publicProfiles: before.publicProfiles + 1,
    currentHandleClaims: before.currentHandleClaims + 1,
  };

  return reportsEqual(expected, during);
}

function reportsEqual(
  left: PublicIdentityIntegrityReport,
  right: PublicIdentityIntegrityReport,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toCount(value: unknown): number {
  const parsed =
    typeof value === "bigint"
      ? Number(value)
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : value;

  if (
    typeof parsed !== "number" ||
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new Error("Public identity integrity count is invalid.");
  }

  return parsed;
}

function toIntegrityReport(
  row: PublicIdentityIntegrityRow | undefined,
): PublicIdentityIntegrityReport {
  if (!row) {
    throw new Error("Public identity integrity report is unavailable.");
  }

  const handleClaimsPendingPolicyReview = toCount(
    row.handle_claims_pending_policy_review,
  );
  const profilesPendingHandlePolicyReview = toCount(
    row.profiles_pending_handle_policy_review,
  );
  const displayNamesPendingPolicyReview = toCount(
    row.display_names_pending_policy_review,
  );

  return {
    schema: PUBLIC_IDENTITY_INTEGRITY_SCHEMA,
    policyVersion: IDENTITY_POLICY_VERSION,
    totalUsers: toCount(row.total_users),
    publicProfiles: toCount(row.public_profiles),
    currentHandleClaims: toCount(row.current_handle_claims),
    retiredHandleClaims: toCount(row.retired_handle_claims),
    usersMissingProfile: toCount(row.users_missing_profile),
    usersMissingCurrentHandle: toCount(row.users_missing_current_handle),
    duplicateCurrentHandles: toCount(row.duplicate_current_handles),
    usersWithMultipleCurrentHandles: toCount(
      row.users_with_multiple_current_handles,
    ),
    profilesWithoutMatchingCurrentHandle: toCount(
      row.profiles_without_matching_current_handle,
    ),
    currentHandlesWithoutMatchingProfile: toCount(
      row.current_handles_without_matching_profile,
    ),
    handleClaimsPendingPolicyReview,
    profilesPendingHandlePolicyReview,
    displayNamesPendingPolicyReview,
    unresolvedIdentityPolicyReviews:
      handleClaimsPendingPolicyReview +
      profilesPendingHandlePolicyReview +
      displayNamesPendingPolicyReview,
    legacyPersonMentionsPendingReview: toCount(
      row.legacy_person_mentions_pending_review,
    ),
  };
}

class KyselyPublicIdentityMigrationStore implements PublicIdentityMigrationStore {
  constructor(private readonly db: Kysely<Database>) {}

  async collectReport(): Promise<PublicIdentityIntegrityReport> {
    const result = await buildPublicIdentityIntegrityReportQuery().execute(
      this.db,
    );

    return toIntegrityReport(result.rows[0]);
  }

  async withTransaction<T>(
    callback: (store: PublicIdentityMigrationStore) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute((transaction) =>
        callback(new KyselyPublicIdentityMigrationStore(transaction)),
      );
  }

  listProvisionCandidates(): Promise<
    readonly PublicIdentityProvisionCandidate[]
  > {
    return buildPublicIdentityProvisionCandidatesQuery(this.db).execute();
  }

  async provisionUser(userId: string): Promise<void> {
    await sql`select overgarden_provision_user_public_profile(${userId}::uuid)`.execute(
      this.db,
    );
  }

  listHandleReviewCandidates(): Promise<
    readonly PublicIdentityHandleReviewCandidate[]
  > {
    return this.db
      .selectFrom("user_handle_registry")
      .select([
        "normalized_handle as normalizedHandle",
        "lifecycle_state as lifecycleState",
        "claim_source as claimSource",
      ])
      .where("policy_version", "!=", IDENTITY_POLICY_VERSION)
      .orderBy("normalized_handle", "asc")
      .forUpdate()
      .execute();
  }

  async markHandleReviewed(
    candidate: PublicIdentityHandleReviewCandidate,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable("user_handle_registry")
      .set({ policy_version: IDENTITY_POLICY_VERSION })
      .where("normalized_handle", "=", candidate.normalizedHandle)
      .where("lifecycle_state", "=", candidate.lifecycleState)
      .where("claim_source", "=", candidate.claimSource)
      .where("policy_version", "!=", IDENTITY_POLICY_VERSION)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) === 1;
  }

  listProfileHandleReviewCandidates(): Promise<
    readonly PublicIdentityProfileHandleReviewCandidate[]
  > {
    return this.db
      .selectFrom("user_public_profiles as profile")
      .innerJoin("user_handle_registry as registry", (join) =>
        join
          .onRef("registry.user_id", "=", "profile.user_id")
          .onRef("registry.normalized_handle", "=", "profile.normalized_handle")
          .on("registry.lifecycle_state", "=", "current"),
      )
      .select([
        "profile.user_id as userId",
        "profile.handle as handle",
        "profile.normalized_handle as normalizedHandle",
        "registry.claim_source as claimSource",
      ])
      .where("profile.identity_policy_version", "!=", IDENTITY_POLICY_VERSION)
      .orderBy("profile.user_id", "asc")
      .forUpdate("profile")
      .execute();
  }

  async markProfileHandleReviewed(userId: string): Promise<boolean> {
    const result = await this.db
      .updateTable("user_public_profiles")
      .set({ identity_policy_version: IDENTITY_POLICY_VERSION })
      .where("user_id", "=", userId)
      .where("identity_policy_version", "!=", IDENTITY_POLICY_VERSION)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) === 1;
  }

  listDisplayNameReviewCandidates(): Promise<
    readonly PublicIdentityDisplayNameReviewCandidate[]
  > {
    return this.db
      .selectFrom("user_public_profiles")
      .select(["user_id as userId", "display_name as displayName"])
      .where("display_name", "is not", null)
      .where((expression) =>
        expression.or([
          expression("display_name_policy_version", "is", null),
          expression(
            "display_name_policy_version",
            "!=",
            IDENTITY_POLICY_VERSION,
          ),
        ]),
      )
      .orderBy("user_id", "asc")
      .forUpdate()
      .$narrowType<{ displayName: string }>()
      .execute();
  }

  async markDisplayNameReviewed(userId: string): Promise<boolean> {
    const result = await this.db
      .updateTable("user_public_profiles")
      .set({ display_name_policy_version: IDENTITY_POLICY_VERSION })
      .where("user_id", "=", userId)
      .where("display_name", "is not", null)
      .where((expression) =>
        expression.or([
          expression("display_name_policy_version", "is", null),
          expression(
            "display_name_policy_version",
            "!=",
            IDENTITY_POLICY_VERSION,
          ),
        ]),
      )
      .executeTakeFirst();

    return Number(result.numUpdatedRows) === 1;
  }

  async insertRollbackProbe(): Promise<void> {
    const probeId = randomUUID();

    await this.db
      .insertInto("user")
      .values({
        id: probeId,
        email: `ove203-rollback-proof-${probeId}@invalid.example`,
        emailVerified: false,
        image: null,
        name: "OverGarden",
      })
      .execute();
  }
}

class PublicIdentityRollbackSentinel extends Error {}
class PublicIdentityRollbackProofFailure extends Error {
  constructor() {
    super("Public identity rollback proof failed.");
  }
}
