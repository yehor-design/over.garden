import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, JsonValue } from "@/db/schema";
import {
  REGISTRY_DECISION_ACTIONS,
  type RegistryDecisionAction,
  type StableRegistryExceptionGroupSummary,
  type StableRegistryReleaseCenterReadModel,
  type StableRegistryReleaseSummary,
} from "@/lib/stable-registry/decision-actions";
import { buildEnqueueCatalogTypeaheadReindexJobQuery } from "@/server/catalog-repository";
import type { RequestScope } from "@/server/request-scope";

import {
  FOUNDATION_POLICY_VERSION,
  foundationBuildDigest,
  foundationPreviewDigest,
  stableRegistryDigest,
} from "./foundation-builder";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const STABLE_REGISTRY_FOUNDATION_BUILD_KIND =
  "stable_registry_foundation_build" as const;
export const STABLE_REGISTRY_FOUNDATION_BUILD_QUEUE = "matching" as const;
export const STABLE_REGISTRY_INTERACTIVE_DEADLINE_MS = 1000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export { REGISTRY_DECISION_ACTIONS };
export type {
  RegistryDecisionAction,
  StableRegistryExceptionGroupSummary,
  StableRegistryReleaseCenterReadModel,
  StableRegistryReleaseSummary,
};
export type RegistryActionOutcome =
  | "accepted"
  | "stale"
  | "blocked"
  | "forbidden"
  | "not_found";

export interface FoundationDraftResult {
  outcome: Extract<RegistryActionOutcome, "accepted" | "blocked" | "not_found">;
  release: StableRegistryReleaseSummary | null;
  replayed: boolean;
}

export interface RegistryDecisionResult {
  outcome: RegistryActionOutcome;
  group: StableRegistryExceptionGroupSummary | null;
}

export interface RegistryPreviewResult {
  outcome: RegistryActionOutcome;
  release: StableRegistryReleaseSummary | null;
}

export interface RegistryActivationResult {
  outcome: RegistryActionOutcome;
  release: StableRegistryReleaseSummary | null;
  searchProjection: "queued" | "not_applicable";
}

type ReleaseRow = StableRegistryReleaseSummary;

interface GroupRow extends StableRegistryExceptionGroupSummary {
  releaseId: string;
}

/**
 * Creates or replays the one Foundation build for a capture+policy pair. The
 * request stores only an opaque release UUID in the worker queue.
 */
export async function createFoundationDraft(
  scope: RequestScope,
  input: { captureId?: string; writesEnabled: boolean },
  database: Kysely<Database> = db,
): Promise<FoundationDraftResult> {
  if (!input.writesEnabled) {
    return { outcome: "blocked", release: null, replayed: false };
  }

  const captureId = input.captureId ? normalizeUuid(input.captureId) : null;
  if (input.captureId && !captureId) {
    return { outcome: "not_found", release: null, replayed: false };
  }

  return database.transaction().execute(async (trx) => {
    await setInteractiveDeadline(trx);
    const capture = await readCompletedCapture(trx, captureId);
    if (!capture)
      return { outcome: "not_found", release: null, replayed: false };

    const existing = await readFoundationReleaseByCapture(
      trx,
      capture.id,
      FOUNDATION_POLICY_VERSION,
    );
    if (existing) {
      return { outcome: "accepted", release: existing, replayed: true };
    }

    const buildDigest = foundationBuildDigest({
      captureId: capture.id,
      captureManifestSha256: capture.manifestSha256,
    });
    const createdResult = await buildInsertFoundationReleaseQuery(trx, {
      captureId: capture.id,
      sourceSnapshotId: capture.sourceSnapshotId,
      createdByUserId: requireUuid(scope.userId, "owner"),
      buildDigest,
    }).execute();
    const created = createdResult[0];
    if (!created) {
      const concurrentRelease = await readFoundationReleaseByCapture(
        trx,
        capture.id,
        FOUNDATION_POLICY_VERSION,
      );
      if (!concurrentRelease) {
        throw new Error("Foundation release conflict returned no receipt.");
      }
      return {
        outcome: "accepted",
        release: concurrentRelease,
        replayed: true,
      };
    }

    await buildEnqueueFoundationBuildJobQuery(
      trx,
      created.id,
    ).executeTakeFirst();
    const release = await readFoundationRelease(trx, created.id);
    if (!release) throw new Error("Foundation release was not persisted.");
    return { outcome: "accepted", release, replayed: false };
  });
}

