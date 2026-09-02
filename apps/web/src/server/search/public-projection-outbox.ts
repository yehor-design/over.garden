import "server-only";

import { randomUUID } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { meiliSearchClient } from "@/server/search/client";
import {
  fingerprintJournalSearchDocument,
  validateObservedJournalSearchDocument,
} from "@/server/search/public-journal-document-contract";
import {
  assertSafeJournalSearchDocumentId,
  isSafeJournalSearchDocumentId,
} from "@/server/search/public-journal-document-id";
import {
  buildGloballyEligibleJournalSearchRowsQuery,
  listGloballyEligibleJournalSearchDocuments,
  resolveCoverPresentation,
  type PublicJournalSearchExpectedRow,
} from "@/server/search/public-journal-eligibility";
import { buildJournalEntrySearchDocumentContractFixture } from "@/server/search/documents";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * OVE-242. One durable public-projection intent per projected entity, written
 * inside the canonical write transaction.
 *
 * The pre-OVE-242 shape was "commit, then enqueue": `journal-repository.ts`
 * committed an archive/edit/location change and the route or action afterwards
 * asked the global connection to insert a `job_queue` row. Every failure
 * between those two steps — process crash, queue error, swallowed rejection,
 * idempotent replay that skipped the enqueue — left the previous Meilisearch
 * document searchable with nothing durable recording that it must be revoked.
 *
 * Here the intent is part of the same transaction as the canonical write, so
 * the projection can never be silently forgotten. Convergence is then a real
 * read-back of Meilisearch, never "a job was queued".
 */
export const PUBLIC_PROJECTION_OUTBOX_POLICY =
  "ove242.publicProjectionOutbox.v1";
export const PUBLIC_PROJECTION_ISSUE = "OVE-242";
export const PUBLIC_PROJECTION_ENTITY_KIND = "journal_entry";
export const PUBLIC_JOURNAL_ENTRIES_INDEX = "journal_entries";

/** Attempts before an intent is dead-lettered instead of retried forever. */
export const PUBLIC_PROJECTION_MAX_ATTEMPTS = 5;
/** Lease held by one applier while it writes and verifies Meilisearch. */
export const PUBLIC_PROJECTION_LEASE_SECONDS = 60;
/**
 * An intent that has been runnable longer than this is not "in flight", it is
 * stuck, and a stuck privacy-reducing intent is exactly the stale-document
 * window this issue exists to close. It blocks the parity gate.
 */
export const PUBLIC_PROJECTION_OVERDUE_SECONDS = 300;
const RETRY_BASE_SECONDS = 5;
const MEILI_TASK_TIMEOUT_MS = 120_000;
const MEILI_TASK_POLL_INTERVAL_MS = 250;

export type PublicProjectionState = "present" | "absent";

export type PublicProjectionReason =
  | "publish"
  | "edit"
  | "journal_delete"
  | "erasure"
  | "moderation"
  | "location_change"
  | "catalog_identity"
  | "media_presentation"
  | "profile_visibility"
  | "repair";

/**
 * Transitions that can only reduce what the public can see. They are claimed
 * first, and a product surface may not report terminal removal success until
 * one of them has verifiably converged.
 */
const PRIVACY_REDUCING_REASONS: ReadonlySet<PublicProjectionReason> = new Set([
  "journal_delete",
  "erasure",
  "moderation",
  "location_change",
  "profile_visibility",
]);

export interface RecordPublicProjectionIntentInput {
  entityId: string;
  ownerUserId: string;
  desiredState: PublicProjectionState;
  reason: PublicProjectionReason;
  /**
   * Overrides the reason-derived default. An edit that removes sensitive text
   * is privacy-reducing even though "edit" generally is not.
   */
  privacyReducing?: boolean;
}

export interface PublicProjectionOutboxGate {
  /** Rows whose applied generation is behind the desired generation. */
  unconverged: number;
  /** Unconverged rows that have been runnable past the overdue budget. */
  overdue: number;
  /** Dead-lettered rows. Always blocks the gate. */
  dead: number;
  /** Unconverged rows that reduce public exposure. */
  privacyReducingUnconverged: number;
}

export interface PublicProjectionConvergenceStatus {
  entityId: string;
  converged: boolean;
  desiredState: PublicProjectionState;
  /** Names only: `pending`, `processing`, `applied`, `failed`, `dead`. */
  status: string;
  attempts: number;
}

