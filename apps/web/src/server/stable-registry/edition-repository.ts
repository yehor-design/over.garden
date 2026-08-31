import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  EDITION_DECISION_ACTIONS,
  isEditionBlockingDiffClass,
  isEditionReviewableDiffClass,
  type EditionActivationReceiptSummary,
  type EditionCenterReadModel,
  type EditionDecisionAction,
  type EditionDiffClass,
  type EditionDiffGroupSummary,
  type EditionRelationKind,
  type EditionSummary,
  type EditionTransition,
} from "@/lib/stable-registry/edition-actions";
import { buildEnqueueCatalogTypeaheadReindexJobQuery } from "@/server/catalog-repository";
import type { RequestScope } from "@/server/request-scope";

import { stableRegistryDigest } from "./foundation-builder";
import { STABLE_REGISTRY_INTERACTIVE_DEADLINE_MS } from "./release-repository";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const STABLE_REGISTRY_EDITION_POLICY_VERSION =
  "ove258.edition.v1" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export { EDITION_DECISION_ACTIONS };
export type {
  EditionCenterReadModel,
  EditionDecisionAction,
  EditionDiffGroupSummary,
  EditionSummary,
};

export type EditionOutcome =
  | "accepted"
  | "stale"
  | "blocked"
  | "forbidden"
  | "not_found";

export interface EditionActionResult {
  outcome: EditionOutcome;
  edition: EditionSummary | null;
}

export interface EditionPointerResult extends EditionActionResult {
  transition: EditionTransition | null;
  searchProjection: "queued" | "not_applicable";
}

export async function readEditionCenter(
  input: { writesEnabled: boolean; releaseId?: string },
  database: Kysely<Database> = db,
): Promise<EditionCenterReadModel> {
  return database.transaction().execute(async (transaction) => {
    await setInteractiveDeadline(transaction);
    const activeReleaseId = await readActivePointer(transaction);
    const edition = input.releaseId
      ? await readEdition(transaction, normalizeUuid(input.releaseId) ?? "")
      : await readLatestEdition(transaction);

    return {
      edition,
      activeReleaseId,
      diffGroups: edition ? await readDiffGroups(transaction, edition.id) : [],
      activationHistory: await readActivationHistory(transaction),
      writesEnabled: input.writesEnabled,
    };
  });
}

/**
 * Records one closed decision against a diff group and, where the decision
 * names an identity relation, appends that relation.
 *
 * A decision never moves a garden object. Relations affect what a later edition
 * may recommend and what the UI displays; the stored `catalog_item_id` on an
 * object is untouched.
 */
export async function decideEditionDiffGroup(
  scope: RequestScope,
  input: {
    releaseId: string;
    groupId: string;
    action: EditionDecisionAction;
    expectedVersion: number;
    expectedAffectedObjectCount: number;
    fromCatalogItemId?: string;
    toCatalogItemId?: string;
    writesEnabled: boolean;
  },
  database: Kysely<Database> = db,
): Promise<EditionActionResult> {
  if (!input.writesEnabled) return { outcome: "blocked", edition: null };
  if (!EDITION_DECISION_ACTIONS.includes(input.action)) {
    return { outcome: "blocked", edition: null };
  }
  const releaseId = normalizeUuid(input.releaseId);
  const groupId = normalizeUuid(input.groupId);
  if (!releaseId || !groupId) return { outcome: "not_found", edition: null };

  return database.transaction().execute(async (transaction) => {
    await setInteractiveDeadline(transaction);
    const group = await readDiffGroupForUpdate(transaction, releaseId, groupId);
    if (!group) return { outcome: "not_found" as const, edition: null };

    const edition = await readEdition(transaction, releaseId);
    if (!edition) return { outcome: "not_found" as const, edition: null };
    if (group.expectedVersion !== input.expectedVersion) {
      return { outcome: "stale" as const, edition };
    }
    // A changed impact count means the owner is deciding against a preview that
    // no longer describes the blast radius.
    if (group.affectedObjectCount !== input.expectedAffectedObjectCount) {
      return { outcome: "stale" as const, edition };
    }
    if (edition.state === "approved" || edition.state === "active") {
      return { outcome: "blocked" as const, edition };
    }

    const relationKind = relationKindForDecision(input.action);
    if (relationKind) {
      const fromId = normalizeUuid(input.fromCatalogItemId ?? "");
      const toId = normalizeUuid(input.toCatalogItemId ?? "");
      if (!fromId) return { outcome: "blocked" as const, edition };
      if (!toId && relationKind !== "replaced_by") {
        return { outcome: "blocked" as const, edition };
      }
      if (toId && toId === fromId) {
        return { outcome: "blocked" as const, edition };
      }

      await sql`
        insert into catalog_registry_item_relations (
          release_id,
          from_catalog_item_id,
          to_catalog_item_id,
          relation_kind,
          relation_digest,
          decided_by_user_id
        ) values (
          ${releaseId}::uuid,
          ${fromId}::uuid,
          ${toId}::uuid,
          ${relationKind},
          ${stableRegistryDigest({ releaseId, fromId, toId, relationKind })},
          ${requireUuid(scope.userId, "owner")}::uuid
        )
        on conflict do nothing
      `.execute(transaction);
    }

    const nextState =
      input.action === "defer"
        ? "deferred"
        : input.action === "block_rule"
          ? "blocked"
          : "decided";
    await sql`
      update catalog_registry_edition_diffs
      set state = ${nextState},
          expected_version = expected_version + 1,
          updated_at = now()
      where id = ${groupId}::uuid
        and release_id = ${releaseId}::uuid
    `.execute(transaction);

    return {
      outcome: "accepted" as const,
      edition: await readEdition(transaction, releaseId),
    };
  });
}

