import "server-only";

import { sql, type Kysely, type RawBuilder, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  CatalogNodeKind,
  Database,
  PlantObjectKind,
} from "@/db/schema";
import { normalizeCatalogName } from "@/lib/catalog/normalize-name";
import { catalogKindForPickerKind } from "@/lib/garden/catalog-object-kind";
import type { CatalogPickerKind } from "@/lib/garden/entry-contracts";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import { catalogSpeciesSlugSql } from "@/server/catalog-address-sql";
import type { PublicLocale } from "@/lib/public-localization";
import { catalogKindSql } from "@/server/catalog-kind-sql";

const MAX_CATALOG_QUERY_LENGTH = 120;
const MAX_CATALOG_SUGGESTIONS = 8;
const MIN_CATALOG_QUERY_LENGTH = 2;
const MIN_CATALOG_SEARCH_MISS_LENGTH = 3;

/**
 * The trigram similarity floor, pinned in the predicate rather than inherited
 * from a session setting, so a misspelled search cannot be quietly widened.
 */
const CATALOG_TYPEAHEAD_TRIGRAM_THRESHOLD = 0.3;
/**
 * The shortest query the trigram arm is asked about.
 *
 * A two-character query has one trigram, so the `%` operator matches tens of
 * thousands of names and the recheck throws nearly all of them away. Measured
 * against production on 2026-09-07, the prefix "so" read 45,095 index entries
 * and 4,520 heap pages to contribute one row — and across all twenty-eight
 * two-character prefixes in the fingerprint fixture the arm never once changed
 * the eight rows the picker returns, while costing 214 ms of a 270 ms median.
 *
 * From three characters it earns its keep: it is what finds томат for "тома"
 * and the accepted name behind a misspelt Lycopersicon, and there it does
 * change the answer. So the arm is skipped only where it provably cannot help.
 */
const MIN_FUZZY_QUERY_LENGTH = 3;
/**
 * The largest query, in trigrams, whose fuzzy candidates come from the
 * intarray index over the stored sets (migration 0066) rather than from
 * pg_trgm's `%`.
 *
 * The candidate rule — share at least ceil(0.3 n) of the query's n trigrams —
 * is spelt out as an OR of every k-subset, and the index evaluates that tree
 * per candidate. At n = 6 it is fifteen terms and "де ба" goes from 118 to
 * 47 ms; at n = 10 it is 120 terms and "helianth" goes from 98 to 362 ms.
 * Six is where the two arms crossed on production on 2026-09-08.
 */
const MAX_INDEXED_FUZZY_TRIGRAMS = 6;
/**
 * The one deadline of the picker (ADR-0026 D7): the statement itself is
 * cancelled by Postgres at this bound, and a connection that never answers is
 * abandoned at the same bound, so the route can degrade to the own-name
 * outcome instead of waiting. The budget the route is measured against is
 * 100 ms at P95; the deadline only bounds the tail. Measured in production on
 * 2026-09-06 with the managed database, a 150 ms bound turned the heaviest
 * crop prefixes ("соняшник", 1,500 register names) into 503s at about 160 ms,
 * so the bound sits well above the budget.
 */
export const CATALOG_TYPEAHEAD_DEADLINE_MS = 400;

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * One row of the picker: one organism, its display name in the reader's
 * locale, the name that matched when it differs, the species a form belongs
 * to, and where its card lives. Nothing about sources, trust or status: a row
 * the picker offers is by construction an active canonical node.
 */
export interface CatalogSuggestion {
  id: string;
  displayName: string;
  matchedName: string | null;
  kind: CatalogPickerKind;
  parentDisplayName: string | null;
  publicPath: string | null;
  /** A species' Latin name, for the species step's row (OVE-524). */
  scientificName?: string | null;
}

export interface SelectableCatalogItem {
  id: string;
  canonicalName: string;
  publicSlug: string | null;
  /** The current slug of the species a form belongs to, for its address. */
  speciesSlug: string | null;
  catalogKind: CatalogKind;
  locale: string;
  source: string;
  /**
   * Whether the standard base (ADR-0035 D3) holds this species as a plant or
   * an animal; null for a form and for a species outside the base.
   */
  standardKind: PlantObjectKind | null;
}

export type CatalogTypeaheadState = "ready" | "empty";

export interface CatalogTypeaheadSearchOptions {
  objectKind: PlantObjectKind;
  locale?: PublicLocale;
  limit?: number;
}

export interface CatalogTypeaheadSearchResult {
  suggestions: CatalogSuggestion[];
  state: CatalogTypeaheadState;
  /** Wall time of the statement, for the `Server-Timing` header. */
  databaseMs: number;
}

