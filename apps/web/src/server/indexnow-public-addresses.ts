import "server-only";

import type { Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import {
  publicCommunityPath,
  publicJournalEntryPath,
} from "@/lib/garden/public-paths";
import { catalogKindSql } from "@/server/catalog-kind-sql";
import { catalogSpeciesSlugSql } from "@/server/catalog-address-sql";
import { getPublicAuthorHandle } from "@/server/author-handle-repository";
import {
  afterResponse,
  announcePublicUrlsToIndexNow,
} from "@/server/indexnow-announcer";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * Which address a mutation should announce, and whether it may be announced at
 * all (ADR-0029 D13 item 6, OVE-434).
 *
 * The announcer is transport: it takes URLs and posts them. Deciding *which*
 * URLs is a product question with one hard rule — **nothing `noindex` is
 * submitted** — and that rule needs to know things a tag does not carry. It
 * lives here so every mutation asks the same question rather than each
 * answering it from memory.
 *
 * Every function is fire-and-forget and swallows its own failures: an engine
 * being down, or a read for an address failing, must not turn a gardener's
 * publish into an error.
 */

/**
 * A published entry, at the one address it has (D9).
 *
 * Nothing is announced for an entry that is not public — no `public_slug` —
 * or whose author has no current handle, because then the entry has no
 * canonical address to send anybody to.
 */
export function announceJournalEntry(input: {
  ownerUserId: string | null | undefined;
  publicSlug: string | null | undefined;
}): void {
  // `afterResponse`, not a bare promise: the read below has to survive the
  // response, and on this platform an unawaited promise does not.
  afterResponse(async () => {
    if (!input.ownerUserId || !input.publicSlug) return;
    const handle = await getPublicAuthorHandle(input.ownerUserId);
    if (!handle) return;
    announcePublicUrlsToIndexNow([
      publicJournalEntryPath(handle, input.publicSlug),
    ]);
  });
}

/**
 * An organism card, but only once it is indexable.
 *
 * ADR-0026 D9 keeps a card built only from sources `noindex` — a hundred
 * thousand pages reading "*Bactrocera dorsalis* — вид" is thin content — so
 * announcing every card revalidation would ask two search engines to fetch a
 * page that tells them not to index it. The card becomes announceable the day
 * a gardener publishes on it (`first_hand_content_at`) or the owner marks it
 * indexable, which is exactly the condition the indexing policy reads.
 */
export function announceCatalogCard(
  catalogItemId: string,
  executor: QueryExecutor = db,
): void {
  afterResponse(async () => {
    const row = await executor
      .selectFrom("catalog_items")
      .select([
        "catalog_items.public_slug as publicSlug",
        "catalog_items.first_hand_content_at as firstHandContentAt",
        "catalog_items.indexable_override as indexableOverride",
        catalogKindSql("catalog_items").as("catalogKind"),
        catalogSpeciesSlugSql("catalog_items").as("speciesSlug"),
      ])
      .where("catalog_items.id", "=", catalogItemId)
      .where("catalog_items.merged_into_catalog_item_id", "is", null)
      .executeTakeFirst();
    if (!row?.publicSlug) return;
    const indexable =
      row.firstHandContentAt !== null || row.indexableOverride === true;
    if (!indexable) return;

    announcePublicUrlsToIndexNow([
      publicCatalogEvidencePath({
        catalogKind: row.catalogKind ?? "plant_variety",
        publicSlug: row.publicSlug,
        speciesSlug: row.speciesSlug,
      }),
    ]);
  });
}

/**
 * A community, whose page changed because somebody joined, contributed or a
 * contribution was withdrawn.
 *
 * A community with nothing on it is an empty listing and therefore `noindex`,
 * but a mutation that invalidated its cache has just put something on it or
 * taken something off — and the repeat window folds a run of them into one
 * submission either way.
 */
export function announceCommunity(slug: string): void {
  if (!slug) return;
  announcePublicUrlsToIndexNow([publicCommunityPath(slug)]);
}