export interface ApplyPublicProjectionResult {
  entityId: string;
  outcome:
    | "converged"
    | "superseded"
    | "retry_scheduled"
    | "dead_lettered"
    | "not_claimable";
  desiredState: PublicProjectionState;
}

/**
 * Records the desired public state for one entity inside the caller's
 * transaction. Must be called with the same executor as the canonical write.
 *
 * The generation comes from a shared Postgres sequence, so a later write always
 * outranks an earlier one across connections and an applier can detect that the
 * state it applied is no longer the desired one.
 */
export async function recordPublicProjectionIntent(
  executor: QueryExecutor,
  input: RecordPublicProjectionIntentInput,
): Promise<string> {
  const entityId = assertSafeJournalSearchDocumentId(input.entityId);
  const ownerUserId = assertSafeJournalSearchDocumentId(input.ownerUserId);
  const privacyReducing =
    input.privacyReducing ?? PRIVACY_REDUCING_REASONS.has(input.reason);

  const result = await sql<{ desired_generation: string }>`
    insert into public_projection_intents (
      entity_kind,
      entity_id,
      owner_user_id,
      desired_state,
      desired_generation,
      desired_reason,
      privacy_reducing,
      status,
      attempts,
      available_at,
      lease_owner,
      lease_expires_at,
      last_error_class,
      updated_at
    )
    values (
      ${PUBLIC_PROJECTION_ENTITY_KIND},
      ${entityId}::uuid,
      ${ownerUserId}::uuid,
      ${input.desiredState},
      nextval('public_projection_generation_seq'),
      ${input.reason},
      ${privacyReducing},
      'pending',
      0,
      now(),
      null,
      null,
      null,
      now()
    )
    on conflict (entity_kind, entity_id) do update set
      owner_user_id = excluded.owner_user_id,
      desired_state = excluded.desired_state,
      desired_generation = excluded.desired_generation,
      desired_reason = excluded.desired_reason,
      -- A pending privacy-reducing transition keeps its priority even when a
      -- later neutral write lands before it converged.
      privacy_reducing = excluded.privacy_reducing
        or (
          public_projection_intents.privacy_reducing
          and public_projection_intents.applied_generation
            < public_projection_intents.desired_generation
        ),
      status = 'pending',
      attempts = 0,
      available_at = now(),
      lease_owner = null,
      lease_expires_at = null,
      last_error_class = null,
      updated_at = now()
    returning desired_generation
  `.execute(executor);

  const row = result.rows[0];
  if (!row) {
    throw new Error("public projection intent was not recorded");
  }
  // Returned as text: the generation is a Postgres bigint and equality is the
  // only comparison callers need.
  return row.desired_generation;
}

/**
 * Repairs a missing intent without disturbing one that already exists.
 *
 * The idempotent replay path uses this: a replayed mutation must not create a
 * new generation for state it did not change, but it must not silently accept a
 * public entry that has no durable intent at all.
 */
export async function ensurePublicProjectionIntent(
  executor: QueryExecutor,
  input: RecordPublicProjectionIntentInput,
): Promise<"recorded" | "already_present"> {
  const entityId = assertSafeJournalSearchDocumentId(input.entityId);
  const existing = await executor
    .selectFrom("public_projection_intents")
    .select("entity_id")
    .where("entity_kind", "=", PUBLIC_PROJECTION_ENTITY_KIND)
    .where("entity_id", "=", entityId)
    .executeTakeFirst();

  if (existing) return "already_present";
  await recordPublicProjectionIntent(executor, input);
  return "recorded";
}

/**
 * Records intents for every currently public entry owned by `ownerUserId`.
 * Used by owner-level declassification (erasure, profile visibility) where the
 * canonical write does not name individual entries.
 */
export async function recordPublicProjectionIntentsForOwner(
  executor: QueryExecutor,
  input: {
    ownerUserId: string;
    desiredState: PublicProjectionState;
    reason: PublicProjectionReason;
    /** Owner id to store on the intent rows when erasure re-keys the owner. */
    intentOwnerUserId?: string;
  },
): Promise<string[]> {
  const rows = await executor
    .selectFrom("journal_entries")
    .select("id")
    .where("owner_user_id", "=", input.ownerUserId)
    .where("visibility", "=", "public")
    .where("public_slug", "is not", null)
    .execute();

  const recorded: string[] = [];
  for (const row of rows) {
    if (!isSafeJournalSearchDocumentId(row.id)) continue;
    await recordPublicProjectionIntent(executor, {
      entityId: row.id,
      ownerUserId: input.intentOwnerUserId ?? input.ownerUserId,
      desiredState: input.desiredState,
      reason: input.reason,
    });
    recorded.push(row.id);
  }
  return recorded;
}