export interface FindSelectableCatalogItemOptions {
  /**
   * The kind of the object the selection is for. A gardener choosing an
   * object's identity picks a species from the standard base only, as the
   * picker offers it (ADR-0035 D3), so with this set a species outside the
   * base, or held there for the other kind, is not selectable.
   */
  expectedObjectKind?: PlantObjectKind;
  /** A species must be in the standard base, for either kind. */
  standardBaseOnly?: boolean;
}

export interface CatalogSearchMissInput {
  query: string;
  locale: PublicLocale;
  objectKind: PlantObjectKind;
}

export class CatalogTypeaheadDeadlineError extends Error {
  constructor(deadlineMs: number = CATALOG_TYPEAHEAD_DEADLINE_MS) {
    super(`Catalog typeahead exceeded ${deadlineMs} ms.`);
    this.name = "CatalogTypeaheadDeadlineError";
  }
}

interface CatalogTypeaheadSqlRow {
  id: string;
  node_kind: CatalogNodeKind | string;
  public_slug: string | null;
  species_slug: string | null;
  display_name: string;
  matched_name: string;
  parent_display_name: string | null;
  match_class: number;
  base_popularity: number;
  market: boolean;
  similarity: number;
  /** The species step's statement only: the accepted Latin name. */
  scientific_name?: string | null;
}

interface CatalogTypeaheadSearchDeps {
  runStatement?: (
    statement: RawBuilder<CatalogTypeaheadSqlRow>,
  ) => Promise<CatalogTypeaheadSqlRow[]>;
}

/**
 * The picker's one statement (ADR-0026 D7).
 *
 * Prefix hits come from the `text_pattern_ops` index on `normalized_name`,
 * fuzzy hits from the trigram index on the same column; both sides read the
 * form `catalog_normalize_name` writes, and the query arrives in that form
 * from the TypeScript normalizer the shared fixture holds to the SQL one. Each
 * organism keeps its best name, then the organisms are ordered by match class
 * (exact vernacular in the reader's locale, prefix vernacular in it, exact
 * scientific, any prefix, fuzzy), the standard base's popularity, the
 * reader's market, gardener usage, the crop prior (registered forms, host
 * relations) and similarity; two active rows with one name and one kind
 * collapse to the better-ranked one until the reconciliation task merges
 * them. The object kind is applied to the node: a taxon only when the
 * standard base holds it for that kind (ADR-0035 D3), a cultivar for plants,
 * a breed for animals. Retired, merged and gardener-created rows never leave
 * the database.
 *
 * Three things about its shape were decided by measuring it against
 * production on 2026-09-07, when every prefix of соняшник answered 503:
 *
 *   * Similarity is an intersection count over stored trigram sets
 *     (migration 0065), not `similarity()` per row: pg_trgm re-tokenises the
 *     name on every call, about 26 µs on Cyrillic, and the prefix "со" has
 *     3,451 names. The count and the float4 it yields are bit for bit what
 *     pg_trgm returns — checked against every name in production.
 *   * The fuzzy arm runs only when the prefix arm cannot fill the list. A
 *     fuzzy hit ranks last by class, so once the requested number of
 *     organisms already match by prefix no fuzzy row can be offered, and the
 *     trigram scan — 45,095 index entries for "so", 130 ms for "де ба" — is
 *     skipped as a one-time filter. It also stays off below three characters.
 *   * The eight rows are chosen before they are decorated: every column the
 *     ordering reads is already in `prefix_scored`, so the four lateral joins
 *     run eight times instead of once per candidate.
 *
 * The prefix and fuzzy sides are scored separately and merged with two
 * exclusions — an organism already found by prefix, and a duplicate cluster
 * already represented by one — which is exactly the set a single window over
 * both sides would keep, because a prefix row always outranks a fuzzy row in
 * the same cluster. The cluster key compares with the "C" collation: the
 * groups are byte equality either way, and the sort no longer pays strcoll.
 */