/**
 * Binds one immutable preview digest over the edition's decisions and its
 * current affected-object impact. A later impact change invalidates it.
 */
export async function approveEditionPreview(
  scope: RequestScope,
  input: { releaseId: string; expectedVersion: number; writesEnabled: boolean },
  database: Kysely<Database> = db,
): Promise<EditionActionResult> {
  if (!input.writesEnabled) return { outcome: "blocked", edition: null };
  const releaseId = normalizeUuid(input.releaseId);
  if (!releaseId) return { outcome: "not_found", edition: null };

  return database.transaction().execute(async (transaction) => {
    await setInteractiveDeadline(transaction);
    const edition = await readEditionForUpdate(transaction, releaseId);
    if (!edition) return { outcome: "not_found" as const, edition: null };
    if (edition.version !== input.expectedVersion) {
      return { outcome: "stale" as const, edition };
    }
    if (edition.state !== "review_ready" && edition.state !== "building") {
      return { outcome: "blocked" as const, edition };
    }
    if (edition.blockingCount > 0) {
      return { outcome: "blocked" as const, edition };
    }

    const previewDigest = stableRegistryDigest({
      releaseId,
      policyVersion: STABLE_REGISTRY_EDITION_POLICY_VERSION,
      affectedObjectCount: edition.totalAffectedObjectCount,
      reviewableCount: edition.reviewableCount,
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
    `.execute(transaction);

    return {
      outcome: "accepted" as const,
      edition: await readEdition(transaction, releaseId),
    };
  });
}

/**
 * Moves the active pointer and appends one activation receipt.
 *
 * `activate` promotes an approved edition. `rollback` returns the pointer to
 * the recorded prior release, and `forward` re-promotes after a rehearsal. All
 * three append a receipt; none rewrites the one it follows, and none deletes a
 * release, a membership row, or a source capture.
 */
export async function moveEditionPointer(
  scope: RequestScope,
  input: {
    releaseId: string;
    previewDigest: string;
    transition: EditionTransition;
    writesEnabled: boolean;
  },
  database: Kysely<Database> = db,
): Promise<EditionPointerResult> {
  if (!input.writesEnabled) {
    return {
      outcome: "blocked",
      edition: null,
      transition: null,
      searchProjection: "not_applicable",
    };
  }
  if (!SHA256_PATTERN.test(input.previewDigest)) {
    return {
      outcome: "stale",
      edition: null,
      transition: null,
      searchProjection: "not_applicable",
    };
  }
  const releaseId = normalizeUuid(input.releaseId);
  if (!releaseId) {
    return {
      outcome: "not_found",
      edition: null,
      transition: null,
      searchProjection: "not_applicable",
    };
  }

  return database.transaction().execute(async (transaction) => {
    await setInteractiveDeadline(transaction);
    await sql`
      insert into catalog_registry_active_pointers (release_family, active_release_id)
      values ('foundation', null)
      on conflict (release_family) do nothing
    `.execute(transaction);
    const pointer = await sql<{ activeReleaseId: string | null }>`
      select active_release_id as "activeReleaseId"
      from catalog_registry_active_pointers
      where release_family = 'foundation'
      for update
    `.execute(transaction);
    const currentActiveId = pointer.rows[0]?.activeReleaseId ?? null;

    const edition = await readEditionForUpdate(transaction, releaseId);
    if (!edition) {
      return {
        outcome: "not_found" as const,
        edition: null,
        transition: null,
        searchProjection: "not_applicable" as const,
      };
    }

    const target =
      input.transition === "rollback" ? edition.priorReleaseId : releaseId;
    if (!target) {
      // Nothing to roll back to: the edition has no recorded predecessor, so
      // the current release stays active rather than the pointer going null.
      return {
        outcome: "blocked" as const,
        edition,
        transition: null,
        searchProjection: "not_applicable" as const,
      };
    }
    if (
      input.transition !== "rollback" &&
      edition.previewDigest !== input.previewDigest
    ) {
      return {
        outcome: "stale" as const,
        edition,
        transition: null,
        searchProjection: "not_applicable" as const,
      };
    }
    if (input.transition === "activate" && edition.state !== "approved") {
      return {
        outcome: "stale" as const,
        edition,
        transition: null,
        searchProjection: "not_applicable" as const,
      };
    }

    // `retired -> active` is forbidden by the OVE-255 guard except under this
    // transaction-local rollback flag. Without it a rollback would leave the
    // pointer on a retired release and every product read, which filters on
    // `state = 'active'`, would see an empty catalog.
    if (input.transition !== "activate") {
      await sql`
        select set_config('overgarden.registry_rollback', 'on', true)
      `.execute(transaction);
    }

    const nextSequence = await nextSequenceNumber(transaction);
    const receiptDigest = stableRegistryDigest({
      sequenceNumber: nextSequence,
      releaseId,
      target,
      priorReleaseId: currentActiveId,
      transition: input.transition,
      previewDigest: input.previewDigest,
    });

    await sql`
      update catalog_registry_active_pointers
      set active_release_id = ${target}::uuid,
          version = version + 1,
          updated_at = now()
      where release_family = 'foundation'
    `.execute(transaction);

    // The retired release keeps every row it ever had; only its state moves.
    if (currentActiveId && currentActiveId !== target) {
      await sql`
        update catalog_registry_releases
        set state = 'retired', retired_at = now(), version = version + 1, updated_at = now()
        where id = ${currentActiveId}::uuid
          and state = 'active'
      `.execute(transaction);
    }
    await sql`
      update catalog_registry_releases
      set state = 'active',
          activated_by_user_id = coalesce(
            activated_by_user_id,
            ${requireUuid(scope.userId, "owner")}::uuid
          ),
          activated_at = coalesce(activated_at, now()),
          version = version + 1,
          updated_at = now()
      where id = ${target}::uuid
        and state in ('approved', 'retired')
    `.execute(transaction);

    await sql`
      insert into catalog_registry_activation_sequence (
        sequence_number,
        release_family,
        release_id,
        prior_release_id,
        transition,
        state,
        preview_digest,
        receipt_digest,
        affected_object_count,
        actor_user_id
      ) values (
        ${nextSequence},
        'foundation',
        ${target}::uuid,
        ${currentActiveId}::uuid,
        ${input.transition},
        'applied',
        ${input.previewDigest},
        ${receiptDigest},
        ${edition.totalAffectedObjectCount},
        ${requireUuid(scope.userId, "owner")}::uuid
      )
      on conflict (receipt_digest) do nothing
    `.execute(transaction);

    await buildEnqueueCatalogTypeaheadReindexJobQuery(
      transaction,
    ).executeTakeFirst();

    return {
      outcome: "accepted" as const,
      edition: await readEdition(transaction, releaseId),
      transition: input.transition,
      searchProjection: "queued" as const,
    };
  });
}

export function relationKindForDecision(
  action: EditionDecisionAction,
): EditionRelationKind | null {
  switch (action) {
    case "same_concept":
      return "same_concept";
    case "record_equivalence":
      return "equivalent_to";
    case "create_successor":
      return "replaced_by";
    case "record_split":
      return "split_into";
    default:
      // keep_current, add_alias, different_concept, defer, and block_rule are
      // owner judgements that record no identity relation.
      return null;
  }
}

export function buildEditionDiffGroupsQuery(
  executor: QueryExecutor,
  releaseId: string,
) {
  return executor
    .selectFrom("catalog_registry_edition_diffs")
    .select([
      "id",
      "diff_class as diffClass",
      "state",
      "member_count as memberCount",
      "affected_object_count as affectedObjectCount",
      "expected_version as expectedVersion",
    ])
    .where("release_id", "=", releaseId)
    .orderBy("diff_class", "asc");
}

async function readDiffGroups(
  executor: QueryExecutor,
  releaseId: string,
): Promise<EditionDiffGroupSummary[]> {
  const rows = await buildEditionDiffGroupsQuery(executor, releaseId)
    .$castTo<EditionDiffGroupSummary>()
    .execute();
  return rows.filter((row) => isEditionReviewableDiffClass(row.diffClass));
}

async function readDiffGroupForUpdate(
  executor: QueryExecutor,
  releaseId: string,
  groupId: string,
) {
  const result = await sql<EditionDiffGroupSummary>`
    select
      id,
      diff_class as "diffClass",
      state,
      member_count as "memberCount",
      affected_object_count as "affectedObjectCount",
      expected_version as "expectedVersion"
    from catalog_registry_edition_diffs
    where id = ${groupId}::uuid
      and release_id = ${releaseId}::uuid
    for update
  `.execute(executor);
  return result.rows[0] ?? null;
}

async function readEdition(
  executor: QueryExecutor,
  releaseId: string,
): Promise<EditionSummary | null> {
  if (!releaseId) return null;
  const result = await sql<EditionSummary>`
    select
      releases.id,
      releases.state,
      releases.predecessor_release_id as "priorReleaseId",
      releases.preview_digest as "previewDigest",
      releases.version,
      releases.created_at as "createdAt",
      releases.approved_at as "approvedAt",
      releases.activated_at as "activatedAt",
      coalesce((
        select count(*)::int from catalog_registry_edition_diffs as diffs
        where diffs.release_id = releases.id and diffs.diff_class = 'unchanged'
      ), 0) as "unchangedCount",
      coalesce((
        select count(*)::int from catalog_registry_edition_diffs as diffs
        where diffs.release_id = releases.id and diffs.diff_class <> 'unchanged'
      ), 0) as "reviewableCount",
      coalesce((
        select count(*)::int from catalog_registry_edition_diffs as diffs
        where diffs.release_id = releases.id
          and diffs.diff_class in ('correction', 'supersession', 'split', 'rights_change')
          and diffs.state in ('open', 'blocked')
      ), 0) as "blockingCount",
      coalesce((
        select sum(diffs.affected_object_count)::int
        from catalog_registry_edition_diffs as diffs
        where diffs.release_id = releases.id
      ), 0) as "totalAffectedObjectCount"
    from catalog_registry_releases as releases
    where releases.id = ${releaseId}::uuid
  `.execute(executor);
  return result.rows[0] ?? null;
}

async function readEditionForUpdate(
  executor: QueryExecutor,
  releaseId: string,
) {
  await sql`
    select 1 from catalog_registry_releases where id = ${releaseId}::uuid for update
  `.execute(executor);
  return readEdition(executor, releaseId);
}

async function readLatestEdition(executor: QueryExecutor) {
  const result = await sql<{ id: string }>`
    select releases.id
    from catalog_registry_releases as releases
    where releases.release_kind = 'edition'
      and releases.state <> 'abandoned'
    order by releases.created_at desc
    limit 1
  `.execute(executor);
  const id = result.rows[0]?.id;
  return id ? readEdition(executor, id) : null;
}

async function readActivePointer(executor: QueryExecutor) {
  const result = await sql<{ activeReleaseId: string | null }>`
    select active_release_id as "activeReleaseId"
    from catalog_registry_active_pointers
    where release_family = 'foundation'
  `.execute(executor);
  return result.rows[0]?.activeReleaseId ?? null;
}

async function readActivationHistory(
  executor: QueryExecutor,
): Promise<EditionActivationReceiptSummary[]> {
  const result = await sql<EditionActivationReceiptSummary>`
    select
      sequence_number as "sequenceNumber",
      transition,
      state,
      release_id as "releaseId",
      prior_release_id as "priorReleaseId",
      affected_object_count as "affectedObjectCount",
      created_at as "createdAt"
    from catalog_registry_activation_sequence
    where release_family = 'foundation'
    order by sequence_number desc
    limit 20
  `.execute(executor);
  return result.rows;
}

async function nextSequenceNumber(executor: QueryExecutor) {
  const result = await sql<{ next: number }>`
    select coalesce(max(sequence_number), 0) + 1 as next
    from catalog_registry_activation_sequence
    where release_family = 'foundation'
  `.execute(executor);
  return Number(result.rows[0]?.next ?? 1);
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

export function isEditionBlocking(diffClass: EditionDiffClass) {
  return isEditionBlockingDiffClass(diffClass);
}

function normalizeUuid(value: string) {
  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

function requireUuid(value: string | null | undefined, label: string) {
  const normalized = normalizeUuid(value ?? "");
  if (!normalized) throw new Error(`edition_${label}_required`);
  return normalized;
}