/**
 * Records intents for every public entry attached to one plant object. A
 * location visibility or region change rewrites the public region of each of
 * that object's public entries.
 */
export async function recordPublicProjectionIntentsForPlantObject(
  executor: QueryExecutor,
  input: {
    plantObjectId: string;
    ownerUserId: string;
    reason: PublicProjectionReason;
  },
): Promise<string[]> {
  const rows = await executor
    .selectFrom("journal_entries")
    .select("id")
    .where("owner_user_id", "=", input.ownerUserId)
    .where("plant_object_id", "=", input.plantObjectId)
    .where("visibility", "=", "public")
    .where("public_slug", "is not", null)
    .where("lifecycle_state", "=", "active")
    .where("public_gone_at", "is", null)
    .execute();

  const recorded: string[] = [];
  for (const row of rows) {
    if (!isSafeJournalSearchDocumentId(row.id)) continue;
    await recordPublicProjectionIntent(executor, {
      entityId: row.id,
      ownerUserId: input.ownerUserId,
      desiredState: "present",
      reason: input.reason,
    });
    recorded.push(row.id);
  }
  return recorded;
}

interface ClaimedIntent {
  entityId: string;
  ownerUserId: string;
  desiredState: PublicProjectionState;
  desiredGeneration: string;
  attempts: number;
  leaseOwner: string;
}

/**
 * Claims one unconverged intent with a lease. Privacy-reducing work first, then
 * the oldest desired generation. `for update skip locked` keeps concurrent
 * appliers from claiming the same row, and an expired lease is reclaimable so a
 * crashed applier cannot wedge an entity forever.
 */
export async function claimPublicProjectionIntent(
  executor: QueryExecutor = db,
  input: { entityId?: string; leaseOwner?: string } = {},
): Promise<ClaimedIntent | null> {
  const leaseOwner = input.leaseOwner ?? `web:${randomUUID()}`;
  const entityFilter = input.entityId
    ? sql`and entity_id = ${assertSafeJournalSearchDocumentId(input.entityId)}::uuid`
    : sql``;

  const claimed = await sql<{
    entity_id: string;
    owner_user_id: string;
    desired_state: PublicProjectionState;
    desired_generation: string;
    attempts: number;
  }>`
    with claimable as (
      select entity_kind, entity_id
      from public_projection_intents
      where entity_kind = ${PUBLIC_PROJECTION_ENTITY_KIND}
        and applied_generation < desired_generation
        ${entityFilter}
        and (
          (status in ('pending', 'failed') and available_at <= now())
          or (status = 'processing' and lease_expires_at < now())
        )
      order by privacy_reducing desc, desired_generation asc
      for update skip locked
      limit 1
    )
    update public_projection_intents as intents
    set status = 'processing',
        attempts = intents.attempts + 1,
        lease_owner = ${leaseOwner},
        lease_expires_at = now() + (${PUBLIC_PROJECTION_LEASE_SECONDS} || ' seconds')::interval,
        updated_at = now()
    from claimable
    where intents.entity_kind = claimable.entity_kind
      and intents.entity_id = claimable.entity_id
    returning
      intents.entity_id,
      intents.owner_user_id,
      intents.desired_state,
      intents.desired_generation,
      intents.attempts
  `.execute(executor);

  const row = claimed.rows[0];
  if (!row) return null;
  return {
    entityId: row.entity_id,
    ownerUserId: row.owner_user_id,
    desiredState: row.desired_state,
    desiredGeneration: row.desired_generation,
    attempts: Number(row.attempts),
    leaseOwner,
  };
}

/**
 * Applies one claimed intent to Meilisearch and verifies the real result.
 *
 * Convergence is recorded with a compare-and-set on `desired_generation`: if a
 * newer canonical write landed while this applier was working, the update
 * matches zero rows and the newer generation stays unconverged. An older
 * applier therefore cannot mark newer state as done, and cannot overwrite it
 * either, because the document it wrote was read from the current database.
 */