export function buildCatalogTypeaheadStatement(input: {
  normalizedQuery: string;
  locale: PublicLocale;
  objectKind: PlantObjectKind;
  limit?: number;
}): RawBuilder<CatalogTypeaheadSqlRow> {
  const query = input.normalizedQuery;
  const prefixPattern = `${escapeLikePattern(query)}%`;
  const limit = normalizeCatalogLimit(input.limit ?? MAX_CATALOG_SUGGESTIONS);
  const locale = input.locale;
  const objectKind = input.objectKind;
  const threshold = sql.lit(CATALOG_TYPEAHEAD_TRIGRAM_THRESHOLD);
  const limitLiteral = sql.lit(limit);

  // What the picker may offer: an active canonical node nobody created by
  // hand, of the kind the object is. A species is offered only from the
  // standard base (ADR-0035 D3), which says itself whether it is a plant or an
  // animal; the rest of the catalogue stays in the database and is not
  // offered. `base` is the node's membership row, left-joined by both sides.
  // Written once, read by both sides.
  const offerable = sql`
      ci.identity_state = 'active'
        and ci.created_by_user_id is null
        and (
          (ci.node_kind = 'taxon' and base.object_kind = ${objectKind})
          or (${objectKind} = 'plant' and ci.node_kind = 'cultivar')
          or (${objectKind} = 'animal' and ci.node_kind = 'breed')
        )`;
  const baseJoin = sql`
      left join catalog_standard_species as base on base.catalog_item_id = ci.id`;
  // The organism's ranking key, shared by the duplicate window and the final
  // ordering: match class, how many people keep it (the base's popularity,
  // zero for a form), the reader's market, gardener usage, the crop prior,
  // similarity, then the identity.
  const market = sql`case when ${locale} = 'uk' then ci.registered_ua else ci.registered_eu end`;
  // Two active rows with one name and one kind are the merge backlog of the
  // reconciliation task, not two organisms: the picker shows the better-ranked
  // one until they are merged. `distinct on` the cluster, ordered by the
  // ranking key, keeps exactly the row a window's rank 1 would — and reads the
  // cluster key with the "C" collation, which is the same byte equality
  // without strcoll on every comparison of the sort.
  const scoreSelect = sql`
      select distinct on (ci.node_kind collate "C", ci.normalized_name collate "C")
             ci.id,
             ci.node_kind,
             ci.public_slug,
             ci.canonical_name,
             ci.normalized_name,
             ci.search_weight,
             ci.has_registered_forms,
             ci.is_host,
             r.matched_name,
             r.match_class,
             coalesce(base.popularity, 0) as base_popularity,
             ${market} as market,
             r.similarity`;
  const scoreOrder = sql`
      order by ci.node_kind collate "C",
               ci.normalized_name collate "C",
               r.match_class,
               coalesce(base.popularity, 0) desc,
               (${market}) desc,
               ci.search_weight desc,
               ci.has_registered_forms desc,
               ci.is_host desc,
               r.similarity desc,
               ci.id`;

  // See MIN_FUZZY_QUERY_LENGTH: below it this arm reads a large part of the
  // trigram index to contribute rows that never reach the reader.
  const fuzzy = Array.from(query).length >= MIN_FUZZY_QUERY_LENGTH;
  // The similarity a stored set yields: pg_trgm's CALCSML over the counts.
  const storedSimilarity = sql`(icount(n.search_trigrams & (select trigrams from q))::float4
             / ((select trigram_count from q) + cardinality(n.search_trigrams)
                - icount(n.search_trigrams & (select trigrams from q)))::float4)`;
  const fuzzyCtes = fuzzy
    ? sql`,
    fuzzy_hits as materialized (
      -- A typo is forgiven in the reader's language and in Latin only: «курка»
      -- is not a misspelt Bulgarian «костенурка» (a turtle), and a list that
      -- says so reads as noise (OVE-530). Exact and prefix names match in
      -- every language.
      -- A fuzzy row ranks last by class, so it can only be offered when fewer
      -- organisms than requested matched by prefix. Postgres evaluates that
      -- once and skips both scans when it is false. Which scan runs depends
      -- on the query's trigram count: up to six, the candidates come from the
      -- intarray index over the stored sets (a name can only reach the
      -- threshold if it shares ceil(0.3 n) of the query's n trigrams, spelt
      -- out by catalog_trigram_query) with a microsecond recheck; from seven,
      -- from pg_trgm's own index, whose recheck re-tokenises every candidate
      -- but whose trigrams are by then selective enough for that to be cheap.
      select n.catalog_item_id,
             n.id as name_id,
             n.display_name,
             ${storedSimilarity} as similarity
      from catalog_item_names as n
      where (select count(*) from prefix_scored) < ${limitLiteral}
        and (select trigram_count from q) <= ${sql.lit(MAX_INDEXED_FUZZY_TRIGRAMS)}
        and n.search_trigrams @@ (
          select catalog_trigram_query(trigrams, (3 * trigram_count + 9) / 10) from q
        )
        and ${storedSimilarity} >= ${threshold}
        and n.normalized_name not like ${prefixPattern}
        and n.locale in (${locale}, 'la')
      union all
      select n.catalog_item_id,
             n.id as name_id,
             n.display_name,
             similarity(n.normalized_name, ${query}) as similarity
      from catalog_item_names as n
      where (select count(*) from prefix_scored) < ${limitLiteral}
        and (select trigram_count from q) > ${sql.lit(MAX_INDEXED_FUZZY_TRIGRAMS)}
        and n.normalized_name % ${query}
        and similarity(n.normalized_name, ${query}) >= ${threshold}
        and n.normalized_name not like ${prefixPattern}
        and n.locale in (${locale}, 'la')
    ),
    fuzzy_ranked as (
      select distinct on (h.catalog_item_id)
             h.catalog_item_id,
             h.display_name as matched_name,
             h.similarity,
             4 as match_class
      from fuzzy_hits as h
      order by h.catalog_item_id, h.similarity desc, h.name_id
    ),
    fuzzy_scored as (
      ${scoreSelect}
      from fuzzy_ranked as r
      join catalog_items as ci on ci.id = r.catalog_item_id${baseJoin}
      where ${offerable}
      ${scoreOrder}
    )`
    : sql.raw("");
  const fuzzyCandidates = fuzzy
    ? sql`
      union all
      select f.id, f.node_kind, f.public_slug, f.canonical_name, f.search_weight,
             f.has_registered_forms, f.is_host, f.matched_name, f.match_class,
             f.base_popularity, f.market, f.similarity
      from fuzzy_scored as f
      -- An organism a prefix name already found keeps that name, and a
      -- cluster a prefix organism already represents is represented by it.
      where not exists (select 1 from prefix_scored as p where p.id = f.id)
        and not exists (
          select 1 from prefix_scored as p
          where p.node_kind = f.node_kind and p.normalized_name = f.normalized_name
        )`
    : sql.raw("");

  return sql<CatalogTypeaheadSqlRow>`
    with q as (
      -- The query's trigram set, once, in the compact form pg_trgm compares.
      select catalog_trigram_ints(show_trgm(${query})) as trigrams,
             cardinality(show_trgm(${query})) as trigram_count
    ),
    prefix_hits as (
      select n.catalog_item_id,
             n.id as name_id,
             n.display_name,
             n.normalized_name,
             n.name_type,
             n.locale,
             icount(n.search_trigrams & (select trigrams from q)) as shared,
             cardinality(n.search_trigrams) as trigram_count
      from catalog_item_names as n
      where n.normalized_name like ${prefixPattern}
    ),
    prefix_classified as (
      select h.catalog_item_id,
             h.name_id,
             h.display_name as matched_name,
             -- pg_trgm's CALCSML: shared over the union, as float4.
             (h.shared::float4
               / ((select trigram_count from q) + h.trigram_count - h.shared)::float4) as similarity,
             case
               when h.normalized_name = ${query}
                    and h.name_type = 'vernacular' and h.locale = ${locale} then 0
               when h.name_type = 'vernacular' and h.locale = ${locale} then 1
               when h.normalized_name = ${query}
                    and h.name_type in ('scientific_accepted', 'scientific_synonym') then 2
               else 3
             end as match_class
      from prefix_hits as h
    ),
    prefix_ranked as (
      select distinct on (c.catalog_item_id)
             c.catalog_item_id,
             c.matched_name,
             c.similarity,
             c.match_class
      from prefix_classified as c
      order by c.catalog_item_id, c.match_class, c.similarity desc, c.name_id
    ),
    prefix_scored as materialized (
      ${scoreSelect}
      from prefix_ranked as r
      join catalog_items as ci on ci.id = r.catalog_item_id${baseJoin}
      where ${offerable}
      ${scoreOrder}
    )${fuzzyCtes},
    shortlist as (
      -- The rows that survive are chosen here and decorated afterwards: the
      -- decoration below is four index searches a row, and before this CTE it
      -- ran for every candidate — 2,395 of them for соняшник.
      select *
      from (
        select p.id, p.node_kind, p.public_slug, p.canonical_name, p.search_weight,
               p.has_registered_forms, p.is_host, p.matched_name, p.match_class,
               p.base_popularity, p.market, p.similarity
        from prefix_scored as p${fuzzyCandidates}
      ) as candidates
      order by match_class,
               base_popularity desc,
               market desc,
               search_weight desc,
               has_registered_forms desc,
               is_host desc,
               similarity desc,
               canonical_name,
               id
      limit ${limitLiteral}
    )
    select s.id,
           s.node_kind,
           s.public_slug,
           -- A taxon reads by its vernacular in the reader's locale; a form
           -- reads by its denomination, the name a register lists it under.
           case
             when s.node_kind = 'taxon' then coalesce(vernacular.display_name, s.canonical_name)
             else s.canonical_name
           end as display_name,
           s.matched_name,
           case
             when parent.id is null then null
             else coalesce(parent_vernacular.display_name, parent.canonical_name)
           end as parent_display_name,
           case when parent.node_kind = 'taxon' then parent.public_slug else null end as species_slug,
           s.match_class,
           s.base_popularity,
           s.market,
           s.similarity
    from shortlist as s
    left join lateral (
      select v.display_name
      from catalog_item_names as v
      where v.catalog_item_id = s.id
        and v.name_type = 'vernacular'
        and v.locale = ${locale}
      order by v.is_primary desc, v.weight desc, v.created_at, v.id
      limit 1
    ) as vernacular on true
    -- A form's species is the target of its form_of relation (ADR-0026 D1:
    -- forms attach to a species, never as tree branches).
    left join lateral (
      select r.to_catalog_item_id
      from catalog_item_relations as r
      where r.from_catalog_item_id = s.id
        and r.relation_type = 'form_of'
      order by r.created_at, r.id
      limit 1
    ) as form on true
    left join catalog_items as parent on parent.id = form.to_catalog_item_id
    left join lateral (
      select v.display_name
      from catalog_item_names as v
      where v.catalog_item_id = parent.id
        and v.name_type = 'vernacular'
        and v.locale = ${locale}
      order by v.is_primary desc, v.weight desc, v.created_at, v.id
      limit 1
    ) as parent_vernacular on true
    order by s.match_class,
             s.base_popularity desc,
             s.market desc,
             s.search_weight desc,
             s.has_registered_forms desc,
             s.is_host desc,
             s.similarity desc,
             s.canonical_name,
             s.id
    limit ${limitLiteral}
  `;
}

