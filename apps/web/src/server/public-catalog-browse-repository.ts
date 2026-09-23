import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  CATALOG_BROWSE_KINGDOMS,
  CATALOG_BROWSE_PAGE_SIZE,
  CATALOG_BROWSE_RANKS,
  CATALOG_BROWSE_REGISTERS,
  initialOfCatalogName,
  type CatalogBrowseInitial,
  type CatalogBrowseKingdom,
  type CatalogBrowseRank,
  type CatalogBrowseRegister,
  type PublicCatalogBrowseRequest,
} from "@/lib/public-catalog-browse";
import { normalizeCatalogName } from "@/lib/catalog/normalize-name";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import type { PublicLocale } from "@/lib/public-localization";
import {
  catalogSpeciesNameSql,
  catalogSpeciesSlugSql,
} from "@/server/catalog-address-sql";
import { catalogKindSql } from "@/server/catalog-kind-sql";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * The one catalogue listing (`OVE-451`).
 *
 * Every view of the catalogue — the root, a kingdom, a letter, a register, the
 * organisms gardeners here have written about — is this one statement with
 * different predicates. That is the point of merging the doors: one query to
 * reason about, one index to serve it, one latency number to record.
 *
 * Two things about the rows it may show, and both are contracts rather than
 * conveniences:
 *
 * - **A slug makes a row addressable; a merged row is a redirect** (ADR-0026
 *   D8). Both predicates are constant on every statement here, which is why
 *   the index is partial on exactly them.
 * - **Listing an organism does not make it indexable.** A source-only node
 *   stays `noindex` until a gardener publishes on it or the owner marks it
 *   (ADR-0026 D9). `hasFirstHandContent` is carried on the card so the page
 *   can say so; nothing here changes the indexing decision, which
 *   `public-surface-indexing-policy` owns.
 */

export interface CatalogBrowseKingdomSummary {
  readonly kingdom: CatalogBrowseKingdom;
  readonly total: number;
  readonly initials: readonly {
    initial: CatalogBrowseInitial;
    total: number;
  }[];
}

export interface CatalogBrowseCard {
  readonly id: string;
  readonly name: string;
  /** The name in the reader's language, when the catalogue holds one. */
  readonly vernacularName: string | null;
  readonly path: string;
  readonly rank: string | null;
  readonly kingdom: CatalogBrowseKingdom | null;
  /** The market registers this organism is attached to. */
  readonly registers: readonly CatalogBrowseRegister[];
  readonly hasFirstHandContent: boolean;
  /**
   * The species a cultivar, variety, subspecies or breed belongs to, in the
   * reader's language when the catalogue holds it (`OVE-496`). Null for a
   * species, and for a form with no species yet.
   */
  readonly speciesName: string | null;
  /** The organism's own slug: what adding it to a garden carries. */
  readonly publicSlug: string;
}

export interface CatalogBrowsePage {
  readonly cards: readonly CatalogBrowseCard[];
  readonly total: number;
  readonly pageCount: number;
}

export interface CatalogBrowseFacetCounts {
  readonly kingdoms: Readonly<Partial<Record<CatalogBrowseKingdom, number>>>;
  readonly ranks: Readonly<Partial<Record<CatalogBrowseRank, number>>>;
  readonly registers: Readonly<Record<CatalogBrowseRegister, number>>;
  readonly grown: number;
  readonly initials: Readonly<Partial<Record<CatalogBrowseInitial, number>>>;
  readonly total: number;
}

const KINGDOM_SET = new Set<string>(CATALOG_BROWSE_KINGDOMS);

/**
 * Runs one catalogue read with JIT compilation off (`OVE-496`).
 *
 * The planner prices a name search — a prefix on the organism or on any of its
 * names — far above what it costs, which crosses Postgres' JIT threshold
 * (`jit_above_cost`, 100 000, production's too), and compiling then costs
 * more than the read. Measured in production (114 669 catalogue rows;
 * read-only `EXPLAIN ANALYZE`): the count behind a search for «томат» among
 * plants took 933 ms with JIT and 58 ms without, the whole search 1 188 ms
 * against 189 ms. Reads without a name stay under the threshold and are
 * unchanged; they come through here as well, so no read has to be sorted
 * into one kind or the other. `set local` ends with the transaction, so a
 * pooled connection carries nothing over; inside a caller's transaction it is
 * set there.
 */