async function applyClaimedIntent(
  executor: QueryExecutor,
  claim: ClaimedIntent,
): Promise<ApplyPublicProjectionResult> {
  const index = meiliSearchClient().index(PUBLIC_JOURNAL_ENTRIES_INDEX);

  try {
    const expected =
      claim.desiredState === "present"
        ? await loadExpectedPublicJournalDocument(executor, claim.entityId)
        : null;

    if (claim.desiredState === "present" && expected) {
      await waitForMeiliTask(
        await index.addDocuments([expected.document], { primaryKey: "id" }),
      );
    } else {
      // Either the entity must be absent, or it is no longer publicly eligible
      // and "index it" resolves to "remove it". Both converge to absence.
      await waitForMeiliTask(await index.deleteDocuments([claim.entityId]));
    }

    const verified = await verifyPublicProjection(executor, claim.entityId);
    if (!verified.matchesCurrentDatabase) {
      // The database moved while we applied. A newer generation exists and
      // owns the next apply; do not claim convergence for this one.
      return await scheduleRetry(executor, claim, "verification_mismatch");
    }

    const settled = await sql<{ entity_id: string }>`
      update public_projection_intents
      set status = 'applied',
          applied_state = ${verified.observedState},
          applied_generation = desired_generation,
          applied_at = now(),
          verified_at = now(),
          lease_owner = null,
          lease_expires_at = null,
          last_error_class = null,
          updated_at = now()
      where entity_kind = ${PUBLIC_PROJECTION_ENTITY_KIND}
        and entity_id = ${claim.entityId}::uuid
        and desired_generation = ${claim.desiredGeneration}::bigint
        and desired_state = ${verified.observedState}
        and lease_owner = ${claim.leaseOwner}
      returning entity_id
    `.execute(executor);

    if (settled.rows.length === 0) {
      return {
        entityId: claim.entityId,
        outcome: "superseded",
        desiredState: claim.desiredState,
      };
    }

    return {
      entityId: claim.entityId,
      outcome: "converged",
      desiredState: claim.desiredState,
    };
  } catch {
    return await scheduleRetry(executor, claim, "apply_failed");
  }
}

async function scheduleRetry(
  executor: QueryExecutor,
  claim: ClaimedIntent,
  errorClass: string,
): Promise<ApplyPublicProjectionResult> {
  const dead = claim.attempts >= PUBLIC_PROJECTION_MAX_ATTEMPTS;
  const backoffSeconds =
    RETRY_BASE_SECONDS * 2 ** Math.min(Math.max(claim.attempts - 1, 0), 6);

  await sql`
    update public_projection_intents
    set status = ${dead ? "dead" : "failed"},
        available_at = now() + (${backoffSeconds} || ' seconds')::interval,
        lease_owner = null,
        lease_expires_at = null,
        last_error_class = ${errorClass},
        updated_at = now()
    where entity_kind = ${PUBLIC_PROJECTION_ENTITY_KIND}
      and entity_id = ${claim.entityId}::uuid
      and desired_generation = ${claim.desiredGeneration}::bigint
      and lease_owner = ${claim.leaseOwner}
  `.execute(executor);

  return {
    entityId: claim.entityId,
    outcome: dead ? "dead_lettered" : "retry_scheduled",
    desiredState: claim.desiredState,
  };
}

/**
 * Claims and applies the intent for one entity, if it is claimable. Safe to
 * call from a request path right after the canonical commit: the intent is
 * already durable, so a failure here only delays convergence, it cannot lose
 * it.
 */
export async function applyPublicProjectionIntentForEntity(
  entityId: string,
  executor: QueryExecutor = db,
): Promise<ApplyPublicProjectionResult> {
  const claim = await claimPublicProjectionIntent(executor, { entityId });
  if (!claim) {
    return {
      entityId,
      outcome: "not_claimable",
      desiredState: "present",
    };
  }
  return applyClaimedIntent(executor, claim);
}

/** Drains up to `limit` unconverged intents, privacy-reducing work first. */
export async function drainPublicProjectionIntents(
  input: { limit?: number } = {},
  executor: QueryExecutor = db,
): Promise<ApplyPublicProjectionResult[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 500));
  const results: ApplyPublicProjectionResult[] = [];
  for (let index = 0; index < limit; index += 1) {
    const claim = await claimPublicProjectionIntent(executor);
    if (!claim) break;
    results.push(await applyClaimedIntent(executor, claim));
  }
  return results;
}

/**
 * Best-effort synchronous convergence for the entities one request just wrote.
 * Never throws: the durable intent plus the worker drain remain the guarantee.
 */