/**
 * The picker read. One statement, one deadline, Postgres only; the save path
 * re-reads every selection through the selectable predicate before an
 * identity is attached, so a stale row can at most be offered.
 */
export async function searchCatalogSuggestionsForTypeaheadResult(
  query: string,
  options: CatalogTypeaheadSearchOptions,
  deps: CatalogTypeaheadSearchDeps = {},
): Promise<CatalogTypeaheadSearchResult> {
  const normalizedQuery = normalizeCatalogQuery(query);
  if (normalizedQuery.length < MIN_CATALOG_QUERY_LENGTH) {
    return { suggestions: [], state: "empty", databaseMs: 0 };
  }

  const locale = options.locale ?? "uk";
  const statement = buildCatalogTypeaheadStatement({
    normalizedQuery,
    locale,
    objectKind: options.objectKind,
    limit: options.limit,
  });
  const startedAt = performance.now();
  const rows = deps.runStatement
    ? await deps.runStatement(statement)
    : await runWithinCatalogTypeaheadDeadline(statement);
  const databaseMs = Math.max(0, performance.now() - startedAt);

  const suggestions = rows.map((row) => toCatalogSuggestion(row, locale));
  return {
    suggestions,
    state: suggestions.length > 0 ? "ready" : "empty",
    databaseMs,
  };
}

