import "server-only";

import type { Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { expandDerivativeObjectKeys } from "@/lib/media/derivative-keys";
import {
  deletePublicDerivativeObject,
  listPublicDerivativeObjects,
  type PublicDerivativeObjectListing,
} from "@/lib/storage";
import { readMediaVariantExtras } from "@/server/media/media-variant-schema";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const MEDIA_ORPHAN_SWEEP_PREFIX = "derivatives/";
/** An object younger than this may belong to a publish still in flight. */
export const MEDIA_ORPHAN_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const PAGE_SIZE = 1_000;
const DELETE_BATCH = 200;

export interface MediaOrphanSweepReceipt {
  /** Objects listed under the prefix. */
  listed: number;
  /** Objects old enough to be judged. */
  eligible: number;
  /** Objects a `media_assets` row (or one of its variants) still names. */
  referenced: number;
  /** Objects nothing names any more, and deleted. */
  deleted: number;
  /** Deletes that failed; the next weekly pass sees them again. */
  failed: number;
  pages: number;
  durationMs: number;
  deadlineReached: boolean;
}

export interface MediaOrphanSweepDependencies {
  executor?: QueryExecutor;
  list?: (input: {
    prefix: string;
    continuationToken: string | null;
    maxKeys: number;
  }) => Promise<PublicDerivativeObjectListing>;
  remove?: (key: string) => Promise<void>;
  now?: () => number;
  deadlineMs?: number;
}

/**
 * Weekly orphan sweep (OVE-372, ADR-0022 D2). Every object under
 * `derivatives/` that is older than seven days and that no `media_assets`
 * row names, as its `derivative_key` or as one of that key's recorded
 * variants, is deleted. Only counts leave this function.
 *
 * A row names its primary through `derivative_key`; its variants are
 * derived from `variant_long_edges` (migration 0047). Before that migration
 * the row records no variants, so a variant object of a live photo would
 * look unreferenced: the sweep therefore also keeps every object whose
 * primary key (the key with its `-<edge>` suffix removed) is referenced.
 */
export async function sweepMediaOrphans(
  dependencies: MediaOrphanSweepDependencies = {},
): Promise<MediaOrphanSweepReceipt> {
  const executor = dependencies.executor ?? db;
  const list =
    dependencies.list ??
    ((input) =>
      listPublicDerivativeObjects({
        prefix: input.prefix,
        continuationToken: input.continuationToken,
        maxKeys: input.maxKeys,
      }));
  const remove =
    dependencies.remove ?? ((key) => deletePublicDerivativeObject(key));
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const deadlineAt = startedAt + (dependencies.deadlineMs ?? 45_000);
  const receipt: MediaOrphanSweepReceipt = {
    listed: 0,
    eligible: 0,
    referenced: 0,
    deleted: 0,
    failed: 0,
    pages: 0,
    durationMs: 0,
    deadlineReached: false,
  };

  let continuationToken: string | null = null;
  do {
    if (now() > deadlineAt) {
      receipt.deadlineReached = true;
      break;
    }
    const page: PublicDerivativeObjectListing = await list({
      prefix: MEDIA_ORPHAN_SWEEP_PREFIX,
      continuationToken,
      maxKeys: PAGE_SIZE,
    });
    receipt.pages += 1;
    receipt.listed += page.objects.length;
    const eligible = page.objects.filter(
      (object) =>
        object.lastModified !== null &&
        now() - object.lastModified.getTime() >= MEDIA_ORPHAN_MIN_AGE_MS,
    );
    receipt.eligible += eligible.length;
    if (eligible.length > 0) {
      const referenced = await referencedKeys(
        executor,
        eligible.map((object) => primaryKeyOf(object.key)),
      );
      for (const object of eligible) {
        const primary = primaryKeyOf(object.key);
        if (referenced.has(object.key) || referenced.has(primary)) {
          receipt.referenced += 1;
          continue;
        }
        if (now() > deadlineAt) {
          receipt.deadlineReached = true;
          break;
        }
        try {
          await remove(object.key);
          receipt.deleted += 1;
        } catch {
          receipt.failed += 1;
        }
      }
    }
    continuationToken = receipt.deadlineReached
      ? null
      : page.nextContinuationToken;
  } while (continuationToken);

  receipt.durationMs = now() - startedAt;
  return receipt;
}

/** `derivatives/<id>/<gen>-1280.webp` → `derivatives/<id>/<gen>.webp`. */
export function primaryKeyOf(key: string): string {
  return key.replace(/-(?:1280|480)\.webp$/, ".webp");
}

async function referencedKeys(
  executor: QueryExecutor,
  primaryKeys: readonly string[],
): Promise<Set<string>> {
  const referenced = new Set<string>();
  const unique = [...new Set(primaryKeys)];
  for (let offset = 0; offset < unique.length; offset += DELETE_BATCH) {
    const chunk = unique.slice(offset, offset + DELETE_BATCH);
    const rows = await executor
      .selectFrom("media_assets")
      .select(["id", "derivative_key"])
      .where("derivative_key", "in", chunk)
      .execute();
    const extras = await readMediaVariantExtras(
      executor,
      rows.map((row) => row.id),
    );
    for (const row of rows) {
      if (!row.derivative_key) continue;
      for (const key of expandDerivativeObjectKeys(
        row.derivative_key,
        extras.get(row.id)?.variantLongEdges,
      )) {
        referenced.add(key);
      }
    }
  }
  return referenced;
}