export async function readStableRegistryReleaseCenter(
  input: { writesEnabled: boolean },
  executor: QueryExecutor = db,
): Promise<StableRegistryReleaseCenterReadModel> {
  const latestRelease = await readLatestFoundationRelease(executor);
  const exceptionGroups = latestRelease
    ? await readFoundationExceptionGroups(executor, latestRelease.id)
    : [];
  const captures = await sql<{ count: number }>`
    select count(*)::int as count
    from catalog_source_capture_runs
    where state = 'completed'
  `.execute(executor);

  return {
    latestRelease,
    exceptionGroups,
    completedCaptureCount: Number(captures.rows[0]?.count ?? 0),
    writesEnabled: input.writesEnabled,
  };
}

export async function decideFoundationExceptionGroup(
  scope: RequestScope,
  input: {
    releaseId: string;
    groupId: string;
    expectedVersion: number;
    action: RegistryDecisionAction;
    writesEnabled: boolean;
  },
  database: Kysely<Database> = db,
): Promise<RegistryDecisionResult> {
  if (!input.writesEnabled) return { outcome: "blocked", group: null };
  if (!REGISTRY_DECISION_ACTIONS.includes(input.action)) {
    return { outcome: "not_found", group: null };
  }
  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 1
  ) {
    return { outcome: "stale", group: null };
  }
  const releaseId = normalizeUuid(input.releaseId);
  const groupId = normalizeUuid(input.groupId);
  if (!releaseId || !groupId) return { outcome: "not_found", group: null };

  return database.transaction().execute(async (trx) => {
    await setInteractiveDeadline(trx);
    const group = await readFoundationExceptionGroupForUpdate(
      trx,
      releaseId,
      groupId,
    );
    if (!group) return { outcome: "not_found", group: null };
    if (group.expectedVersion !== input.expectedVersion) {
      return { outcome: "stale", group: toGroupSummary(group) };
    }
    const release = await readFoundationReleaseForUpdate(trx, releaseId);
    if (!release) return { outcome: "not_found", group: null };
    if (release.state !== "review_ready") {
      return { outcome: "blocked", group: toGroupSummary(group) };
    }

    const nextState = decisionStateForAction(input.action);
    const decisionDigest = stableRegistryDigest({
      releaseId,
      groupId,
      expectedVersion: input.expectedVersion,
      action: input.action,
    });
    const updated = await sql<GroupRow>`
      update catalog_registry_exception_groups
      set state = ${nextState},
          expected_version = expected_version + 1,
          updated_at = now()
      where id = ${groupId}::uuid
        and release_id = ${releaseId}::uuid
        and expected_version = ${input.expectedVersion}
      returning
        id,
        release_id as "releaseId",
        reason_class as "reasonClass",
        state,
        member_count as "memberCount",
        expected_version as "expectedVersion"
    `.execute(trx);
    const row = updated.rows[0];
    if (!row) return { outcome: "stale", group: toGroupSummary(group) };

    await sql`
      insert into catalog_registry_decisions (
        release_id,
        exception_group_id,
        action,
        expected_version,
        decision_digest,
        decided_by_user_id
      ) values (
        ${releaseId}::uuid,
        ${groupId}::uuid,
        ${input.action},
        ${input.expectedVersion},
        ${decisionDigest},
        ${requireUuid(scope.userId, "owner")}::uuid
      )
    `.execute(trx);

    return { outcome: "accepted", group: toGroupSummary(row) };
  });
}

