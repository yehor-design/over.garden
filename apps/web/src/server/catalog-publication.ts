import "server-only";

import {
  sql,
  type Expression,
  type Kysely,
  type QueryCreator,
  type SqlBool,
  type Transaction,
} from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { publicAuthorHandleSql } from "@/server/author-handle-sql";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";

/**
 * The one rule of a species page's publication (ADR-0035, `OVE-519`):
 *
 *   a catalogue item is **published** while at least one public, active entry
 *   exists about an object whose species is it or one of its forms.
 *
 * "Public, active" is exactly what the page's own «Записи» lists — the feed's
 * rule: a public entry about an object, of the launch corpus, published, with
 * an address and an author with a handle, not deleted and not gone — so a
 * published page never shows an empty list. "About an object whose species is
 * it" is an object linked to the item by a selection
 * (`variety_state = 'selected'`); "one of its forms" follows `form_of` one
 * step, so a cultivar's entry publishes its species. Every `form_of` points at
 * a taxon, so a cultivar has no forms and its page lists its own entries only.
 *
 * It replaces "`first_hand_content_at` was ever set", which no deletion ever
 * cleared, and the owner's `indexable_override`. The page, its «Записи», the
 * sitemap, IndexNow and every organism list read it from here, never from a
 * copy.
 */

type Executor = Kysely<Database> | Transaction<Database>;

/**
 * The object behind `objectAlias` is the item's, or one of its forms': the
 * clause the publication rule and the page's list share, so the list is the
 * rule's evidence and never a second opinion about it.
 */
export function catalogItemObjectCondition(
  objectAlias: string,
  catalogItemId: Expression<string> | string,
): Expression<SqlBool> {
  const object = sql.raw(objectAlias);
  const item =
    typeof catalogItemId === "string"
      ? sql`${catalogItemId}::uuid`
      : catalogItemId;
  return sql<SqlBool>`(
    ${object}.variety_state = 'selected'
    and (
      ${object}.catalog_item_id = ${item}
      or ${object}.catalog_item_id in (
        select item_form.from_catalog_item_id
        from catalog_item_relations as item_form
        where item_form.to_catalog_item_id = ${item}
          and item_form.relation_type = 'form_of'
      )
    )
  )`;
}

/** One entry is published content, as every public listing means it. */
function publishedEntryCondition(entry: string, object: string) {
  const e = sql.raw(entry);
  const o = sql.raw(object);
  return sql<boolean>`
    ${e}.plant_object_id = ${o}.id
    and ${e}.owner_user_id = ${o}.owner_user_id
    and ${e}.visibility = 'public'
    and ${e}.lifecycle_state = 'active'
    and ${e}.public_gone_at is null
    and ${e}.public_slug is not null
    and ${e}.published_at is not null
    and ${e}.entry_scope = 'object'
    and ${publicLaunchSurfacePredicates(sql.ref(`${entry}.content_class`))}
    and ${publicAuthorHandleSql(`${entry}.owner_user_id`)} is not null
  `;
}

/**
 * True while the item behind `itemIdColumn` is published: an EXISTS over its
 * own objects and its forms' objects. For one page, or a filter on a short
 * list; a list over the whole catalogue joins `publishedCatalogItemsQuery`.
 */
export function catalogItemPublishedPredicate(
  itemIdColumn: string,
): Expression<SqlBool> {
  return sql<SqlBool>`exists (
    select 1
    from plant_objects as published_object
    join journal_entries as published_entry
      on ${publishedEntryCondition("published_entry", "published_object")}
    where ${catalogItemObjectCondition("published_object", sql.ref(itemIdColumn))}
  )`;
}

/**
 * Every published item with the time of its newest published entry — the
 * sitemap's `lastmod` and a list's "written about recently" order. Built from
 * the entries side, so it is as small as the number of items anybody wrote
 * about, whatever the size of the catalogue. A `QueryCreator` so a list can
 * hold it in a `with`.
 */
export function publishedCatalogItemsQuery(executor: QueryCreator<Database>) {
  const entryItems = executor
    .selectFrom("journal_entries as published_entry")
    .innerJoin("plant_objects as published_object", (join) =>
      join.on(publishedEntryCondition("published_entry", "published_object")),
    )
    .where("published_object.variety_state", "=", "selected")
    .where("published_object.catalog_item_id", "is not", null)
    .select([
      "published_object.catalog_item_id as catalogItemId",
      "published_entry.published_at as publishedAt",
    ]);
  const formSpecies = executor
    .selectFrom("journal_entries as published_entry")
    .innerJoin("plant_objects as published_object", (join) =>
      join.on(publishedEntryCondition("published_entry", "published_object")),
    )
    .innerJoin(
      "catalog_item_relations as published_form",
      "published_form.from_catalog_item_id",
      "published_object.catalog_item_id",
    )
    .where("published_object.variety_state", "=", "selected")
    .where("published_form.relation_type", "=", "form_of")
    .select([
      "published_form.to_catalog_item_id as catalogItemId",
      "published_entry.published_at as publishedAt",
    ]);
  return (
    executor
      .selectFrom(entryItems.unionAll(formSpecies).as("published"))
      .select(({ fn }) => [
        "published.catalogItemId",
        fn.max("published.publishedAt").as("latestPublishedAt"),
      ])
      .groupBy("published.catalogItemId")
      // Every row has a published entry, so neither is null.
      .$narrowType<{ catalogItemId: string; latestPublishedAt: Date }>()
  );
}

/** Whether one item is published right now. */
export async function isCatalogItemPublished(
  catalogItemId: string,
  executor: Executor = db,
): Promise<boolean> {
  const result = await sql<{ published: boolean }>`
    select ${catalogItemPublishedPredicate("target.id")} as published
    from (select ${catalogItemId}::uuid as id) as target
  `.execute(executor);
  return result.rows[0]?.published === true;
}
