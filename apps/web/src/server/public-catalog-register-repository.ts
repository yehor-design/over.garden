import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import { catalogVernacularNameSql } from "@/server/catalog-address-sql";
import { normalizedSearchPrefix } from "@/server/public-catalog-browse-repository";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * A registered form of one species, as the register itself names it
 * (ADR-0029 D13 item 4, OVE-433).
 *
 * The register number is the fact a card cannot show usefully on its own and a
 * reader cannot find any other way: it is what a seed packet, a tender
 * document and a state decision all quote. It used to be *in* the address —
 * `advance-ua-register-09040016` — which OVE-429 took out, because an address
 * is a name. This is where it belongs instead.
 */
export interface CatalogRegisterForm {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly registeredUa: boolean;
  readonly registeredEu: boolean;
  readonly uaRegisterNumber: string | null;
  readonly euCatalogueReference: string | null;
}

export interface CatalogRegisterHub {
  readonly speciesId: string;
  /** The species' accepted name. */
  readonly speciesName: string;
  /** Its name in the reader's language when the catalogue holds one. */
  readonly speciesDisplayName: string;
  /** Plants have cultivars and animals breeds: the page says which. */
  readonly speciesKingdom: string | null;
  readonly speciesSlug: string;
  readonly speciesPath: string;
  /** Every public form of the species, whatever the reader searched for. */
  readonly total: number;
  readonly registeredUa: number;
  readonly registeredEu: number;
  /** What the reader searched for, normalized; empty when nothing. */
  readonly query: string;
  /** How many forms the search leaves: `total` when there is none. */
  readonly matching: number;
  readonly page: number;
  readonly pageCount: number;
  /** One page of what the search leaves, alphabetically. */
  readonly forms: readonly CatalogRegisterForm[];
}

/**
 * A page of a register (`OVE-497`). The tomato has 621 forms and the largest
 * species over four thousand; one table of all of them was the page.
 */
export const CATALOG_REGISTER_PAGE_SIZE = 100;

/**
 * A species' registered forms, or `null` when the species has none.
 *
 * `null` rather than an empty hub: a page listing nothing is an empty listing,
 * and the honest answer for a species nobody has registered a cultivar of is a
 * 404 rather than a page saying zero (ADR-0022 D3).
 *
 * The relation is `form_of` in `catalog_item_relations`, not
 * `parent_catalog_item_id` — no cultivar in production has a parent, and
 * reading the column instead of the relation is how the first draft of this
 * query returned nothing at all for every species.
 */
export async function getCatalogRegisterHub(
  speciesSlug: string,
  options: {
    query?: string;
    page?: number;
    locale?: string;
  } = {},
  executor: QueryExecutor = db,
): Promise<CatalogRegisterHub | null> {
  const query = normalizedSearchPrefix(options.query ?? "");
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const species = await executor
    .selectFrom("catalog_items")
    .select([
      "catalog_items.id as id",
      "catalog_items.canonical_name as name",
      "catalog_items.public_slug as slug",
      "catalog_items.kingdom as kingdom",
      catalogVernacularNameSql("catalog_items", options.locale ?? "uk").as(
        "displayName",
      ),
    ])
    .where("catalog_items.public_slug", "=", speciesSlug)
    .where("catalog_items.node_kind", "=", "taxon")
    .where("catalog_items.merged_into_catalog_item_id", "is", null)
    .executeTakeFirst();
  if (!species?.slug) return null;

  // Every public form of the species: the same rows the card counts, and
  // never a node a gardener created for themselves.
  const formsOfSpecies = () =>
    executor
      .selectFrom("catalog_item_relations as relation")
      .innerJoin(
        "catalog_items as form",
        "form.id",
        "relation.from_catalog_item_id",
      )
      .where("relation.relation_type", "=", "form_of")
      .where("relation.to_catalog_item_id", "=", species.id)
      .where("form.public_slug", "is not", null)
      .where("form.merged_into_catalog_item_id", "is", null)
      .where("form.identity_state", "=", "active")
      .where("form.created_by_user_id", "is", null);

  const counts = await formsOfSpecies()
    .select(({ fn }) => [
      fn.countAll<string>().as("total"),
      sql<string>`count(*) filter (where form.registered_ua)`.as(
        "registeredUa",
      ),
      sql<string>`count(*) filter (where form.registered_eu)`.as(
        "registeredEu",
      ),
      // A name typed any way finds it anywhere in the name: a cultivar is
      // remembered by a word of it ("пунто"), not by how it begins.
      sql<string>`count(*) filter (where ${
        query ? sql`form.normalized_name like ${`%${query}%`}` : sql`true`
      })`.as("matching"),
    ])
    .executeTakeFirst();
  const total = Number(counts?.total ?? 0);
  if (total === 0) return null;
  const matching = Number(counts?.matching ?? 0);
  const pageCount = Math.max(
    1,
    Math.ceil(matching / CATALOG_REGISTER_PAGE_SIZE),
  );

  const rows = await formsOfSpecies()
    .select([
      "form.id as id",
      "form.canonical_name as name",
      "form.public_slug as publicSlug",
      "form.registered_ua as registeredUa",
      "form.registered_eu as registeredEu",
      sql<string | null>`(
        select identifier.value
        from catalog_item_identifiers as identifier
        where identifier.catalog_item_id = form.id
          and identifier.scheme = 'ua_register'
        order by identifier.value
        limit 1
      )`.as("uaRegisterNumber"),
      sql<string | null>`(
        select identifier.value
        from catalog_item_identifiers as identifier
        where identifier.catalog_item_id = form.id
          and identifier.scheme = 'eu_common_catalogue'
        order by identifier.value
        limit 1
      )`.as("euCatalogueReference"),
    ])
    .$if(query.length > 0, (select) =>
      select.where("form.normalized_name", "like", `%${query}%`),
    )
    .orderBy("form.canonical_name", "asc")
    .orderBy("form.id", "asc")
    .limit(CATALOG_REGISTER_PAGE_SIZE)
    .offset((page - 1) * CATALOG_REGISTER_PAGE_SIZE)
    .execute();

  const forms = rows.map((row) => ({
    id: row.id,
    name: row.name,
    registeredUa: row.registeredUa === true,
    registeredEu: row.registeredEu === true,
    uaRegisterNumber: row.uaRegisterNumber,
    euCatalogueReference: row.euCatalogueReference,
    path: publicCatalogEvidencePath({
      catalogKind: "plant_variety",
      publicSlug: row.publicSlug!,
      speciesSlug: species.slug,
    }),
  }));

  return {
    speciesId: species.id,
    speciesName: species.name,
    speciesDisplayName: species.displayName ?? species.name,
    speciesKingdom: species.kingdom ?? null,
    speciesSlug: species.slug,
    speciesPath: publicCatalogEvidencePath({
      catalogKind: "species",
      publicSlug: species.slug,
      speciesSlug: null,
    }),
    total,
    registeredUa: Number(counts?.registeredUa ?? 0),
    registeredEu: Number(counts?.registeredEu ?? 0),
    query,
    matching,
    page,
    pageCount,
    forms,
  };
}