async function runWithinCatalogTypeaheadDeadline(
  statement: RawBuilder<CatalogTypeaheadSqlRow>,
  deadlineMs: number = CATALOG_TYPEAHEAD_DEADLINE_MS,
): Promise<CatalogTypeaheadSqlRow[]> {
  return db.transaction().execute(async (trx) => {
    // `set local` ends with the transaction, so the pooled connection carries
    // nothing over. Acquiring the connection is not on the clock: a cold
    // instance's first connection is not a slow catalog.
    await sql`set local statement_timeout = ${sql.lit(
      String(deadlineMs),
    )}`.execute(trx);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new CatalogTypeaheadDeadlineError(deadlineMs)),
        deadlineMs,
      );
    });
    const read = statement.execute(trx).then((result) => result.rows);
    try {
      // Postgres cancels the statement at the same bound, so a read the
      // deadline abandoned settles on its own and the rollback follows.
      return await Promise.race([read, deadline]);
    } finally {
      clearTimeout(timer);
      read.catch(() => undefined);
    }
  });
}

/**
 * The deadline of the species step's read (OVE-524). Longer than the whole
 * picker's, because the work under it is bounded by the standard base rather
 * than by the query: the statement below reads the base's own names — 5,627
 * for plants and 1,077 for animals on 2026-09-26 — and never the rest of the
 * catalogue, so no query can make it long and a generous bound cannot let a
 * slow statement pile up on the database.
 *
 * The bound exists for the first search. On 2026-09-25 the first three animal
 * searches against production answered 503: the whole-catalogue statement on
 * a fresh database backend (PgBouncer opening a server connection) spent
 * 89.6 ms planning against a cold catalog cache and 277 ms executing, against
 * 6 ms and 162–187 ms warm — over 400 ms before the network. The base-only
 * statement runs in 4 ms warm and about 60 ms on a fresh backend, measured on
 * production the next day through unpooled connections (one fresh backend
 * each); the bound is the margin for a cold buffer cache on top of that.
 */
