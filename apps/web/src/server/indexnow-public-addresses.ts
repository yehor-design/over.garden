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
import { isCatalogItemPublished } from "@/server/catalog-publication";
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
 * A published entry, at the one address it has (D9): `/@{handle}/post/{n}`.
 *
 * Nothing is announced for an entry without a number, or whose author has no
 * current handle, because then the entry has no canonical address to send
 * anybody to — and announcing one of its older spellings would ask an engine
 * to fetch a redirect.
 */
export function announceJournalEntry(input: {
  ownerUserId: string | null | undefined;
  entryNumber: number | null | undefined;
}): void {
  // `afterResponse`, not a bare promise: the read below has to survive the
  // response, and on this platform an unawaited promise does not.
  afterResponse(async () => {
    const { ownerUserId, entryNumber } = input;
    if (!ownerUserId || !entryNumber) return;
    const handle = await getPublicAuthorHandle(ownerUserId);
    if (!handle) return;
    announcePublicUrlsToIndexNow([publicJournalEntryPath(handle, entryNumber)]);
  });
}

/**
 * A species page, but only while it is published (`OVE-519`).
 *
 * An unpublished page is `noindex` — the catalogue has a hundred thousand of
 * them — so announcing every revalidation would ask two search engines to
 * fetch a page that tells them not to index it. A page is announceable while
 * the publication rule holds for it (`catalog-publication.ts`), which is
 * exactly what its `robots` reads.
 */
export function announceCatalogCard(
  catalogItemId: string,
  executor: QueryExecutor = db,
): void {
  afterResponse(async () => {
    const path = await publishedSpeciesPagePath(catalogItemId, executor);
    if (path) announcePublicUrlsToIndexNow([path]);
  });
}

/**
 * The species pages a published entry is on: its object's species or form,
 * and a form's species (`OVE-519`). The first public entry is what publishes
 * a page, and a published page whose list just changed is a page announced.
 */
export function announceSpeciesPagesOfObject(
  plantObjectId: string | null | undefined,
  executor: QueryExecutor = db,
): void {
  if (!plantObjectId) return;
  afterResponse(async () => {
    const items = await executor
      .selectFrom("plant_objects")
      .leftJoin("catalog_item_relations as object_form", (join) =>
        join
          .onRef(
            "object_form.from_catalog_item_id",
            "=",
            "plant_objects.catalog_item_id",
          )
          .on("object_form.relation_type", "=", "form_of"),
      )
      .select([
        "plant_objects.catalog_item_id as itemId",
        "object_form.to_catalog_item_id as speciesId",
      ])
      .where("plant_objects.id", "=", plantObjectId)
      .where("plant_objects.variety_state", "=", "selected")
      .execute();
    const ids = [
      ...new Set(
        items.flatMap((row) =>
          [row.itemId, row.speciesId].filter(
            (id): id is string => typeof id === "string",
          ),
        ),
      ),
    ];
    const paths = (
      await Promise.all(ids.map((id) => publishedSpeciesPagePath(id, executor)))
    ).filter((path): path is string => path !== null);
    if (paths.length > 0) announcePublicUrlsToIndexNow(paths);
  });
}

async function publishedSpeciesPagePath(
  catalogItemId: string,
  executor: QueryExecutor,
): Promise<string | null> {
  const row = await executor
    .selectFrom("catalog_items")
    .select([
      "catalog_items.public_slug as publicSlug",
      catalogKindSql("catalog_items").as("catalogKind"),
      catalogSpeciesSlugSql("catalog_items").as("speciesSlug"),
    ])
    .where("catalog_items.id", "=", catalogItemId)
    .where("catalog_items.merged_into_catalog_item_id", "is", null)
    .executeTakeFirst();
  if (!row?.publicSlug) return null;
  if (!(await isCatalogItemPublished(catalogItemId, executor))) return null;
  return publicCatalogEvidencePath({
    catalogKind: row.catalogKind ?? "plant_variety",
    publicSlug: row.publicSlug,
    speciesSlug: row.speciesSlug,
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
