import "server-only";

import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import type { Database } from "@/db/schema";

/**
 * Write the standard species base into the graph (OVE-530, ADR-0035 D3).
 *
 * The base is a file the generator built from open sources; this pass makes
 * the database agree with it, and nothing else:
 *
 * 1. every row finds its catalogue organism by identifier — Wikidata, GBIF,
 *    Catalogue of Life, WFO, and EPPO for a species — then by its scientific
 *    name within its kingdom; a plant the catalogue lacks is materialized from
 *    the Catalogue of Life checklist, and anything else is created from the
 *    row itself under its parent;
 * 2. membership lands in `catalog_standard_species`, with the row's group and
 *    popularity;
 * 3. in uk, bg and ru the everyday name becomes the organism's one primary
 *    vernacular and the search words become vernacular names; the Latin
 *    synonyms become scientific synonyms. Every row the base writes, and every
 *    row it changes, is recorded in `catalog_standard_species_names` with what
 *    it was before.
 *
 * It is idempotent: a second run over the same file finds every name as it
 * wants it and writes nothing but the source snapshot's `verified_at`. A run
 * over a newer file keeps what still applies and takes back the rest —
 * deleting the rows the base wrote and restoring the rows it changed — so a
 * name a source import wrote is never lost to the base.
 *
 * Everything happens in one transaction; a dry run rolls it back after
 * counting.
 */

type Lang = "uk" | "bg" | "ru";
type NameLocale = Lang | "la";
type NameRole = "display" | "search" | "latin_synonym" | "demoted";
type ReviewStatus = "confirmed" | "review" | "single_source";
const LANGS: readonly Lang[] = ["uk", "bg", "ru"];

export const STANDARD_SPECIES_SOURCE_SLUG = "overgarden-standard-species";
export const STANDARD_SPECIES_PARSER_VERSION = "ove530.standardSpecies.v1";
/** Far above any source import's weight (2 at most in production, 2026-09-26). */
export const STANDARD_DISPLAY_WEIGHT = 20;
export const STANDARD_SEARCH_WEIGHT = 5;
const STANDARD_LATIN_SYNONYM_WEIGHT = 1;

export interface StandardSpeciesFile {
  version: string;
  rows: StandardSpeciesFileRow[];
}

export interface StandardSpeciesFileRow {
  key: string;
  kind: "plant" | "animal";
  group: string;
  latin: string;
  rank: string;
  wikidata: string;
  identifiers: {
    gbif: string | null;
    col: string | null;
    wfo: string | null;
    eppo: string[];
  };
  parentLatin: string | null;
  names: Record<
    Lang,
    { display: string; search: string[]; status: ReviewStatus }
  >;
  popularity: { registerCultivars: number; pageviews: Record<Lang, number> };
  latinSynonyms?: string[];
}

export interface StandardSpeciesLoadSummary {
  version: string;
  payloadSha256: string;
  rows: number;
  resolvedByIdentifier: number;
  resolvedByName: number;
  materializedFromCol: number;
  created: number;
  unresolved: string[];
  /** Rows found by name, made from the checklist, or created — for review. */
  resolvedByNameKeys: string[];
  materializedKeys: string[];
  createdKeys: string[];
  duplicateOrganisms: string[];
  identifierConflicts: string[];
  identifiersWritten: number;
  addressesAssigned: number;
  membershipsWritten: number;
  membershipsRemoved: number;
  namesInserted: number;
  namesChanged: number;
  namesDemoted: number;
  namesTakenBack: number;
  applied: boolean;
}

class DryRunRollback extends Error {
  constructor(readonly summary: StandardSpeciesLoadSummary) {
    super("dry_run_rollback");
  }
}