export async function convergePublicProjectionsNow(
  entityIds: readonly string[],
  executor: QueryExecutor = db,
): Promise<void> {
  for (const entityId of entityIds) {
    if (!isSafeJournalSearchDocumentId(entityId)) continue;
    try {
      await applyPublicProjectionIntentForEntity(entityId, executor);
    } catch {
      // Convergence is owned by the durable outbox, not by this request.
    }
  }
}

interface VerifiedProjection {
  observedState: PublicProjectionState;
  /** True when Meilisearch exactly matches what the database currently owes. */
  matchesCurrentDatabase: boolean;
}

/**
 * Reads the real Meilisearch document and compares it, value for value, with
 * what the current database says the public projection must be. Absence is
 * proved by absence, not by a queue status.
 */
export async function verifyPublicProjection(
  executor: QueryExecutor,
  entityId: string,
): Promise<VerifiedProjection> {
  const safeId = assertSafeJournalSearchDocumentId(entityId);
  const index = meiliSearchClient().index(PUBLIC_JOURNAL_ENTRIES_INDEX);

  let observed: Record<string, unknown> | null = null;
  try {
    observed = (await index.getDocument(safeId)) as Record<string, unknown>;
  } catch {
    observed = null;
  }

  const expected = await loadExpectedPublicJournalDocument(executor, safeId);

  if (!expected) {
    return {
      observedState: observed ? "present" : "absent",
      matchesCurrentDatabase: observed === null,
    };
  }
  if (!observed) {
    return { observedState: "absent", matchesCurrentDatabase: false };
  }

  // The observed document is validated on its own values by the OVE-227
  // contract before it is fingerprinted. No expected value is ever substituted,
  // so a stale title, body, path, region, media URL or content class is caught
  // byte for byte after normalization.
  const validation = validateObservedJournalSearchDocument(observed, {
    publicDerivativeBaseUrl: process.env.R2_PUBLIC_BASE_URL?.trim() || null,
  });
  if (!validation.ok || validation.document === null) {
    return { observedState: "present", matchesCurrentDatabase: false };
  }

  return {
    observedState: "present",
    matchesCurrentDatabase:
      fingerprintJournalSearchDocument(validation.document) ===
      expected.fingerprint,
  };
}

/**
 * The single-entity form of the canonical global eligibility query. Reusing
 * `buildGloballyEligibleJournalSearchRowsQuery` is deliberate: the outbox, the
 * parity gate and the public routes must not be able to disagree about what is
 * publicly eligible.
 */
export async function loadExpectedPublicJournalDocument(
  executor: QueryExecutor,
  entityId: string,
): Promise<PublicJournalSearchExpectedRow | null> {
  const safeId = assertSafeJournalSearchDocumentId(entityId);
  const row = await buildGloballyEligibleJournalSearchRowsQuery(executor)
    .where("journal_entries.id", "=", safeId)
    .executeTakeFirst();

  if (!row) return null;

  const cover = resolveCoverPresentation({
    coverMediaId: row.coverMediaId,
    coverUsageRole: row.coverUsageRole,
    coverDerivativeKey: row.coverDerivativeKey,
    explicitCoverMediaAssetId: row.explicitCoverMediaAssetId,
    revokedAt: row.coverRevokedAt,
  });
  const document = buildJournalEntrySearchDocumentContractFixture({
    id: row.id,
    title: row.title,
    body: row.body,
    public_slug: row.publicSlug,
    public_gone_at: row.publicGoneAt,
    published_at: row.publishedAt,
    entry_date: row.entryDate,
    entry_scope: row.entryScope,
    created_at: row.createdAt,
    visibility: row.visibility,
    lifecycle_state: row.lifecycleState,
    location_visibility: row.locationVisibility,
    coarse_region_code: row.coarseRegionCode,
    owner_profile_public_safe: true,
    cover_source: cover.coverSource,
    cover_public_url: cover.coverPublicUrl,
    cover_projection_quality: cover.coverProjectionQuality,
  });
  if (!document) return null;

  return {
    id: document.id,
    ownerUserId: row.ownerUserId,
    document,
    fingerprint: fingerprintJournalSearchDocument(document),
  };
}

/**
 * Convergence status for product surfaces. A surface that promises removal must
 * consult this instead of assuming a queued job succeeded.
 */