export const STANDARD_SPECIES_TYPEAHEAD_DEADLINE_MS = 1000;

/**
 * The species step's one statement (OVE-524, ADR-0035 D3): the standard base
 * of the object's kind, searched by every name the base holds — everyday
 * names, search words and Latin names, in all three languages — and nothing
 * else. A species outside the base is found by nothing; the step's
 * «Ввести свій варіант» takes it.
 *
 * The same match classes as the whole picker's (exact vernacular in the
 * reader's locale, prefix vernacular in it, exact scientific, any prefix,
 * fuzzy), ordered by class, then by how many people keep the species, then by
 * similarity. A typo is forgiven in the reader's language and in Latin only,
 * from three characters. The base is a few hundred species, so every name of
 * it is scored from its stored trigram set: no index choice to get wrong, and
 * the same work whatever was typed.
 */
export function buildStandardSpeciesTypeaheadStatement(input: {
  normalizedQuery: string;
  locale: PublicLocale;
  objectKind: PlantObjectKind;
  limit?: number;
}): RawBuilder<CatalogTypeaheadSqlRow> {
  const query = input.normalizedQuery;
  const prefixPattern = `${escapeLikePattern(query)}%`;
  const limit = sql.lit(
    normalizeCatalogLimit(input.limit ?? MAX_CATALOG_SUGGESTIONS),
  );
  const locale = input.locale;
  const threshold = sql.lit(CATALOG_TYPEAHEAD_TRIGRAM_THRESHOLD);
  const fuzzy = sql.lit(
    Array.from(query).length >= MIN_FUZZY_QUERY_LENGTH,
  );
  return sql<CatalogTypeaheadSqlRow>`
    with q as (
      select catalog_trigram_ints(show_trgm(${query})) as trigrams,
             cardinality(show_trgm(${query})) as trigram_count
    ),
    base as materialized (
      select b.catalog_item_id, b.popularity
      from catalog_standard_species as b
      join catalog_items as ci on ci.id = b.catalog_item_id
      where b.object_kind = ${input.objectKind}
        and ci.identity_state = 'active'
        and ci.node_kind = 'taxon'
    ),
    scored as (
      select n.catalog_item_id,
             n.id as name_id,
             n.display_name,
             n.normalized_name,
             n.name_type,
             n.locale,
             -- pg_trgm's CALCSML over the stored sets (migration 0065).
             (icount(n.search_trigrams & q.trigrams)::float4
               / (q.trigram_count + cardinality(n.search_trigrams)
                  - icount(n.search_trigrams & q.trigrams))::float4) as similarity
      from base
      join catalog_item_names as n on n.catalog_item_id = base.catalog_item_id
      cross join q
    ),
    classified as (
      select s.catalog_item_id,
             s.name_id,
             s.display_name as matched_name,
             s.similarity,
             case
               when s.normalized_name = ${query}
                    and s.name_type = 'vernacular' and s.locale = ${locale} then 0
               when s.normalized_name like ${prefixPattern}
                    and s.name_type = 'vernacular' and s.locale = ${locale} then 1
               when s.normalized_name = ${query}
                    and s.name_type in ('scientific_accepted', 'scientific_synonym') then 2
               when s.normalized_name like ${prefixPattern} then 3
               when ${fuzzy}
                    and s.locale in (${locale}, 'la')
                    and s.similarity >= ${threshold} then 4
             end as match_class
      from scored as s
    ),
    ranked as (
      select distinct on (c.catalog_item_id)
             c.catalog_item_id,
             c.matched_name,
             c.similarity,
             c.match_class
      from classified as c
      where c.match_class is not null
      order by c.catalog_item_id, c.match_class, c.similarity desc, c.name_id
    )
    select ci.id,
           ci.node_kind,
           ci.public_slug,
           null::text as species_slug,
           coalesce(vernacular.display_name, ci.canonical_name) as display_name,
           r.matched_name,
           null::text as parent_display_name,
           r.match_class,
           base.popularity as base_popularity,
           false as market,
           r.similarity,
           -- The Latin name under the everyday one, without authorship.
           coalesce((
             select accepted.display_name
             from catalog_item_names as accepted
             where accepted.catalog_item_id = ci.id
               and accepted.name_type = 'scientific_accepted'
             order by accepted.is_primary desc, accepted.created_at, accepted.id
             limit 1
           ), ci.canonical_name) as scientific_name
    from ranked as r
    join base on base.catalog_item_id = r.catalog_item_id
    join catalog_items as ci on ci.id = r.catalog_item_id
    left join lateral (
      select v.display_name
      from catalog_item_names as v
      where v.catalog_item_id = ci.id
        and v.name_type = 'vernacular'
        and v.locale = ${locale}
      order by v.is_primary desc, v.weight desc, v.created_at, v.id
      limit 1
    ) as vernacular on true
    order by r.match_class,
             base.popularity desc,
             r.similarity desc,
             ci.canonical_name,
             ci.id
    limit ${limit}
  `;
}