async function withoutJit<T>(
  executor: QueryExecutor,
  read: (executor: QueryExecutor) => Promise<T>,
): Promise<T> {
  if (executor.isTransaction) {
    await sql`set local jit = off`.execute(executor);
    return read(executor);
  }
  return executor.transaction().execute(async (trx) => {
    await sql`set local jit = off`.execute(trx);
    return read(trx);
  });
}

/**
 * The rows any catalogue view may show, before the reader's own filters.
 *
 * `$if` rather than a string of `where`s so the predicate set is exactly the
 * request: an absent facet adds nothing to the statement, which is what lets
 * the unfiltered root be an index-ordered range scan.
 */
function catalogBrowseBase(
  executor: QueryExecutor,
  request: PublicCatalogBrowseRequest,
  options: {
    ignore?: "kingdom" | "rank" | "register" | "grown" | "letter";
  } = {},
) {
  const initial = request.initial;
  return executor
    .selectFrom("catalog_items")
    .where("catalog_items.public_slug", "is not", null)
    .where("catalog_items.merged_into_catalog_item_id", "is", null)
    .$if(request.kingdoms.length > 0 && options.ignore !== "kingdom", (query) =>
      query.where("catalog_items.kingdom", "in", [...request.kingdoms]),
    )
    .$if(request.ranks.length > 0 && options.ignore !== "rank", (query) =>
      query.where("catalog_items.rank", "in", [...request.ranks]),
    )
    .$if(
      request.registers.length > 0 && options.ignore !== "register",
      (query) =>
        query.where((eb) =>
          eb.or(
            request.registers.map((register) =>
              register === "ua"
                ? eb("catalog_items.registered_ua", "=", true)
                : eb("catalog_items.registered_eu", "=", true),
            ),
          ),
        ),
    )
    .$if(request.grown && options.ignore !== "grown", (query) =>
      query.where((eb) =>
        eb.or([
          eb("catalog_items.first_hand_content_at", "is not", null),
          eb("catalog_items.indexable_override", "=", true),
        ]),
      ),
    )
    .$if(initial === "#" && options.ignore !== "letter", (query) =>
      query.where(
        sql<boolean>`lower(left(catalog_items.canonical_name, 1)) !~ '^[a-z]$'`,
      ),
    )
    .$if(
      Boolean(initial) && initial !== "#" && options.ignore !== "letter",
      (query) =>
        query.where(
          sql<boolean>`lower(left(catalog_items.canonical_name, 1)) = ${initial}`,
        ),
    )
    .$if(request.query.length > 0, (query) =>
      // The listing's own search is a prefix match on the normalized name and
      // on every name the catalogue holds for the organism — the typeahead
      // (ADR-0026 D7) is the fast path for a reader who is typing; this is the
      // one a shared `?q=` link and a scripts-off form land on.
      query.where(({ eb, or, exists, selectFrom }) =>
        or([
          eb(
            "catalog_items.normalized_name",
            "like",
            `${normalizedSearchPrefix(request.query)}%`,
          ),
          exists(
            selectFrom("catalog_item_names")
              .select("catalog_item_names.id")
              .whereRef(
                "catalog_item_names.catalog_item_id",
                "=",
                "catalog_items.id",
              )
              .where(
                "catalog_item_names.normalized_name",
                "like",
                `${normalizedSearchPrefix(request.query)}%`,
              ),
          ),
        ]),
      ),
    );
}

/**
 * The query in the form every stored name is in (`catalog_normalize_name`,
 * ADR-0026 D3), so an apostrophe, a diacritic or ё/ґ typed one way finds a name
 * stored the other. It used to be lower-cased only: «м’ята» with a typographic
 * apostrophe found nothing, and neither did «помидор» spelled with ё, while
 * the typeahead found both (`OVE-496`). The wildcards are removed after
 * normalizing, because the prefix is a `like` pattern.
 */