export async function loadPublicProjectionConvergence(
  entityIds: readonly string[],
  executor: QueryExecutor = db,
): Promise<PublicProjectionConvergenceStatus[]> {
  const safeIds = entityIds.filter((id) => isSafeJournalSearchDocumentId(id));
  if (safeIds.length === 0) return [];

  const rows = await executor
    .selectFrom("public_projection_intents")
    .select([
      "entity_id as entityId",
      "desired_state as desiredState",
      "status",
      "attempts",
      "applied_generation as appliedGeneration",
      "desired_generation as desiredGeneration",
    ])
    .where("entity_kind", "=", PUBLIC_PROJECTION_ENTITY_KIND)
    .where("entity_id", "in", safeIds)
    .execute();

  return rows.map((row) => ({
    entityId: row.entityId,
    converged:
      row.status === "applied" &&
      String(row.appliedGeneration) === String(row.desiredGeneration),
    desiredState: row.desiredState as PublicProjectionState,
    status: row.status,
    attempts: Number(row.attempts),
  }));
}

export async function arePublicProjectionsConverged(
  entityIds: readonly string[],
  executor: QueryExecutor = db,
): Promise<boolean> {
  const safeIds = entityIds.filter((id) => isSafeJournalSearchDocumentId(id));
  if (safeIds.length === 0) return true;
  const statuses = await loadPublicProjectionConvergence(safeIds, executor);
  if (statuses.length !== safeIds.length) return false;
  return statuses.every((status) => status.converged);
}

/**
 * Outbox classes that can hide a stale public document. Counts only — never an
 * entity id, owner, title, slug or media URL.
 */
export async function loadPublicProjectionOutboxGate(
  executor: QueryExecutor = db,
): Promise<PublicProjectionOutboxGate> {
  const result = await sql<{
    unconverged: number;
    overdue: number;
    dead: number;
    privacy_reducing_unconverged: number;
  }>`
    select
      count(*) filter (
        where applied_generation < desired_generation
      )::int as unconverged,
      count(*) filter (
        where applied_generation < desired_generation
          and status <> 'dead'
          and updated_at < now() - (${PUBLIC_PROJECTION_OVERDUE_SECONDS} || ' seconds')::interval
      )::int as overdue,
      count(*) filter (where status = 'dead')::int as dead,
      count(*) filter (
        where applied_generation < desired_generation
          and privacy_reducing
      )::int as privacy_reducing_unconverged
    from public_projection_intents
    where entity_kind = ${PUBLIC_PROJECTION_ENTITY_KIND}
  `.execute(executor);

  const row = result.rows[0];
  return {
    unconverged: Number(row?.unconverged ?? 0),
    overdue: Number(row?.overdue ?? 0),
    dead: Number(row?.dead ?? 0),
    privacyReducingUnconverged: Number(row?.privacy_reducing_unconverged ?? 0),
  };
}

/**
 * Repairs missing intent rows for the currently eligible corpus. This is the
 * bounded backfill path for entries that were published before the outbox
 * existed; normal operation never depends on it.
 */
export async function backfillMissingPublicProjectionIntents(
  input: { limit?: number } = {},
  executor: QueryExecutor = db,
): Promise<{ recorded: number }> {
  const limit = Math.max(1, Math.min(input.limit ?? 200, 1000));
  const expected = await listGloballyEligibleJournalSearchDocuments(executor);
  const existing = await executor
    .selectFrom("public_projection_intents")
    .select("entity_id as entityId")
    .where("entity_kind", "=", PUBLIC_PROJECTION_ENTITY_KIND)
    .execute();
  const known = new Set(existing.map((row) => row.entityId));

  let recorded = 0;
  for (const row of expected) {
    if (known.has(row.id)) continue;
    if (recorded >= limit) break;
    await recordPublicProjectionIntent(executor, {
      entityId: row.id,
      ownerUserId: row.ownerUserId,
      desiredState: "present",
      reason: "repair",
    });
    recorded += 1;
  }
  return { recorded };
}

async function waitForMeiliTask(task: unknown): Promise<void> {
  const taskUid =
    typeof task === "object" && task && "taskUid" in task
      ? Number((task as { taskUid?: unknown }).taskUid)
      : Number.NaN;
  if (!Number.isFinite(taskUid)) return;
  await meiliSearchClient().tasks.waitForTask(taskUid, {
    timeout: MEILI_TASK_TIMEOUT_MS,
    interval: MEILI_TASK_POLL_INTERVAL_MS,
  });
}