/** The species step's read: the standard base only, under its own deadline. */
export async function searchStandardSpeciesForTypeahead(
  query: string,
  options: CatalogTypeaheadSearchOptions,
  deps: CatalogTypeaheadSearchDeps = {},
): Promise<CatalogTypeaheadSearchResult> {
  const normalizedQuery = normalizeCatalogQuery(query);
  if (normalizedQuery.length < MIN_CATALOG_QUERY_LENGTH) {
    return { suggestions: [], state: "empty", databaseMs: 0 };
  }
  const locale = options.locale ?? "uk";
  const statement = buildStandardSpeciesTypeaheadStatement({
    normalizedQuery,
    locale,
    objectKind: options.objectKind,
    limit: options.limit,
  });
  const startedAt = performance.now();
  const rows = deps.runStatement
    ? await deps.runStatement(statement)
    : await runWithinCatalogTypeaheadDeadline(
        statement,
        STANDARD_SPECIES_TYPEAHEAD_DEADLINE_MS,
      );
  const databaseMs = Math.max(0, performance.now() - startedAt);
  const suggestions = rows.map((row) => toCatalogSuggestion(row, locale));
  return {
    suggestions,
    state: suggestions.length > 0 ? "ready" : "empty",
    databaseMs,
  };
}

/** A species of the standard base held for this kind, as the object's species. */
export interface StandardSpecies {
  id: string;
  canonicalName: string;
  kingdom: string | null;
}

export async function findStandardSpecies(
  executor: QueryExecutor,
  itemId: string,
  objectKind: PlantObjectKind,
): Promise<StandardSpecies | null> {
  const row = await executor
    .selectFrom("catalog_standard_species as base")
    .innerJoin("catalog_items as ci", "ci.id", "base.catalog_item_id")
    .select(["ci.id", "ci.canonical_name as canonicalName", "ci.kingdom"])
    .where("base.catalog_item_id", "=", itemId)
    .where("base.object_kind", "=", objectKind)
    .where("ci.identity_state", "=", "active")
    .where("ci.node_kind", "=", "taxon")
    .executeTakeFirst();
  return row ?? null;
}

function toCatalogSuggestion(
  row: CatalogTypeaheadSqlRow,
  locale: PublicLocale,
): CatalogSuggestion {
  const kind = catalogPickerKindForNodeKind(row.node_kind);
  const displayName = capitalizeFirst(row.display_name, locale);
  const matched = row.matched_name;
  const matchedName =
    matched &&
    normalizeCatalogName(matched) !== normalizeCatalogName(row.display_name)
      ? matched
      : null;
  return {
    id: row.id,
    displayName,
    matchedName,
    kind,
    parentDisplayName: row.parent_display_name
      ? capitalizeFirst(row.parent_display_name, locale)
      : null,
    publicPath: row.public_slug
      ? publicCatalogEvidencePath({
          catalogKind: catalogKindForPickerKind(kind),
          publicSlug: row.public_slug,
          speciesSlug: row.species_slug,
        })
      : null,
    ...(row.scientific_name !== undefined
      ? { scientificName: row.scientific_name }
      : {}),
  };
}

export function catalogPickerKindForNodeKind(
  nodeKind: CatalogNodeKind | string,
): CatalogPickerKind {
  if (nodeKind === "cultivar" || nodeKind === "breed") return nodeKind;
  return "species";
}

function capitalizeFirst(value: string, locale: PublicLocale) {
  const [first, ...rest] = Array.from(value);
  if (!first) return value;
  return `${first.toLocaleUpperCase(locale)}${rest.join("")}`;
}

/**
 * Every query that ended without a pick, as curation input (ADR-0026 D7).
 * The text is the normalized form, at most 120 characters, keyed with the
 * locale and the object kind; a repeat only bumps the counter. The picker's
 * caller swallows failures: a miss that is not recorded costs nothing a
 * gardener can see.
 */
export function buildUpsertCatalogSearchMissQuery(
  executor: QueryExecutor,
  input: { queryNormalized: string; locale: PublicLocale; objectKind: PlantObjectKind },
) {
  return executor
    .insertInto("catalog_search_misses")
    .values({
      query_normalized: input.queryNormalized,
      locale: input.locale,
      object_kind: input.objectKind,
      occurrences: 1,
    })
    .onConflict((oc) =>
      oc
        .columns(["query_normalized", "locale", "object_kind"])
        .doUpdateSet({
          occurrences: sql<number>`catalog_search_misses.occurrences + 1`,
          last_seen_at: sql<Date>`now()`,
        }),
    )
    .returning(["query_normalized as queryNormalized", "occurrences"]);
}