export async function approveFoundationPreview(
  scope: RequestScope,
  input: { releaseId: string; writesEnabled: boolean },
  database: Kysely<Database> = db,
): Promise<RegistryPreviewResult> {
  if (!input.writesEnabled) return { outcome: "blocked", release: null };
  const releaseId = normalizeUuid(input.releaseId);
  if (!releaseId) return { outcome: "not_found", release: null };

  return database.transaction().execute(async (trx) => {
    await setInteractiveDeadline(trx);
    const release = await readFoundationReleaseForUpdate(trx, releaseId);
    if (!release) return { outcome: "not_found", release: null };
    if (release.state === "approved" || release.state === "active") {
      return { outcome: "accepted", release };
    }
    if (release.state !== "review_ready") {
      return { outcome: "blocked", release };
    }

    const blocking = await sql<{ count: number }>`
      select count(*)::int as count
      from catalog_registry_exception_groups
      where release_id = ${releaseId}::uuid
        and state in ('open', 'blocked')
    `.execute(trx);
    if (Number(blocking.rows[0]?.count ?? 0) > 0) {
      return { outcome: "blocked", release };
    }

    const digests = await readReleasePreviewInputs(trx, releaseId);
    const previewDigest = foundationPreviewDigest({
      releaseId,
      buildDigest: release.buildDigest,
      membershipDigest: digests.membershipDigest,
      decisionDigest: digests.decisionDigest,
    });
    await sql`
      update catalog_registry_releases
      set state = 'approved',
          preview_digest = ${previewDigest},
          approved_by_user_id = ${requireUuid(scope.userId, "owner")}::uuid,
          approved_at = now(),
          version = version + 1,
          updated_at = now()
      where id = ${releaseId}::uuid
        and state = 'review_ready'
    `.execute(trx);
    return {
      outcome: "accepted",
      release: await requireFoundationRelease(trx, releaseId),
    };
  });
}

/**
 * Activates a release only in the explicitly enabled environment. It records a
 * durable derived-search intent but deliberately reports only `queued`: OVE-256
 * and OVE-257 own public discovery and picker parity, respectively.
 */
export async function activateFoundationRelease(
  scope: RequestScope,
  input: {
    releaseId: string;
    previewDigest: string;
    writesEnabled: boolean;
  },
  database: Kysely<Database> = db,
): Promise<RegistryActivationResult> {
  if (!input.writesEnabled) {
    return {
      outcome: "blocked",
      release: null,
      searchProjection: "not_applicable",
    };
  }
  if (!SHA256_PATTERN.test(input.previewDigest)) {
    return {
      outcome: "stale",
      release: null,
      searchProjection: "not_applicable",
    };
  }
  const releaseId = normalizeUuid(input.releaseId);
  if (!releaseId) {
    return {
      outcome: "not_found",
      release: null,
      searchProjection: "not_applicable",
    };
  }

  return database.transaction().execute(async (trx) => {
    await setInteractiveDeadline(trx);
    await sql`
      insert into catalog_registry_active_pointers (release_family, active_release_id)
      values ('foundation', null)
      on conflict (release_family) do nothing
    `.execute(trx);
    const pointer = await sql<{ activeReleaseId: string | null }>`
      select active_release_id as "activeReleaseId"
      from catalog_registry_active_pointers
      where release_family = 'foundation'
      for update
    `.execute(trx);
    const release = await readFoundationReleaseForUpdate(trx, releaseId);
    if (!release) {
      return {
        outcome: "not_found",
        release: null,
        searchProjection: "not_applicable",
      };
    }
    if (
      release.state === "active" &&
      pointer.rows[0]?.activeReleaseId === releaseId
    ) {
      return { outcome: "accepted", release, searchProjection: "queued" };
    }
    if (
      release.state !== "approved" ||
      release.previewDigest !== input.previewDigest
    ) {
      return { outcome: "stale", release, searchProjection: "not_applicable" };
    }

    const blocking = await sql<{ count: number }>`
      select count(*)::int as count
      from catalog_registry_exception_groups
      where release_id = ${releaseId}::uuid
        and state in ('open', 'blocked')
    `.execute(trx);
    if (Number(blocking.rows[0]?.count ?? 0) > 0) {
      return {
        outcome: "blocked",
        release,
        searchProjection: "not_applicable",
      };
    }

    const priorReleaseId = pointer.rows[0]?.activeReleaseId ?? null;
    if (priorReleaseId && priorReleaseId !== releaseId) {
      await sql`
        update catalog_registry_releases
        set state = 'retired', retired_at = now(), version = version + 1, updated_at = now()
        where id = ${priorReleaseId}::uuid
          and state = 'active'
      `.execute(trx);
    }

    const activationDigest = stableRegistryDigest({
      releaseId,
      priorReleaseId,
      previewDigest: input.previewDigest,
    });
    await sql`
      update catalog_registry_releases
      set state = 'active',
          activated_by_user_id = ${requireUuid(scope.userId, "owner")}::uuid,
          activated_at = now(),
          version = version + 1,
          updated_at = now()
      where id = ${releaseId}::uuid
        and state = 'approved'
    `.execute(trx);
    await sql`
      update catalog_registry_active_pointers
      set active_release_id = ${releaseId}::uuid,
          version = version + 1,
          updated_at = now()
      where release_family = 'foundation'
    `.execute(trx);
    await sql`
      insert into catalog_registry_activations (
        release_id, prior_release_id, activation_digest, activated_by_user_id
      ) values (
        ${releaseId}::uuid,
        ${priorReleaseId}::uuid,
        ${activationDigest},
        ${requireUuid(scope.userId, "owner")}::uuid
      )
      on conflict (release_id) do nothing
    `.execute(trx);
    await sql`
      insert into catalog_registry_search_outbox (
        release_id, desired_state, state, intent_digest
      ) values (
        ${releaseId}::uuid,
        'present',
        'pending',
        ${stableRegistryDigest({ releaseId, desiredState: "present", activationDigest })}
      )
      on conflict (release_id) do nothing
    `.execute(trx);
    await buildEnqueueCatalogTypeaheadReindexJobQuery(trx).executeTakeFirst();

    return {
      outcome: "accepted",
      release: await requireFoundationRelease(trx, releaseId),
      searchProjection: "queued",
    };
  });
}

