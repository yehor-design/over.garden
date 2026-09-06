import "server-only";

import { randomUUID } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { organismAddressChangeTags } from "@/lib/public-cache-tags";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * Organism card revalidation through the public projection outbox (ADR-0026
 * D9, migration 0062). A worker-originated change to an organism writes one
 * `catalog_item` intent with reason `catalog_card`; the web cron drains the
 * rows and expires the card's cache tags. The journal-entry drain in
 * `search/public-projection-outbox.ts` and the worker's `public_projection.py`
 * both filter by entity kind, so the two families never claim each other's
 * rows.
 */
export const CATALOG_CARD_ENTITY_KIND = "catalog_item";
export const CATALOG_CARD_REASON = "catalog_card";
export const CATALOG_CARD_MAX_ATTEMPTS = 5;
export const CATALOG_CARD_LEASE_SECONDS = 60;
const RETRY_BASE_SECONDS = 5;

export interface CatalogCardIntentClaim {
  catalogItemId: string;
  desiredGeneration: string;
  attempts: number;
  leaseOwner: string;
}

export interface CatalogCardDrainResult {
  catalogItemId: string;
  outcome: "revalidated" | "superseded" | "retry_scheduled" | "dead_lettered";
}

/**
 * Records that an organism's card must be rendered again. Idempotent per
 * organism: a second write before the drain bumps the generation and resets
 * the attempt count, so the newest change is always the one that converges.
 */