export function normalizedSearchPrefix(query: string) {
  return normalizeCatalogName(query.slice(0, 240))
    .replaceAll("%", "")
    .replaceAll("_", "")
    .trim()
    .slice(0, 120);
}

/** One page of the catalogue, under whatever the reader has asked for. */
export async function listCatalogBrowsePage(
  request: PublicCatalogBrowseRequest,
  locale: PublicLocale,
  executor: QueryExecutor = db,
): Promise<CatalogBrowsePage> {
  return withoutJit(executor, (trx) =>
    readCatalogBrowsePage(trx, request, locale),
  );
}

async function readCatalogBrowsePage(
  executor: QueryExecutor,
  request: PublicCatalogBrowseRequest,
  locale: PublicLocale,
): Promise<CatalogBrowsePage> {
  const counted = await catalogBrowseBase(executor, request)
    .select(({ fn }) => fn.count<string>("catalog_items.id").as("total"))
    .executeTakeFirst();
  const total = Number(counted?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / CATALOG_BROWSE_PAGE_SIZE));

  if (request.page > pageCount) return { cards: [], total, pageCount };

  const rows = await catalogBrowseBase(executor, request)
    .select((eb) => [
      "catalog_items.id as id",
      "catalog_items.canonical_name as name",
      "catalog_items.public_slug as publicSlug",
      "catalog_items.rank as rank",
      "catalog_items.kingdom as kingdom",
      "catalog_items.registered_ua as registeredUa",
      "catalog_items.registered_eu as registeredEu",
      "catalog_items.first_hand_content_at as firstHandContentAt",
      "catalog_items.indexable_override as indexableOverride",
      catalogKindSql("catalog_items").as("catalogKind"),
      catalogSpeciesSlugSql("catalog_items").as("speciesSlug"),
      catalogSpeciesNameSql("catalog_items", locale).as("speciesName"),
      // The reader's own language, when the catalogue holds a name in it.
      // One correlated subquery rather than a join, because a join on a table
      // with several names per organism multiplies the page.
      eb
        .selectFrom("catalog_item_names")
        .select("catalog_item_names.display_name")
        .whereRef("catalog_item_names.catalog_item_id", "=", "catalog_items.id")
        .where("catalog_item_names.locale", "=", locale)
        .orderBy("catalog_item_names.is_primary", "desc")
        .orderBy("catalog_item_names.weight", "desc")
        .orderBy("catalog_item_names.display_name", "asc")
        .limit(1)
        .as("vernacularName"),
    ])
    // A search is answered by relevance before the chosen order (`OVE-496`):
    // the name typed exactly, then species before their forms, then what a
    // gardener here has actually written about. Alphabetical alone put
    // "1001" and every "Tomato 'X'" cultivar above the tomato itself. None of
    // it is popularity: each tier is a fact about the row.
    .$if(request.query.length > 0, (query) => {
      const exact = normalizedSearchPrefix(request.query);
      return query
        .orderBy(
          sql<boolean>`(
            catalog_items.normalized_name = ${exact}
            or exists (
              select 1 from catalog_item_names as exact_name
              where exact_name.catalog_item_id = catalog_items.id
                and exact_name.normalized_name = ${exact}
            )
          )`,
          "desc",
        )
        .orderBy(
          sql<boolean>`(catalog_items.rank is not distinct from 'species')`,
          "desc",
        )
        .orderBy(
          sql<boolean>`(
            catalog_items.first_hand_content_at is not null
            or catalog_items.indexable_override is true
          )`,
          "desc",
        );
    })
    .$if(request.sort === "written", (query) =>
      query
        .orderBy("catalog_items.first_hand_content_at", "desc")
        .orderBy("catalog_items.canonical_name", "asc"),
    )
    .$if(request.sort !== "written", (query) =>
      query.orderBy("catalog_items.canonical_name", "asc"),
    )
    .orderBy("catalog_items.id", "asc")
    .limit(CATALOG_BROWSE_PAGE_SIZE)
    .offset((request.page - 1) * CATALOG_BROWSE_PAGE_SIZE)
    .execute();

  return {
    total,
    pageCount,
    cards: rows.map((row) => ({
      id: row.id,
      name: row.name,
      vernacularName: row.vernacularName ?? null,
      rank: row.rank,
      kingdom: KINGDOM_SET.has(row.kingdom ?? "")
        ? (row.kingdom as CatalogBrowseKingdom)
        : null,
      registers: [
        ...(row.registeredUa ? (["ua"] as const) : []),
        ...(row.registeredEu ? (["eu"] as const) : []),
      ],
      hasFirstHandContent:
        row.firstHandContentAt !== null || row.indexableOverride === true,
      speciesName: row.speciesName ?? null,
      publicSlug: row.publicSlug!,
      path: publicCatalogEvidencePath({
        catalogKind: row.catalogKind ?? "plant_variety",
        publicSlug: row.publicSlug!,
        speciesSlug: row.speciesSlug,
      }),
    })),
  };
}