/**
 * Stops a non-terminal draft without deleting its audit history. A later
 * Foundation run gets a distinct release receipt; it never mutates this one.
 */
export async function abandonFoundationRelease(
  _scope: RequestScope,
  input: { releaseId: string; writesEnabled: boolean },
  database: Kysely<Database> = db,
): Promise<RegistryPreviewResult> {
  if (!input.writesEnabled) return { outcome: "blocked", release: null };
  const releaseId = normalizeUuid(input.releaseId);
  if (!releaseId) return { outcome: "not_found", release: null };

  return database.transaction().execute(async (trx) => {
    await setInteractiveDeadline(trx);
    const release = await readFoundationReleaseForUpdate(trx, releaseId);
    if (!release) return { outcome: "not_found", release: null };
    if (release.state === "abandoned") {
      return { outcome: "accepted", release };
    }
    if (
      release.state !== "draft" &&
      release.state !== "building" &&
      release.state !== "review_ready"
    ) {
      return { outcome: "blocked", release };
    }

    await sql`
      update catalog_registry_releases
      set state = 'abandoned',
          version = version + 1,
          updated_at = now()
      where id = ${releaseId}::uuid
        and state in ('draft', 'building', 'review_ready')
    `.execute(trx);

    await sql`
      update job_queue
      set status = 'dead',
          locked_at = null,
          locked_by = null,
          rerun_requested = false,
          last_error = 'abandoned_by_owner',
          terminal_error_code = null,
          terminalized_at = now(),
          updated_at = now()
      where idempotency_key = ${`stable-registry-foundation-build:${releaseId}`}
        and status in ('pending', 'processing', 'failed')
    `.execute(trx);

    return {
      outcome: "accepted",
      release: await requireFoundationRelease(trx, releaseId),
    };
  });
}

export function buildInsertFoundationReleaseQuery(
  executor: QueryExecutor,
  input: {
    captureId: string;
    sourceSnapshotId: string;
    createdByUserId: string;
    buildDigest: string;
  },
) {
  return executor
    .insertInto("catalog_registry_releases")
    .values({
      release_kind: "foundation",
      state: "draft",
      capture_id: input.captureId,
      source_snapshot_id: input.sourceSnapshotId,
      policy_version: FOUNDATION_POLICY_VERSION,
      build_digest: input.buildDigest,
      safe_summary: { policyVersion: FOUNDATION_POLICY_VERSION },
      created_by_user_id: input.createdByUserId,
    })
    .onConflict((conflict) => conflict.doNothing())
    .returning("id");
}