export function standardSpeciesPayloadSha256(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

/** The rank the catalogue stores for a base row's rank. */
export function catalogRankOf(rank: string): string {
  switch (rank) {
    case "genus":
    case "subspecies":
    case "variety":
    case "form":
      return rank;
    default:
      // A nothospecies (Petunia ×atkinsiana) is a species to a gardener and
      // to the catalogue's closed rank set.
      return "species";
  }
}

/** "Fragaria × ananassa" and "Fragaria x ananassa" are one name to a catalogue. */
export function latinSpellings(latin: string): string[] {
  const spellings = new Set<string>([latin.trim()]);
  spellings.add(
    latin
      .replace(/\s*×\s*/gu, " x ")
      .replace(/\s+/gu, " ")
      .trim(),
  );
  spellings.add(
    latin
      .replace(/\s*×\s*/gu, " × ")
      .replace(/\s+/gu, " ")
      .trim(),
  );
  // Catalogue of Life and Wikidata write the sign against the epithet.
  spellings.add(
    latin
      .replace(/\s*×\s*/gu, " ×")
      .replace(/\s+/gu, " ")
      .trim(),
  );
  spellings.add(
    latin
      .replace(/\s*×\s*/gu, " ")
      .replace(/\s+/gu, " ")
      .trim(),
  );
  // A binomial written without the sign is still the hybrid a catalogue may
  // hold with it: "Chrysanthemum morifolium" is "Chrysanthemum x morifolium".
  const words = latin.trim().split(/\s+/u);
  if (words.length === 2 && !latin.includes("×") && /^[A-Z]/u.test(words[0]!)) {
    spellings.add(`${words[0]} x ${words[1]}`);
    spellings.add(`${words[0]} ×${words[1]}`);
  }
  return [...spellings].filter(Boolean);
}

/** The script a name is written in, as the species backbone records it. */
export function nameScript(value: string): "cyrillic" | "latin" {
  return /\p{Script=Cyrillic}/u.test(value) ? "cyrillic" : "latin";
}

/** Register cultivars weigh most: a crop people register forms of is kept by many. */
export function standardPopularity(row: StandardSpeciesFileRow): number {
  return (
    row.popularity.registerCultivars * 100 +
    LANGS.reduce((sum, lang) => sum + (row.popularity.pageviews[lang] ?? 0), 0)
  );
}

/** Identifier pairs of a row, most precise scheme first. */
export function standardIdentifierPairs(
  row: StandardSpeciesFileRow,
  options: { includeEppo: boolean },
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [["wikidata", row.wikidata]];
  if (row.identifiers.gbif) pairs.push(["gbif", row.identifiers.gbif]);
  if (row.identifiers.col) pairs.push(["col", row.identifiers.col]);
  if (row.identifiers.wfo) pairs.push(["wfo", row.identifiers.wfo]);
  // A species' EPPO code names the species; below it the catalogue has folded
  // the varieties' codes into the species node, so an infraspecific row must
  // not borrow them. They are read to find a node, never written.
  if (options.includeEppo && catalogRankOf(row.rank) === "species") {
    for (const code of row.identifiers.eppo) pairs.push(["eppo", code]);
  }
  return pairs;
}

interface ExistingName {
  id: string;
  organism: string;
  locale: string;
  normalized: string;
  displayName: string;
  isPrimary: boolean;
  weight: number;
  nameType: string;
}

interface RecordedName {
  nameId: string;
  organism: string;
  role: NameRole;
  reviewStatus: ReviewStatus;
  createdByBase: boolean;
  previousIsPrimary: boolean | null;
  previousWeight: number | null;
  previousDisplayName: string | null;
  baseVersion: string;
}

interface DesiredName {
  organism: string;
  value: string;
  locale: NameLocale;
  role: Exclude<NameRole, "demoted">;
  reviewStatus: ReviewStatus;
}

export async function loadStandardSpeciesBase(
  db: Kysely<Database>,
  input: { file: StandardSpeciesFile; payload: string; apply: boolean },
): Promise<StandardSpeciesLoadSummary> {
  const payloadSha256 = standardSpeciesPayloadSha256(input.payload);
  const version = input.file.version;
  try {
    return await db.transaction().execute(async (trx) => {
      await sql`set local statement_timeout = '900s'`.execute(trx);
      await sql`set local lock_timeout = '10s'`.execute(trx);
      const summary: StandardSpeciesLoadSummary = {
        version,
        payloadSha256,
        rows: input.file.rows.length,
        resolvedByIdentifier: 0,
        resolvedByName: 0,
        materializedFromCol: 0,
        created: 0,
        unresolved: [],
        resolvedByNameKeys: [],
        materializedKeys: [],
        createdKeys: [],
        duplicateOrganisms: [],
        identifierConflicts: [],
        identifiersWritten: 0,
        addressesAssigned: 0,
        membershipsWritten: 0,
        membershipsRemoved: 0,
        namesInserted: 0,
        namesChanged: 0,
        namesDemoted: 0,
        namesTakenBack: 0,
        applied: input.apply,
      };
      const assertionId = await openAssertion(trx, version, payloadSha256);

      // 1. Every row's organism.
      const byIdentifier = await organismsByIdentifier(trx, input.file.rows);
      const members: Array<{ row: StandardSpeciesFileRow; organism: string }> =
        [];
      const kept = new Set<string>();
      for (const row of input.file.rows) {
        let organism = byIdentifier.get(row.key) ?? null;
        if (organism) {
          summary.resolvedByIdentifier += 1;
        } else {
          organism = await resolveWithoutIdentifier(
            trx,
            row,
            assertionId,
            summary,
          );
        }
        if (!organism) {
          summary.unresolved.push(row.key);
          continue;
        }
        if (kept.has(organism)) {
          // Two base rows on one organism: the first keeps it, the second is
          // reported, never merged.
          summary.duplicateOrganisms.push(row.key);
          continue;
        }
        kept.add(organism);
        members.push({ row, organism });
      }

      // 2. Membership. A member that left the base, or whose key moved to
      // another organism, first gets its names back, then goes.
      const recorded = await readRecordedNames(trx);
      const wanted = new Map(
        members.map((member) => [member.organism, member.row.key]),
      );
      const current = await trx
        .selectFrom("catalog_standard_species")
        .select(["catalog_item_id as organism", "base_key as key"])
        .execute();
      const leaving = new Set(
        current
          .filter((member) => wanted.get(member.organism) !== member.key)
          .map((member) => member.organism),
      );
      if (leaving.size > 0) {
        summary.namesTakenBack += await takeBack(
          trx,
          [...recorded.values()].filter((name) => leaving.has(name.organism)),
        );
        for (const name of [...recorded.values()]) {
          if (leaving.has(name.organism)) recorded.delete(name.nameId);
        }
        const removed = await trx
          .deleteFrom("catalog_standard_species")
          .where("catalog_item_id", "in", [...leaving])
          .executeTakeFirst();
        summary.membershipsRemoved = Number(removed.numDeletedRows ?? 0);
      }
      for (const { row, organism } of members) {
        summary.membershipsWritten += await writeMembership(
          trx,
          organism,
          row,
          version,
          assertionId,
        );
      }

      // 3. Identifiers the catalogue does not hold yet, and an address for a
      // member that has none — a genus such as Rosa, which a gardener chooses
      // like a species and whose page needs one.
      summary.identifiersWritten = await writeIdentifiers(
        trx,
        members,
        assertionId,
        summary,
      );
      summary.addressesAssigned = await assignAddresses(
        trx,
        members.map((member) => member.organism),
      );

      // 4. Names.
      await writeNames(trx, members, recorded, version, assertionId, summary);

      if (!input.apply) throw new DryRunRollback(summary);
      return summary;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.summary;
    throw error;
  }
}

async function openAssertion(
  trx: Transaction<Database>,
  version: string,
  payloadSha256: string,
): Promise<string> {
  const now = new Date().toISOString();
  const snapshot = await trx
    .insertInto("catalog_source_snapshots")
    .values({
      source_slug: STANDARD_SPECIES_SOURCE_SLUG,
      source_name: "Overgarden standard species base",
      source_category: "curated_base",
      source_version: version,
      source_url:
        "https://github.com/yehor-design/over.garden/tree/main/apps/web/data/standard-species",
      license:
        "CC0 1.0 (Wikidata) and CC BY 4.0 (State Register of Plant Varieties of Ukraine)",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      attribution_required: true,
      attribution_text:
        "Names and identifiers from Wikidata (CC0) and Wikipedia; Ukrainian crops from the State Register of Plant Varieties of Ukraine (CC BY 4.0).",
      parser_version: STANDARD_SPECIES_PARSER_VERSION,
      payload_sha256: payloadSha256,
      fetched_at: now,
      verified_at: now,
    })
    .onConflict((conflict) =>
      conflict
        .columns(["source_slug", "source_version", "payload_sha256"])
        .doUpdateSet({ verified_at: now }),
    )
    .returning("id")
    .executeTakeFirstOrThrow();
  // One assertion per snapshot: a re-run of the same file reuses it.
  const existing = await trx
    .selectFrom("catalog_source_assertions")
    .select("id")
    .where("source_snapshot_id", "=", snapshot.id)
    .where("source_slug", "=", STANDARD_SPECIES_SOURCE_SLUG)
    .orderBy("created_at")
    .limit(1)
    .executeTakeFirst();
  if (existing) return existing.id;
  const assertion = await trx
    .insertInto("catalog_source_assertions")
    .values({
      source_slug: STANDARD_SPECIES_SOURCE_SLUG,
      source_snapshot_id: snapshot.id,
      rights_class: "source_public",
      confidence: "1",
      decision: "automatic",
      reason_codes: ["standard_species_base"],
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return assertion.id;
}

/** Every row's organism by identifier, in one read. */
async function organismsByIdentifier(
  trx: Transaction<Database>,
  rows: readonly StandardSpeciesFileRow[],
): Promise<Map<string, string>> {
  const pairs = new Map<string, Array<[string, string]>>();
  for (const row of rows)
    pairs.set(row.key, standardIdentifierPairs(row, { includeEppo: true }));
  const all = [...pairs.values()].flat();
  if (!all.length) return new Map();
  const found = await sql<{
    scheme: string;
    value: string;
    id: string;
    kingdom: string | null;
    normalized: string | null;
  }>`
    select identifier.scheme,
           identifier.value,
           target.id::text as id,
           target.kingdom,
           target.normalized_name as normalized
    from catalog_item_identifiers as identifier
    join catalog_items as item on item.id = identifier.catalog_item_id
    join catalog_items as target
      on target.id = coalesce(item.merged_into_catalog_item_id, item.id)
    where (identifier.scheme, identifier.value) in (
            ${sql.join(all.map(([scheme, value]) => sql`(${scheme}, ${value})`))}
          )
      and target.node_kind = 'taxon'
      and target.identity_state = 'active'
  `.execute(trx);
  const index = new Map(
    found.rows.map((entry) => [`${entry.scheme}:${entry.value}`, entry]),
  );
  // The catalogue folded the EPPO codes of varieties and close relatives into
  // one node — spelt's TRZSP sits on Triticum aestivum — so an EPPO hit counts
  // only when the node carries the row's own name, or its genus and epithet
  // (sweet orange's CIDSI sits on "Citrus x aurantium var. sinensis").
  const ownNames = await normalizedNames(
    trx,
    rows.flatMap((row) => [
      ...latinSpellings(row.latin),
      ...(row.latinSynonyms ?? []),
    ]),
  );
  const resolved = new Map<string, string>();
  for (const row of rows) {
    const names = new Set(
      [...latinSpellings(row.latin), ...(row.latinSynonyms ?? [])].map((name) =>
        ownNames.get(clip(name)),
      ),
    );
    for (const [scheme, value] of pairs.get(row.key) ?? []) {
      const hit = index.get(`${scheme}:${value}`);
      if (
        scheme === "eppo" &&
        !(
          hit?.normalized &&
          (names.has(hit.normalized) ||
            sameGenusAndEpithet(row.latin, hit.normalized))
        )
      ) {
        continue;
      }
      if (hit && kingdomFits(hit.kingdom, row.kind)) {
        resolved.set(row.key, hit.id);
        break;
      }
    }
  }
  return resolved;
}

/**
 * Whether a normalized node name has the row's genus first and its last
 * epithet as a word: "Citrus ×sinensis" and "citrus x aurantium var.
 * sinensis" do, "Triticum spelta" and "triticum aestivum" do not.
 */
export function sameGenusAndEpithet(
  latin: string,
  normalizedNode: string,
): boolean {
  const words = latin
    .toLowerCase()
    .replace(/×/gu, " ")
    .split(/\s+/u)
    .filter((word) => word && word !== "x" && !word.endsWith("."));
  const genus = words[0];
  const epithet = words.at(-1);
  if (!genus || !epithet || words.length < 2) return false;
  const nodeWords = normalizedNode.split(/\s+/u);
  return nodeWords[0] === genus && nodeWords.slice(1).includes(epithet);
}

/** `catalog_normalize_name` of each value, in one read. */
async function normalizedNames(
  trx: Transaction<Database>,
  values: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(values.map(clip).filter(Boolean))];
  const normalized = new Map<string, string>();
  for (let offset = 0; offset < unique.length; offset += 2_000) {
    const chunk = unique.slice(offset, offset + 2_000);
    const result = await sql<{ value: string; normalized: string }>`
      select value, catalog_normalize_name(value) as normalized
      from unnest(${sql.val(chunk)}::text[]) as value
    `.execute(trx);
    for (const entry of result.rows)
      normalized.set(entry.value, entry.normalized);
  }
  return normalized;
}

function kingdomFits(kingdom: string | null, kind: "plant" | "animal") {
  if (kingdom === null) return true;
  return kind === "animal" ? kingdom === "Animalia" : kingdom !== "Animalia";
}

async function resolveWithoutIdentifier(
  trx: Transaction<Database>,
  row: StandardSpeciesFileRow,
  assertionId: string,
  summary: StandardSpeciesLoadSummary,
): Promise<string | null> {
  const rank = catalogRankOf(row.rank);
  const byName = await organismByName(trx, row.latin, row.kind, rank);
  if (byName) {
    summary.resolvedByName += 1;
    summary.resolvedByNameKeys.push(row.key);
    return byName;
  }
  if (row.kind === "plant") {
    const materialized = await materializeFromCol(
      trx,
      row.latin,
      rank,
      assertionId,
    );
    if (materialized) {
      summary.materializedFromCol += 1;
      summary.materializedKeys.push(row.key);
      return materialized;
    }
  }
  const created = await createOrganism(trx, row, assertionId, summary);
  if (created) {
    summary.created += 1;
    summary.createdKeys.push(row.key);
  }
  return created;
}

/**
 * An active taxon of the row's kingdom by its scientific name — the node's
 * own, or an accepted name on it. Several of the same rank and none is
 * chosen: a name alone never picks between two organisms.
 */
async function organismByName(
  trx: Transaction<Database>,
  latin: string,
  kind: "plant" | "animal",
  rank: string | null,
): Promise<string | null> {
  const normalized = latinSpellings(latin).map(
    (spelling) => sql<string>`catalog_normalize_name(${spelling})`,
  );
  const rows = await sql<{ id: string; rank: string | null }>`
    select item.id::text as id, item.rank
    from catalog_items as item
    where item.node_kind = 'taxon'
      and item.identity_state = 'active'
      and item.merged_into_catalog_item_id is null
      and ${kind === "animal" ? sql`item.kingdom = 'Animalia'` : sql`(item.kingdom is null or item.kingdom <> 'Animalia')`}
      and (
        item.normalized_name in (${sql.join(normalized)})
        or exists (
          select 1 from catalog_item_names as name
          where name.catalog_item_id = item.id
            and name.name_type = 'scientific_accepted'
            and name.normalized_name in (${sql.join(normalized)})
        )
      )
    limit 5
  `.execute(trx);
  const sameRank = rank
    ? rows.rows.filter((row) => row.rank === rank)
    : rows.rows;
  if (sameRank.length === 1) return sameRank[0]!.id;
  if (rows.rows.length === 1) return rows.rows[0]!.id;
  return null;
}

/**
 * A plant from the Catalogue of Life checklist: the one accepted usage with
 * the name, or — when no usage with it is accepted — the one synonym, which
 * leads to its accepted node and stays on it as a scientific synonym
 * (Matricaria recutita → Matricaria chamomilla).
 */
async function materializeFromCol(
  trx: Transaction<Database>,
  latin: string,
  rank: string,
  assertionId: string,
): Promise<string | null> {
  // A synonym counts only when its accepted usage has the row's rank: hot
  // pepper's "Capsicum annuum var. acuminatum" is a synonym of the species,
  // and the species is a row of its own.
  const usages = await sql<{ colId: string; status: string }>`
    select usage.col_id as "colId", usage.status
    from catalog_source_col_usages as usage
    left join catalog_source_col_usages as accepted
      on accepted.source_snapshot_id = usage.source_snapshot_id
     and accepted.col_id = usage.parent_col_id
    where usage.source_snapshot_id = catalog_col_current_snapshot()
      and (
        usage.status in ('accepted', 'provisionally_accepted')
        or (usage.status = 'synonym' and catalog_col_rank(accepted.rank) = ${rank})
      )
      and (
        usage.normalized_scientific_name in (
          ${sql.join(latinSpellings(latin).map((spelling) => sql`catalog_normalize_name(${spelling})`))}
        )
        or usage.normalized_name in (
          ${sql.join(latinSpellings(latin).map((spelling) => sql`catalog_normalize_name(${spelling})`))}
        )
      )
    limit 5
  `.execute(trx);
  const accepted = usages.rows.filter((usage) => usage.status !== "synonym");
  const chosen =
    accepted.length === 1
      ? accepted[0]
      : accepted.length === 0 && usages.rows.length === 1
        ? usages.rows[0]
        : undefined;
  if (!chosen) return null;
  // Its own statement: the function inserts rows a caller's statement cannot see.
  const ensured = await sql<{ id: string }>`
    select catalog_col_ensure_node(${chosen.colId}, ${assertionId}::uuid)::text as id
  `.execute(trx);
  return ensured.rows[0]?.id ?? null;
}

/**
 * A node from the row itself, for an organism no identifier, name or
 * checklist usage finds — an animal, mostly, since production's checklist
 * holds the plant kingdoms only. A form below species hangs under its species,
 * which is found or made the same way first.
 */
async function createOrganism(
  trx: Transaction<Database>,
  row: StandardSpeciesFileRow,
  assertionId: string,
  summary: StandardSpeciesLoadSummary,
): Promise<string | null> {
  const rank = catalogRankOf(row.rank);
  const infraspecific =
    rank === "subspecies" || rank === "variety" || rank === "form";
  const binomial = row.latin.split(/\s+/u).slice(0, 2).join(" ");
  const parentLatin = infraspecific
    ? (row.parentLatin ?? binomial)
    : row.parentLatin;
  let parent = parentLatin
    ? await organismByName(
        trx,
        parentLatin,
        row.kind,
        infraspecific ? "species" : null,
      )
    : null;
  if (!parent && infraspecific && parentLatin) {
    parent =
      (row.kind === "plant"
        ? await materializeFromCol(trx, parentLatin, "species", assertionId)
        : null) ??
      (await insertNode(
        trx,
        {
          latin: parentLatin,
          rank: "species",
          kind: row.kind,
          parent: null,
          source: `latin:${parentLatin}`,
        },
        assertionId,
      ));
    if (parent) summary.created += 1;
  }
  if (infraspecific && !parent) return null;
  return insertNode(
    trx,
    {
      latin: row.latin,
      rank,
      kind: row.kind,
      parent,
      source: `wikidata:${row.wikidata}`,
    },
    assertionId,
  );
}

async function insertNode(
  trx: Transaction<Database>,
  node: {
    latin: string;
    rank: string;
    kind: "plant" | "animal";
    parent: string | null;
    source: string;
  },
  assertionId: string,
): Promise<string> {
  const latin = node.latin.slice(0, 120);
  const parentRow = node.parent
    ? await trx
        .selectFrom("catalog_items")
        .select(["ancestor_ids", "kingdom"])
        .where("id", "=", node.parent)
        .executeTakeFirst()
    : undefined;
  const addressable = ["species", "subspecies", "variety", "form"].includes(
    node.rank,
  );
  const inserted = await trx
    .insertInto("catalog_items")
    .values({
      canonical_name: latin,
      normalized_name: sql<string>`catalog_normalize_name(${latin})`,
      public_slug: addressable
        ? sql<string>`catalog_col_free_slug(catalog_col_slug(${latin}))`
        : null,
      source: "standard_species",
      source_id: node.source,
      locale: "la",
      node_kind: "taxon",
      kingdom:
        parentRow?.kingdom ?? (node.kind === "animal" ? "Animalia" : "Plantae"),
      rank: node.rank,
      identity_state: "active",
      parent_catalog_item_id: node.parent,
      ancestor_ids: node.parent
        ? sql<
            string[]
          >`${sql.val(parentRow?.ancestor_ids ?? [])}::uuid[] || array[${node.parent}::uuid]`
        : sql<string[]>`'{}'::uuid[]`,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await trx
    .insertInto("catalog_item_names")
    .values({
      catalog_item_id: inserted.id,
      display_name: latin,
      normalized_name: sql<string>`catalog_normalize_name(${latin})`,
      locale: "la",
      script: "latin",
      is_primary: true,
      name_type: "scientific_accepted",
      assertion_id: assertionId,
      weight: "5",
    })
    .onConflict((conflict) => conflict.doNothing())
    .execute();
  return inserted.id;
}

async function writeMembership(
  trx: Transaction<Database>,
  organism: string,
  row: StandardSpeciesFileRow,
  version: string,
  assertionId: string,
): Promise<number> {
  const values = {
    base_key: row.key,
    object_kind: row.kind,
    base_group: row.group,
    latin_name: row.latin.slice(0, 160),
    wikidata_id: row.wikidata,
    popularity: standardPopularity(row),
  };
  const result = await trx
    .insertInto("catalog_standard_species")
    .values({
      catalog_item_id: organism,
      ...values,
      base_version: version,
      assertion_id: assertionId,
    })
    .onConflict((conflict) =>
      conflict
        .column("catalog_item_id")
        .doUpdateSet({
          ...values,
          base_version: version,
          assertion_id: assertionId,
          updated_at: sql`now()`,
        })
        // A re-run of the same file leaves the row as it is.
        .where(
          sql<boolean>`(catalog_standard_species.base_key, catalog_standard_species.object_kind,
                        catalog_standard_species.base_group, catalog_standard_species.latin_name,
                        catalog_standard_species.wikidata_id, catalog_standard_species.popularity,
                        catalog_standard_species.base_version)
                       is distinct from
                       (excluded.base_key, excluded.object_kind, excluded.base_group,
                        excluded.latin_name, excluded.wikidata_id, excluded.popularity,
                        excluded.base_version)`,
        ),
    )
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0);
}

/** The identifiers a member carries that no node holds yet; one another node holds is reported. */
async function writeIdentifiers(
  trx: Transaction<Database>,
  members: ReadonlyArray<{ row: StandardSpeciesFileRow; organism: string }>,
  assertionId: string,
  summary: StandardSpeciesLoadSummary,
): Promise<number> {
  const wanted = members.flatMap(({ row, organism }) =>
    standardIdentifierPairs(row, { includeEppo: false }).map(
      ([scheme, value]) => ({
        key: row.key,
        organism,
        scheme,
        value,
      }),
    ),
  );
  if (!wanted.length) return 0;
  const held = await sql<{ scheme: string; value: string; organism: string }>`
    select scheme, value, catalog_item_id::text as organism
    from catalog_item_identifiers
    where (scheme, value) in (${sql.join(wanted.map((entry) => sql`(${entry.scheme}, ${entry.value})`))})
  `.execute(trx);
  const holders = new Map(
    held.rows.map((entry) => [
      `${entry.scheme}:${entry.value}`,
      entry.organism,
    ]),
  );
  const missing = [];
  for (const entry of wanted) {
    const holder = holders.get(`${entry.scheme}:${entry.value}`);
    if (holder === undefined) {
      missing.push(entry);
      holders.set(`${entry.scheme}:${entry.value}`, entry.organism);
    } else if (holder !== entry.organism) {
      summary.identifierConflicts.push(
        `${entry.key}:${entry.scheme}:${entry.value}`,
      );
    }
  }
  if (!missing.length) return 0;
  const inserted = await trx
    .insertInto("catalog_item_identifiers")
    .values(
      missing.map((entry) => ({
        catalog_item_id: entry.organism,
        scheme: entry.scheme,
        value: entry.value,
        assertion_id: assertionId,
      })),
    )
    .onConflict((conflict) => conflict.doNothing())
    .executeTakeFirst();
  return Number(inserted.numInsertedOrUpdatedRows ?? 0);
}

/**
 * A Latin address for each member without one. A genus whose plain slug a
 * cultivar already holds ("rosa" is the cultivar «Роса») takes "rosa-spp",
 * the botanist's "any species of the genus", before any numbered suffix. An
 * address once given is public and stays, whatever a later version does.
 */
async function assignAddresses(
  trx: Transaction<Database>,
  organisms: readonly string[],
): Promise<number> {
  if (!organisms.length) return 0;
  const bare = await trx
    .selectFrom("catalog_items")
    .select(["id", "canonical_name as name", "rank"])
    .where("id", "in", [...organisms])
    .where("public_slug", "is", null)
    .execute();
  for (const item of bare) {
    await sql`
      update catalog_items
         set public_slug = (
           with base as (select catalog_col_slug(${item.name}) as slug)
           select case
             when ${item.rank} = 'genus'
                  and exists (select 1 from catalog_items where public_slug = base.slug
                              union all
                              select 1 from catalog_item_slug_history where slug = base.slug)
               then catalog_col_free_slug(base.slug || '-spp')
             else catalog_col_free_slug(base.slug)
           end
           from base
         )
       where id = ${item.id} and public_slug is null
    `.execute(trx);
  }
  return bare.length;
}

async function readRecordedNames(
  trx: Transaction<Database>,
): Promise<Map<string, RecordedName>> {
  const rows = await trx
    .selectFrom("catalog_standard_species_names")
    .select([
      "catalog_item_name_id as nameId",
      "catalog_item_id as organism",
      "role",
      "review_status as reviewStatus",
      "created_by_base as createdByBase",
      "previous_is_primary as previousIsPrimary",
      "previous_weight as previousWeight",
      "previous_display_name as previousDisplayName",
      "base_version as baseVersion",
    ])
    .execute();
  return new Map(
    rows.map((row) => [
      row.nameId,
      {
        ...row,
        role: row.role as NameRole,
        reviewStatus: row.reviewStatus as ReviewStatus,
        previousWeight:
          row.previousWeight === null ? null : Number(row.previousWeight),
      },
    ]),
  );
}

/** Rows the base wrote go; rows it changed get back what they were. */
async function takeBack(
  trx: Transaction<Database>,
  names: readonly RecordedName[],
): Promise<number> {
  if (!names.length) return 0;
  const written = names
    .filter((name) => name.createdByBase)
    .map((name) => name.nameId);
  await trx
    .deleteFrom("catalog_standard_species_names")
    .where(
      "catalog_item_name_id",
      "in",
      names.map((name) => name.nameId),
    )
    .execute();
  if (written.length) {
    await trx
      .deleteFrom("catalog_item_names")
      .where("id", "in", written)
      .execute();
  }
  for (const name of names.filter((entry) => !entry.createdByBase)) {
    await trx
      .updateTable("catalog_item_names")
      .set({
        is_primary: name.previousIsPrimary ?? false,
        weight: String(name.previousWeight ?? 0),
        ...(name.previousDisplayName
          ? { display_name: name.previousDisplayName }
          : {}),
      })
      .where("id", "=", name.nameId)
      .execute();
  }
  return names.length;
}

async function writeNames(
  trx: Transaction<Database>,
  members: ReadonlyArray<{ row: StandardSpeciesFileRow; organism: string }>,
  recorded: Map<string, RecordedName>,
  version: string,
  assertionId: string,
  summary: StandardSpeciesLoadSummary,
) {
  const desired: DesiredName[] = [];
  for (const { row, organism } of members) {
    // The display name first: a search word that normalizes to it is the
    // same row, and stays the display.
    for (const lang of LANGS) {
      const name = row.names[lang];
      desired.push({
        organism,
        value: name.display,
        locale: lang,
        role: "display",
        reviewStatus: name.status,
      });
    }
    for (const lang of LANGS) {
      const name = row.names[lang];
      for (const word of name.search) {
        desired.push({
          organism,
          value: word,
          locale: lang,
          role: "search",
          reviewStatus: name.status,
        });
      }
    }
    for (const synonym of row.latinSynonyms ?? []) {
      desired.push({
        organism,
        value: synonym,
        locale: "la",
        role: "latin_synonym",
        reviewStatus: "confirmed",
      });
    }
  }
  const normalized = await normalizedNames(
    trx,
    desired.map((name) => name.value),
  );

  const organisms = members.map((member) => member.organism);
  const existingRows = organisms.length
    ? await trx
        .selectFrom("catalog_item_names")
        .select([
          "id",
          "catalog_item_id as organism",
          "locale",
          "normalized_name as normalized",
          "display_name as displayName",
          "is_primary as isPrimary",
          "weight",
          "name_type as nameType",
        ])
        .where("catalog_item_id", "in", organisms)
        .where("locale", "in", ["uk", "bg", "ru", "la"])
        .execute()
    : [];
  const byKey = new Map<string, ExistingName>();
  for (const row of existingRows) {
    byKey.set(`${row.organism}|${row.locale}|${row.normalized}`, {
      ...row,
      weight: Number(row.weight),
    });
  }

  const touched = new Set<string>();
  const displays = new Map<string, string>();
  for (const name of desired) {
    const value = clip(name.value);
    const norm = normalized.get(value);
    if (!value || !norm) continue;
    const key = `${name.organism}|${name.locale}|${norm}`;
    const existing = byKey.get(key);
    if (existing && touched.has(existing.id)) continue;
    const roleWeight =
      name.role === "display"
        ? STANDARD_DISPLAY_WEIGHT
        : name.role === "search"
          ? STANDARD_SEARCH_WEIGHT
          : STANDARD_LATIN_SYNONYM_WEIGHT;

    if (!existing) {
      const inserted = await trx
        .insertInto("catalog_item_names")
        .values({
          catalog_item_id: name.organism,
          display_name: value,
          normalized_name: norm,
          locale: name.locale,
          script: nameScript(value),
          is_primary: name.role === "display",
          name_type:
            name.role === "latin_synonym" ? "scientific_synonym" : "vernacular",
          assertion_id: assertionId,
          weight: String(roleWeight),
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("catalog_standard_species_names")
        .values({
          catalog_item_name_id: inserted.id,
          catalog_item_id: name.organism,
          locale: name.locale,
          role: name.role,
          review_status: name.reviewStatus,
          created_by_base: true,
          previous_is_primary: null,
          previous_weight: null,
          base_version: version,
        })
        .execute();
      byKey.set(key, {
        id: inserted.id,
        organism: name.organism,
        locale: name.locale,
        normalized: norm,
        displayName: value,
        isPrimary: name.role === "display",
        weight: roleWeight,
        nameType:
          name.role === "latin_synonym" ? "scientific_synonym" : "vernacular",
      });
      touched.add(inserted.id);
      if (name.role === "display")
        displays.set(`${name.organism}|${name.locale}`, inserted.id);
      summary.namesInserted += 1;
      continue;
    }

    touched.add(existing.id);
    if (name.role === "display")
      displays.set(`${name.organism}|${name.locale}`, existing.id);
    const record = recorded.get(existing.id);
    // What the row was before the base touched it, when that is known.
    const before = record
      ? record.createdByBase
        ? null
        : {
            isPrimary: record.previousIsPrimary ?? false,
            weight: record.previousWeight ?? 0,
            displayName: record.previousDisplayName ?? existing.displayName,
          }
      : {
          isPrimary: existing.isPrimary,
          weight: existing.weight,
          displayName: existing.displayName,
        };
    const target = {
      isPrimary:
        name.role === "display"
          ? true
          : name.role === "search"
            ? false
            : (before?.isPrimary ?? false),
      weight: before ? Math.max(before.weight, roleWeight) : roleWeight,
      // The base's display is spelt as the base spells it («домат» → «Домат»);
      // any other role keeps the row's spelling.
      displayName:
        name.role === "display"
          ? value
          : (before?.displayName ?? existing.displayName),
    };
    if (
      target.isPrimary !== existing.isPrimary ||
      target.weight !== existing.weight ||
      target.displayName !== existing.displayName
    ) {
      await trx
        .updateTable("catalog_item_names")
        .set({
          is_primary: target.isPrimary,
          weight: String(target.weight),
          display_name: target.displayName,
        })
        .where("id", "=", existing.id)
        .execute();
      existing.isPrimary = target.isPrimary;
      existing.weight = target.weight;
      existing.displayName = target.displayName;
      summary.namesChanged += 1;
    }
    const previousDisplayName =
      before && before.displayName !== target.displayName
        ? before.displayName
        : null;
    if (record) {
      if (
        record.role !== name.role ||
        record.reviewStatus !== name.reviewStatus ||
        record.baseVersion !== version ||
        (!record.createdByBase &&
          record.previousDisplayName !== previousDisplayName)
      ) {
        await trx
          .updateTable("catalog_standard_species_names")
          .set({
            role: name.role,
            review_status: name.reviewStatus,
            base_version: version,
            ...(record.createdByBase
              ? {}
              : { previous_display_name: previousDisplayName }),
          })
          .where("catalog_item_name_id", "=", existing.id)
          .execute();
      }
    } else if (
      before &&
      (before.isPrimary !== target.isPrimary ||
        before.weight !== target.weight ||
        before.displayName !== target.displayName)
    ) {
      await trx
        .insertInto("catalog_standard_species_names")
        .values({
          catalog_item_name_id: existing.id,
          catalog_item_id: name.organism,
          locale: name.locale,
          role: name.role,
          review_status: name.reviewStatus,
          created_by_base: false,
          previous_is_primary: before.isPrimary,
          previous_weight: String(before.weight),
          previous_display_name: previousDisplayName,
          base_version: version,
        })
        .execute();
    }
  }

  // One primary vernacular per language: any other the organism carries
  // stops being primary, and remembers that it was.
  for (const existing of byKey.values()) {
    if (
      existing.nameType !== "vernacular" ||
      !LANGS.includes(existing.locale as Lang)
    )
      continue;
    const display = displays.get(`${existing.organism}|${existing.locale}`);
    if (!display || existing.id === display) continue;
    const record = recorded.get(existing.id);
    if (touched.has(existing.id)) continue;
    if (!existing.isPrimary && record?.role !== "demoted") continue;
    touched.add(existing.id);
    if (existing.isPrimary) {
      await trx
        .updateTable("catalog_item_names")
        .set({ is_primary: false })
        .where("id", "=", existing.id)
        .execute();
      summary.namesDemoted += 1;
    }
    if (!record) {
      await trx
        .insertInto("catalog_standard_species_names")
        .values({
          catalog_item_name_id: existing.id,
          catalog_item_id: existing.organism,
          locale: existing.locale,
          role: "demoted",
          review_status: "confirmed",
          created_by_base: false,
          previous_is_primary: true,
          previous_weight: String(existing.weight),
          base_version: version,
        })
        .execute();
    } else if (record.baseVersion !== version) {
      await trx
        .updateTable("catalog_standard_species_names")
        .set({ base_version: version })
        .where("catalog_item_name_id", "=", existing.id)
        .execute();
    }
  }

  // What an earlier version wrote and this one no longer wants.
  summary.namesTakenBack += await takeBack(
    trx,
    [...recorded.values()].filter((name) => !touched.has(name.nameId)),
  );
}

function clip(value: string) {
  return value.trim().replace(/\s+/gu, " ").slice(0, 120);
}