export async function recordCatalogSearchMiss(
  input: CatalogSearchMissInput,
  executor: QueryExecutor = db,
): Promise<{ queryNormalized: string; occurrences: number } | null> {
  const queryNormalized = normalizeCatalogQuery(input.query);
  if (queryNormalized.length < MIN_CATALOG_SEARCH_MISS_LENGTH) return null;
  const row = await buildUpsertCatalogSearchMissQuery(executor, {
    queryNormalized,
    locale: input.locale,
    objectKind: input.objectKind,
  }).executeTakeFirst();
  return row
    ? { queryNormalized: row.queryNormalized, occurrences: Number(row.occurrences) }
    : null;
}

export async function findSelectableCatalogItem(
  executor: QueryExecutor,
  itemId: string,
  options: FindSelectableCatalogItemOptions = {},
): Promise<SelectableCatalogItem | null> {
  const normalizedId = normalizeCatalogItemId(itemId);
  if (!normalizedId) return null;

  const row = await buildFindSelectableCatalogItemQuery(
    executor,
    normalizedId,
  ).executeTakeFirst();

  if (!row) return null;

  return toSelectableCatalogItem(row, options);
}

function toSelectableCatalogItem(
  row: {
    id: string;
    canonicalName: string;
    publicSlug: string | null;
    speciesSlug: string | null;
    catalogKind: CatalogKind | string;
    locale: string;
    source: string;
    standardKind: string | null;
  },
  options: FindSelectableCatalogItemOptions,
): SelectableCatalogItem | null {
  if (
    options.expectedObjectKind &&
    !matchesCatalogKindObjectKind(row.catalogKind, options.expectedObjectKind)
  ) {
    return null;
  }
  const standardKind =
    row.standardKind === "plant" || row.standardKind === "animal" ? row.standardKind : null;
  if (row.catalogKind === "species") {
    if (options.expectedObjectKind && standardKind !== options.expectedObjectKind) return null;
    if (options.standardBaseOnly && !standardKind) return null;
  }

  return {
    id: row.id,
    canonicalName: row.canonicalName,
    publicSlug: row.publicSlug,
    speciesSlug: row.speciesSlug,
    catalogKind: row.catalogKind as CatalogKind,
    locale: row.locale,
    source: row.source,
    standardKind,
  };
}

/** The kind the standard base holds a node for, or null outside it. */
function standardKindSql(itemRef: string) {
  return sql<string | null>`(
    select base.object_kind
    from catalog_standard_species as base
    where base.catalog_item_id = ${sql.ref(`${itemRef}.id`)}
  )`;
}

export function buildFindSelectableCatalogItemQuery(
  executor: QueryExecutor,
  itemId: string,
) {
  return executor
    .selectFrom("catalog_items")
    .select([
      "id",
      "canonical_name as canonicalName",
      "public_slug as publicSlug",
      catalogSpeciesSlugSql("catalog_items").as("speciesSlug"),
      catalogKindSql("catalog_items").as("catalogKind"),
      "locale",
      "source",
      standardKindSql("catalog_items").as("standardKind"),
    ])
    .where("id", "=", itemId)
    .where("identity_state", "=", "active")
    .where("created_by_user_id", "is", null);
}

/**
 * The query in the form the stored names carry: the shared normalizer, capped
 * at the length the search-miss table accepts.
 */
export function normalizeCatalogQuery(query: string) {
  const normalized = normalizeCatalogName(
    query.slice(0, MAX_CATALOG_QUERY_LENGTH * 2),
  );
  return Array.from(normalized).slice(0, MAX_CATALOG_QUERY_LENGTH).join("");
}

/** A gardener's own name as it is stored on the object: text, 1–120 chars. */
export function normalizeCatalogLabel(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 1) {
    throw new Error("Own catalog name is required.");
  }
  if (normalized.length > MAX_CATALOG_QUERY_LENGTH) {
    throw new Error("Own catalog name must be 120 characters or fewer.");
  }
  return normalized;
}

export function normalizeCatalogItemId(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : null;
}

function normalizeCatalogLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_CATALOG_SUGGESTIONS;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CATALOG_SUGGESTIONS);
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function matchesCatalogKindObjectKind(
  catalogKind: CatalogKind | string,
  objectKind: PlantObjectKind,
) {
  if (catalogKind === "breed") return objectKind === "animal";
  if (catalogKind === "plant_variety") return objectKind === "plant";
  // A species record has no independent object-kind field: it is selectable
  // by a plant and by an animal alike.
  return catalogKind === "species";
}