export function buildEnqueueFoundationBuildJobQuery(
  executor: QueryExecutor,
  releaseId: string,
) {
  const payload = {
    kind: STABLE_REGISTRY_FOUNDATION_BUILD_KIND,
    releaseId,
  } satisfies JsonValue;
  return executor
    .insertInto("job_queue")
    .values({
      queue_name: STABLE_REGISTRY_FOUNDATION_BUILD_QUEUE,
      payload,
      idempotency_key: `stable-registry-foundation-build:${releaseId}`,
    })
    .onConflict((conflict) =>
      conflict
        .column("idempotency_key")
        .where("idempotency_key", "is not", null)
        .doUpdateSet({
          status: sql<string>`case when job_queue.status = 'processing' then job_queue.status else 'pending' end`,
          available_at: new Date(),
          rerun_requested: sql<boolean>`(job_queue.status = 'processing')`,
          locked_at: sql<Date | null>`case when job_queue.status = 'processing' then job_queue.locked_at else null end`,
          locked_by: sql<
            string | null
          >`case when job_queue.status = 'processing' then job_queue.locked_by else null end`,
          last_error: null,
          updated_at: new Date(),
        }),
    )
    .returning("id");
}

async function readCompletedCapture(
  executor: QueryExecutor,
  captureId: string | null,
): Promise<{
  id: string;
  sourceSnapshotId: string;
  manifestSha256: string;
} | null> {
  const result = await sql<{
    id: string;
    sourceSnapshotId: string | null;
    manifestSha256: string | null;
  }>`
    select id, source_snapshot_id as "sourceSnapshotId", manifest_sha256 as "manifestSha256"
    from catalog_source_capture_runs
    where state = 'completed'
      and (${captureId}::uuid is null or id = ${captureId}::uuid)
    order by observed_ended_at desc
    limit 1
  `.execute(executor);
  const row = result.rows[0];
  if (
    !row?.sourceSnapshotId ||
    !row.manifestSha256 ||
    !SHA256_PATTERN.test(row.manifestSha256)
  ) {
    return null;
  }
  return {
    id: row.id,
    sourceSnapshotId: row.sourceSnapshotId,
    manifestSha256: row.manifestSha256,
  };
}

async function readFoundationReleaseByCapture(
  executor: QueryExecutor,
  captureId: string,
  policyVersion: string,
): Promise<StableRegistryReleaseSummary | null> {
  const result = await sql<{ id: string }>`
    select id
    from catalog_registry_releases
    where release_kind = 'foundation'
      and capture_id = ${captureId}::uuid
      and policy_version = ${policyVersion}
      and state not in ('failed', 'abandoned')
    order by created_at desc
    limit 1
  `.execute(executor);
  return result.rows[0]
    ? readFoundationRelease(executor, result.rows[0].id)
    : null;
}

async function readLatestFoundationRelease(
  executor: QueryExecutor,
): Promise<StableRegistryReleaseSummary | null> {
  const result = await sql<{ id: string }>`
    select id
    from catalog_registry_releases
    where release_kind = 'foundation'
    order by created_at desc
    limit 1
  `.execute(executor);
  return result.rows[0]
    ? readFoundationRelease(executor, result.rows[0].id)
    : null;
}

async function readFoundationRelease(
  executor: QueryExecutor,
  releaseId: string,
): Promise<StableRegistryReleaseSummary | null> {
  const result = await sql<ReleaseRow>`
    select
      releases.id,
      releases.state,
      releases.capture_id as "captureId",
      releases.policy_version as "policyVersion",
      releases.build_digest as "buildDigest",
      releases.preview_digest as "previewDigest",
      releases.version,
      releases.created_at as "createdAt",
      releases.review_ready_at as "reviewReadyAt",
      releases.approved_at as "approvedAt",
      releases.activated_at as "activatedAt",
      count(distinct members.id)::int as "memberCount",
      count(distinct members.id) filter (where members.eligibility = 'product_eligible')::int as "eligibleMemberCount",
      count(distinct groups.id) filter (where groups.state = 'open')::int as "openGroupCount",
      count(distinct groups.id) filter (where groups.state = 'blocked')::int as "blockingGroupCount"
    from catalog_registry_releases releases
    left join catalog_registry_release_members members on members.release_id = releases.id
    left join catalog_registry_exception_groups groups on groups.release_id = releases.id
    where releases.id = ${releaseId}::uuid
      and releases.release_kind = 'foundation'
    group by releases.id
  `.execute(executor);
  return result.rows[0] ?? null;
}