/**
 * How many results each facet option would leave.
 *
 * A facet's own counts ignore that facet's current selection — choosing
 * *Plantae* must not make every other kingdom read zero, because the reader
 * would then have no way to see that *Animalia* holds 21 844 and switch to it.
 * Every other facet does apply, which is what makes a count a promise.
 */
export async function countCatalogBrowseFacets(
  request: PublicCatalogBrowseRequest,
  executor: QueryExecutor = db,
): Promise<CatalogBrowseFacetCounts> {
  // Six counts, each its own statement on its own connection, as before —
  // and each with JIT off, which is most of what they used to cost.
  const [kingdomRows, rankRows, initialRows, registerRow, grownRow, totalRow] =
    await Promise.all([
      withoutJit(executor, (trx) =>
        catalogBrowseBase(trx, request, { ignore: "kingdom" })
          .select(({ fn }) => [
            "catalog_items.kingdom as kingdom",
            fn.count<string>("catalog_items.id").as("total"),
          ])
          .groupBy("catalog_items.kingdom")
          .execute(),
      ),
      withoutJit(executor, (trx) =>
        catalogBrowseBase(trx, request, { ignore: "rank" })
          .select(({ fn }) => [
            "catalog_items.rank as rank",
            fn.count<string>("catalog_items.id").as("total"),
          ])
          .groupBy("catalog_items.rank")
          .execute(),
      ),
      withoutJit(executor, (trx) =>
        catalogBrowseBase(trx, request, { ignore: "letter" })
          .select(({ fn }) => [
            sql<string>`lower(left(catalog_items.canonical_name, 1))`.as(
              "initial",
            ),
            fn.count<string>("catalog_items.id").as("total"),
          ])
          .groupBy(sql`lower(left(catalog_items.canonical_name, 1))`)
          .execute(),
      ),
      withoutJit(executor, (trx) =>
        catalogBrowseBase(trx, request, { ignore: "register" })
          .select(({ fn }) => [
            fn
              .count<string>("catalog_items.id")
              .filterWhere("catalog_items.registered_ua", "=", true)
              .as("ua"),
            fn
              .count<string>("catalog_items.id")
              .filterWhere("catalog_items.registered_eu", "=", true)
              .as("eu"),
          ])
          .executeTakeFirst(),
      ),
      withoutJit(executor, (trx) =>
        catalogBrowseBase(trx, request, { ignore: "grown" })
          .select(({ fn, eb }) =>
            fn
              .count<string>("catalog_items.id")
              .filterWhere(
                eb.or([
                  eb("catalog_items.first_hand_content_at", "is not", null),
                  eb("catalog_items.indexable_override", "=", true),
                ]),
              )
              .as("grown"),
          )
          .executeTakeFirst(),
      ),
      withoutJit(executor, (trx) =>
        catalogBrowseBase(trx, request)
          .select(({ fn }) => fn.count<string>("catalog_items.id").as("total"))
          .executeTakeFirst(),
      ),
    ]);

  const kingdoms: Partial<Record<CatalogBrowseKingdom, number>> = {};
  for (const row of kingdomRows) {
    if (row.kingdom && KINGDOM_SET.has(row.kingdom)) {
      kingdoms[row.kingdom as CatalogBrowseKingdom] = Number(row.total);
    }
  }
  const ranks: Partial<Record<CatalogBrowseRank, number>> = {};
  for (const row of rankRows) {
    if (
      row.rank &&
      (CATALOG_BROWSE_RANKS as readonly string[]).includes(row.rank)
    ) {
      ranks[row.rank as CatalogBrowseRank] = Number(row.total);
    }
  }
  const initials: Partial<Record<CatalogBrowseInitial, number>> = {};
  for (const row of initialRows) {
    const initial = initialOfCatalogName(row.initial ?? "#");
    initials[initial] = (initials[initial] ?? 0) + Number(row.total);
  }

  return {
    kingdoms,
    ranks,
    initials,
    registers: {
      ua: Number(registerRow?.ua ?? 0),
      eu: Number(registerRow?.eu ?? 0),
    },
    grown: Number(grownRow?.grown ?? 0),
    total: Number(totalRow?.total ?? 0),
  };
}