/**
 * Whether `/species/{species}/register` is a page, in one indexed read.
 *
 * The proxy asks this before the shell streams, because a hub for a species
 * nobody has registered a form of is a 404 and `notFound()` in the route can
 * no longer say so (ADR-0029 D3). It is the existence half of
 * `getCatalogRegisterHub` with nothing loaded: the species by its slug, and
 * one public form of it.
 */
export async function hasCatalogRegisterHub(
  speciesSlug: string,
  executor: QueryExecutor = db,
): Promise<boolean> {
  const row = await executor
    .selectFrom("catalog_items as species")
    .select("species.id")
    .where("species.public_slug", "=", speciesSlug)
    .where("species.node_kind", "=", "taxon")
    .where("species.merged_into_catalog_item_id", "is", null)
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom("catalog_item_relations as relation")
          .innerJoin(
            "catalog_items as form",
            "form.id",
            "relation.from_catalog_item_id",
          )
          .select("relation.from_catalog_item_id")
          .whereRef("relation.to_catalog_item_id", "=", "species.id")
          .where("relation.relation_type", "=", "form_of")
          .where("form.public_slug", "is not", null)
          .where("form.merged_into_catalog_item_id", "is", null)
          .where("form.identity_state", "=", "active")
          .where("form.created_by_user_id", "is", null),
      ),
    )
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * Every species that has a register hub, for the sitemap and the browse root.
 *
 * Ordered by how many forms each holds, because that is the order in which
 * they are worth reading and worth crawling.
 */
export async function listCatalogRegisterHubSpecies(
  limit = 500,
  executor: QueryExecutor = db,
): Promise<
  readonly { slug: string; name: string; total: number; latestChange: Date }[]
> {
  const rows = await executor
    .selectFrom("catalog_item_relations as relation")
    .innerJoin("catalog_items as form", "form.id", "relation.from_catalog_item_id")
    .innerJoin("catalog_items as species", "species.id", "relation.to_catalog_item_id")
    .select(({ fn }) => [
      "species.public_slug as slug",
      "species.canonical_name as name",
      fn.count<string>("form.id").as("total"),
      fn.max("form.content_updated_at").as("latestChange"),
    ])
    .where("relation.relation_type", "=", "form_of")
    .where("species.node_kind", "=", "taxon")
    .where("species.public_slug", "is not", null)
    .where("species.merged_into_catalog_item_id", "is", null)
    .where("form.public_slug", "is not", null)
    .where("form.merged_into_catalog_item_id", "is", null)
    .where("form.identity_state", "=", "active")
    .where("form.created_by_user_id", "is", null)
    .groupBy(["species.public_slug", "species.canonical_name"])
    .orderBy(({ fn }) => fn.count("form.id"), "desc")
    .orderBy("species.canonical_name", "asc")
    .limit(limit)
    .execute();

  return rows.flatMap((row) =>
    row.slug
      ? [
          {
            slug: row.slug,
            name: row.name,
            total: Number(row.total),
            latestChange: new Date(row.latestChange ?? Date.now()),
          },
        ]
      : [],
  );
}