async function readFoundationReleaseForUpdate(
  executor: QueryExecutor,
  releaseId: string,
): Promise<StableRegistryReleaseSummary | null> {
  const result = await sql<{ id: string }>`
    select id
    from catalog_registry_releases
    where id = ${releaseId}::uuid
      and release_kind = 'foundation'
    for update
  `.execute(executor);
  return result.rows[0] ? readFoundationRelease(executor, releaseId) : null;
}

async function readFoundationExceptionGroups(
  executor: QueryExecutor,
  releaseId: string,
): Promise<StableRegistryExceptionGroupSummary[]> {
  const result = await sql<GroupRow>`
    select
      id,
      release_id as "releaseId",
      reason_class as "reasonClass",
      state,
      member_count as "memberCount",
      expected_version as "expectedVersion"
    from catalog_registry_exception_groups
    where release_id = ${releaseId}::uuid
    order by reason_class asc
  `.execute(executor);
  return result.rows.map(toGroupSummary);
}

async function readFoundationExceptionGroupForUpdate(
  executor: QueryExecutor,
  releaseId: string,
  groupId: string,
): Promise<GroupRow | null> {
  const result = await sql<GroupRow>`
    select
      id,
      release_id as "releaseId",
      reason_class as "reasonClass",
      state,
      member_count as "memberCount",
      expected_version as "expectedVersion"
    from catalog_registry_exception_groups
    where id = ${groupId}::uuid
      and release_id = ${releaseId}::uuid
    for update
  `.execute(executor);
  return result.rows[0] ?? null;
}

async function readReleasePreviewInputs(
  executor: QueryExecutor,
  releaseId: string,
): Promise<{ membershipDigest: string; decisionDigest: string }> {
  const result = await sql<{
    membershipDigest: string;
    decisionDigest: string;
  }>`
    select
      encode(digest(convert_to(coalesce(string_agg(membership_digest, ',' order by membership_digest), ''), 'utf8'), 'sha256'), 'hex') as "membershipDigest",
      (
        select encode(digest(convert_to(coalesce(string_agg(decision_digest, ',' order by decision_digest), ''), 'utf8'), 'sha256'), 'hex')
        from catalog_registry_decisions
        where release_id = ${releaseId}::uuid
      ) as "decisionDigest"
    from catalog_registry_release_members
    where release_id = ${releaseId}::uuid
  `.execute(executor);
  const row = result.rows[0];
  if (
    !row ||
    !SHA256_PATTERN.test(row.membershipDigest) ||
    !SHA256_PATTERN.test(row.decisionDigest)
  ) {
    throw new Error("Foundation preview digest inputs are invalid.");
  }
  return row;
}

async function requireFoundationRelease(
  executor: QueryExecutor,
  releaseId: string,
): Promise<StableRegistryReleaseSummary> {
  const release = await readFoundationRelease(executor, releaseId);
  if (!release) throw new Error("Foundation release was not found.");
  return release;
}

function decisionStateForAction(
  action: RegistryDecisionAction,
): "decided" | "deferred" | "blocked" {
  if (action === "block_rule") return "blocked";
  if (action === "defer" || action === "keep_current") return "deferred";
  return "decided";
}

function toGroupSummary(row: GroupRow): StableRegistryExceptionGroupSummary {
  return {
    id: row.id,
    reasonClass: row.reasonClass,
    state: row.state,
    memberCount: Number(row.memberCount),
    expectedVersion: Number(row.expectedVersion),
  };
}

function normalizeUuid(value: string): string | null {
  return UUID_PATTERN.test(value) ? value : null;
}

function requireUuid(value: string, label: string): string {
  const normalized = normalizeUuid(value);
  if (!normalized) throw new Error(`Invalid ${label} identifier.`);
  return normalized;
}

async function setInteractiveDeadline(executor: QueryExecutor) {
  await sql`
    select set_config(
      'statement_timeout',
      ${`${STABLE_REGISTRY_INTERACTIVE_DEADLINE_MS}ms`},
      true
    )
  `.execute(executor);
}