/**
 * The kingdoms and their initials, in one grouped statement.
 *
 * The catalogue's root still shows the whole shape of the graph before a
 * reader has asked anything, and it is one round trip rather than 8 × 27.
 */
export async function listCatalogBrowseKingdoms(
  executor: QueryExecutor = db,
): Promise<CatalogBrowseKingdomSummary[]> {
  const rows = await withoutJit(executor, (trx) =>
    trx
      .selectFrom("catalog_items")
      .select(({ fn }) => [
        "catalog_items.kingdom as kingdom",
        sql<string>`lower(left(catalog_items.canonical_name, 1))`.as("initial"),
        fn.count<string>("catalog_items.id").as("total"),
      ])
      .where("catalog_items.public_slug", "is not", null)
      .where("catalog_items.merged_into_catalog_item_id", "is", null)
      .where("catalog_items.kingdom", "in", [...CATALOG_BROWSE_KINGDOMS])
      .groupBy([
        "catalog_items.kingdom",
        sql`lower(left(catalog_items.canonical_name, 1))`,
      ])
      .execute(),
  );

  const byKingdom = new Map<
    CatalogBrowseKingdom,
    Map<CatalogBrowseInitial, number>
  >();
  for (const row of rows) {
    const kingdom = row.kingdom as CatalogBrowseKingdom;
    const initial = initialOfCatalogName(row.initial ?? "#");
    const initials = byKingdom.get(kingdom) ?? new Map();
    initials.set(initial, (initials.get(initial) ?? 0) + Number(row.total));
    byKingdom.set(kingdom, initials);
  }

  return CATALOG_BROWSE_KINGDOMS.flatMap((kingdom) => {
    const initials = byKingdom.get(kingdom);
    if (!initials) return [];
    const entries = [...initials.entries()]
      .map(([initial, total]) => ({ initial, total }))
      .sort((left, right) => left.initial.localeCompare(right.initial));
    return [
      {
        kingdom,
        total: entries.reduce((sum, entry) => sum + entry.total, 0),
        initials: entries,
      },
    ];
  });
}

/**
 * The organisms a gardener has actually written about.
 *
 * These are the indexable cards (ADR-0026 D9), and they are not a second
 * query: they are the catalogue's own `grown=1` view, which is the point of
 * merging the doors — `/objects` listed them and `/species` did not, and there
 * was no way to say so in one place.
 */
export async function listCatalogBrowseFirstHandOrganisms(
  locale: PublicLocale,
  limit = 24,
  executor: QueryExecutor = db,
): Promise<CatalogBrowseCard[]> {
  const page = await listCatalogBrowsePage(
    {
      kingdoms: [],
      ranks: [],
      registers: [],
      grown: true,
      initial: null,
      query: "",
      sort: "written",
      page: 1,
    },
    locale,
    executor,
  );
  return page.cards.slice(0, limit);
}

export { CATALOG_BROWSE_REGISTERS };