export async function recordCatalogCardIntent(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<string> {
  const result = await sql<{ desired_generation: string }>`
    insert into public_projection_intents (
      entity_kind, entity_id, owner_user_id, desired_state, desired_generation,
      desired_reason, privacy_reducing, status, attempts, available_at,
      lease_owner, lease_expires_at, last_error_class, updated_at
    )
    values (
      ${CATALOG_CARD_ENTITY_KIND}, ${assertUuid(catalogItemId)}::uuid, null, 'present',
      nextval('public_projection_generation_seq'), ${CATALOG_CARD_REASON}, false,
      'pending', 0, now(), null, null, null, now()
    )
    on conflict (entity_kind, entity_id) do update set
      desired_generation = excluded.desired_generation,
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
  if (!row) throw new Error("catalog card intent was not recorded");
  return row.desired_generation;
}

/** Claims one unconverged card intent under a lease; expired leases are reclaimable. */
export async function claimCatalogCardIntent(
  executor: QueryExecutor = db,
  leaseOwner = `web:${randomUUID()}`,
): Promise<CatalogCardIntentClaim | null> {
  const claimed = await sql<{
    entity_id: string;
    desired_generation: string;
    attempts: number;
  }>`
    with claimable as (
      select entity_kind, entity_id
      from public_projection_intents
      where entity_kind = ${CATALOG_CARD_ENTITY_KIND}
        and applied_generation < desired_generation
        and (
          (status in ('pending', 'failed') and available_at <= now())
          or (status = 'processing' and lease_expires_at < now())
        )
      order by desired_generation asc
      for update skip locked
      limit 1
    )
    update public_projection_intents as intents
    set status = 'processing',
        attempts = intents.attempts + 1,
        lease_owner = ${leaseOwner},
        lease_expires_at = now() + (${CATALOG_CARD_LEASE_SECONDS} || ' seconds')::interval,
        updated_at = now()
    from claimable
    where intents.entity_kind = claimable.entity_kind
      and intents.entity_id = claimable.entity_id
    returning intents.entity_id, intents.desired_generation, intents.attempts
  `.execute(executor);
  const row = claimed.rows[0];
  if (!row) return null;
  return {
    catalogItemId: row.entity_id,
    desiredGeneration: row.desired_generation,
    attempts: Number(row.attempts),
    leaseOwner,
  };
}

/**
 * Drains up to `limit` card intents: expires the organism's tags and records
 * convergence with a compare-and-set on the generation, so a newer write that
 * landed meanwhile stays unconverged and is drained on the next run.
 */
export async function drainCatalogCardIntents(
  input: {
    limit?: number;
    revalidate?: (catalogItemId: string) => void | Promise<void>;
  } = {},
  executor: QueryExecutor = db,
): Promise<CatalogCardDrainResult[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 500));
  const revalidate =
    input.revalidate ??
    ((catalogItemId: string) => {
      revalidatePublicCacheTags(organismAddressChangeTags(catalogItemId), "expire");
    });
  const results: CatalogCardDrainResult[] = [];
  for (let index = 0; index < limit; index += 1) {
    const claim = await claimCatalogCardIntent(executor);
    if (!claim) break;
    results.push(await applyClaimedCatalogCardIntent(executor, claim, revalidate));
  }
  return results;
}

async function applyClaimedCatalogCardIntent(
  executor: QueryExecutor,
  claim: CatalogCardIntentClaim,
  revalidate: (catalogItemId: string) => void | Promise<void>,
): Promise<CatalogCardDrainResult> {
  try {
    await revalidate(claim.catalogItemId);
  } catch (reason) {
    return scheduleRetry(executor, claim, reason);
  }
  const converged = await sql<{ entity_id: string }>`
    update public_projection_intents
    set status = 'applied',
        applied_state = 'present',
        applied_generation = desired_generation,
        applied_at = now(),
        verified_at = now(),
        lease_owner = null,
        lease_expires_at = null,
        last_error_class = null,
        updated_at = now()
    where entity_kind = ${CATALOG_CARD_ENTITY_KIND}
      and entity_id = ${claim.catalogItemId}::uuid
      and desired_generation = ${claim.desiredGeneration}::bigint
      and lease_owner = ${claim.leaseOwner}
    returning entity_id
  `.execute(executor);
  if (converged.rows.length === 0) {
    // A newer generation landed while this one was in flight; release the
    // lease so the next run drains the newer state.
    await sql`
      update public_projection_intents
      set status = 'pending', lease_owner = null, lease_expires_at = null, updated_at = now()
      where entity_kind = ${CATALOG_CARD_ENTITY_KIND}
        and entity_id = ${claim.catalogItemId}::uuid
        and lease_owner = ${claim.leaseOwner}
    `.execute(executor);
    return { catalogItemId: claim.catalogItemId, outcome: "superseded" };
  }
  return { catalogItemId: claim.catalogItemId, outcome: "revalidated" };
}

async function scheduleRetry(
  executor: QueryExecutor,
  claim: CatalogCardIntentClaim,
  reason: unknown,
): Promise<CatalogCardDrainResult> {
  const dead = claim.attempts >= CATALOG_CARD_MAX_ATTEMPTS;
  const errorClass =
    reason instanceof Error ? reason.name.slice(0, 80) : "unknown_error";
  const delaySeconds = RETRY_BASE_SECONDS * 2 ** Math.max(0, claim.attempts - 1);
  await sql`
    update public_projection_intents
    set status = ${dead ? "dead" : "failed"},
        available_at = now() + (${delaySeconds} || ' seconds')::interval,
        lease_owner = null,
        lease_expires_at = null,
        last_error_class = ${errorClass},
        updated_at = now()
    where entity_kind = ${CATALOG_CARD_ENTITY_KIND}
      and entity_id = ${claim.catalogItemId}::uuid
      and lease_owner = ${claim.leaseOwner}
  `.execute(executor);
  return {
    catalogItemId: claim.catalogItemId,
    outcome: dead ? "dead_lettered" : "retry_scheduled",
  };
}

/** Unconverged card intents, for the receipts and the cron's response. */
export async function countUnconvergedCatalogCardIntents(
  executor: QueryExecutor = db,
): Promise<number> {
  const result = await sql<{ unconverged: number }>`
    select count(*)::int as unconverged
    from public_projection_intents
    where entity_kind = ${CATALOG_CARD_ENTITY_KIND}
      and applied_generation < desired_generation
  `.execute(executor);
  return Number(result.rows[0]?.unconverged ?? 0);
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error("catalog card intent needs a UUID catalog item id");
  }
  return value;
}
