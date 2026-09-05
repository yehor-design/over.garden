import "./neutralise-server-only";

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool, type PoolClient } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import { loadVersionedApplicationSql } from "./application-sql";
import { classifyDatabaseHost } from "./apply-reviewed-migration";

/**
 * Executes the organism graph foundation migration (0054) instead of reading
 * it, in the two places it has to be right.
 *
 *   * `--database` (default): a fresh bootstrap up to 0053, a legacy-shaped
 *     seed (a species with its source links and alias projection, a cultivar,
 *     a breed, a provisional user-added card, a merged and a rejected card, a
 *     gardener object with a public entry), then 0054, its rollback, and 0054
 *     again. Every column, table, function, trigger, index and constraint the
 *     migration adds must be present after it and absent after the rollback;
 *     every backfill must land where this file says; every CHECK and every
 *     trigger must refuse what it is there to refuse; what a gardener sees
 *     (names, objects, slugs) must be byte-identical throughout; the normalizer
 *     fixture must pass through the SQL function; and the second application
 *     must produce the same graph as the first.
 *   * `--fingerprint`: a sha256 over what a gardener or a crawler can see on
 *     the loopback database — items, names, objects and the typeahead answers
 *     for the thirty queries in `contracts/catalog/typeahead-fingerprint-queries.json`
 *     — to run before and after applying 0054 there. It writes nothing.
 *
 * Output is aggregate: object names from this file's own lists, booleans,
 * counts and hashes. Never a connection string.
 */
export const FOUNDATION_MIGRATION = "0054";
const MIGRATION_FILE = "0054_ove386_organism_graph_foundation.sql";
const ROLLBACK_FILE = "0054_ove386_organism_graph_foundation.down.sql";

export const NEW_TABLES = [
  "catalog_source_assertions",
  "catalog_item_identifiers",
  "catalog_item_relations",
  "catalog_item_facts",
  "catalog_item_slug_history",
  "catalog_curation_queue",
  "catalog_curation_actions",
  "catalog_search_misses",
] as const;

export const NEW_ITEM_COLUMNS = [
  "node_kind",
  "rank",
  "kingdom",
  "parent_catalog_item_id",
  "ancestor_ids",
  "identity_state",
  "accepted_name_id",
  "search_weight",
  "registered_ua",
  "registered_eu",
  "has_registered_forms",
  "is_host",
  "indexable_override",
  "first_hand_content_at",
  "content_updated_at",
] as const;

export const NEW_NAME_COLUMNS = [
  "name_type",
  "script",
  "authorship",
  "assertion_id",
  "weight",
] as const;

export const NEW_LINK_COLUMNS = ["assertion_id"] as const;

export const NEW_FUNCTIONS = [
  "catalog_normalize_name",
  "catalog_curation_actions_append_only",
  "catalog_item_relations_enforce_kinds",
  "catalog_touch_item_content",
  "catalog_item_slug_history_sync",
] as const;

export const NEW_TRIGGERS = [
  { name: "catalog_curation_actions_append_only_trg", table: "catalog_curation_actions" },
  { name: "catalog_item_relations_enforce_kinds_trg", table: "catalog_item_relations" },
  { name: "catalog_item_names_touch_content_trg", table: "catalog_item_names" },
  { name: "catalog_item_identifiers_touch_content_trg", table: "catalog_item_identifiers" },
  { name: "catalog_item_relations_touch_content_trg", table: "catalog_item_relations" },
  { name: "catalog_item_facts_touch_content_trg", table: "catalog_item_facts" },
  { name: "catalog_item_slug_history_sync_trg", table: "catalog_items" },
] as const;

export const NEW_INDEXES = [
  "catalog_items_parent_idx",
  "catalog_items_ancestors_gin_idx",
  "catalog_items_identity_kind_idx",
  "catalog_item_names_normalized_prefix_idx",
  "catalog_source_assertions_snapshot_idx",
  "catalog_source_assertions_record_idx",
  "catalog_item_identifiers_item_idx",
  "catalog_item_relations_to_idx",
  "catalog_item_relations_from_idx",
  "catalog_item_facts_uidx",
  "catalog_item_facts_item_predicate_idx",
  "catalog_item_slug_history_item_idx",
  "catalog_curation_queue_open_impact_idx",
  "catalog_curation_queue_subject_idx",
  "catalog_curation_actions_performed_idx",
  "catalog_curation_actions_queue_item_idx",
  "catalog_search_misses_unresolved_idx",
] as const;

export const NEW_CONSTRAINTS = [
  "catalog_items_node_kind_check",
  "catalog_items_rank_check",
  "catalog_items_kingdom_check",
  "catalog_items_identity_state_check",
  "catalog_items_search_weight_check",
  "catalog_items_parent_fkey",
  "catalog_items_parent_not_self_check",
  "catalog_items_accepted_name_fkey",
  "catalog_item_names_name_type_check",
  "catalog_item_names_script_check",
  "catalog_item_names_authorship_check",
  "catalog_item_names_weight_check",
  "catalog_item_names_assertion_fkey",
  "catalog_source_links_assertion_fkey",
] as const;

type Queryable = Pool | PoolClient;

export interface StructureSnapshot {
  tablesPresent: string[];
  itemColumnsPresent: string[];
  nameColumnsPresent: string[];
  linkColumnsPresent: string[];
  functionsPresent: string[];
  triggersPresent: string[];
  indexesPresent: string[];
  constraintsPresent: string[];
  reasonCheckAcceptsCatalogCard: boolean;
}

export async function readStructureSnapshot(
  queryable: Queryable,
): Promise<StructureSnapshot> {
  const tablesPresent: string[] = [];
  for (const table of NEW_TABLES) {
    if (await tablePresent(queryable, table)) tablesPresent.push(table);
  }
  const itemColumnsPresent = await presentColumns(queryable, "catalog_items", NEW_ITEM_COLUMNS);
  const nameColumnsPresent = await presentColumns(queryable, "catalog_item_names", NEW_NAME_COLUMNS);
  const linkColumnsPresent = await presentColumns(queryable, "catalog_source_links", NEW_LINK_COLUMNS);
  const functionsPresent: string[] = [];
  for (const name of NEW_FUNCTIONS) {
    if (await functionPresent(queryable, name)) functionsPresent.push(name);
  }
  const triggersPresent: string[] = [];
  for (const trigger of NEW_TRIGGERS) {
    if (await triggerPresent(queryable, trigger.name, trigger.table)) {
      triggersPresent.push(trigger.name);
    }
  }
  const indexesPresent: string[] = [];
  for (const index of NEW_INDEXES) {
    if (await indexPresent(queryable, index)) indexesPresent.push(index);
  }
  const constraintsPresent: string[] = [];
  for (const constraint of NEW_CONSTRAINTS) {
    if (await constraintPresent(queryable, constraint)) {
      constraintsPresent.push(constraint);
    }
  }
  return {
    tablesPresent,
    itemColumnsPresent,
    nameColumnsPresent,
    linkColumnsPresent,
    functionsPresent,
    triggersPresent,
    indexesPresent,
    constraintsPresent,
    reasonCheckAcceptsCatalogCard: (
      await constraintDefinition(queryable, "public_projection_intents_reason_check")
    ).includes("catalog_card"),
  };
}

function assertStructurePresent(snapshot: StructureSnapshot, label: string) {
  const expectations: Array<[string, number, number]> = [
    ["tables", snapshot.tablesPresent.length, NEW_TABLES.length],
    ["catalog_items columns", snapshot.itemColumnsPresent.length, NEW_ITEM_COLUMNS.length],
    ["catalog_item_names columns", snapshot.nameColumnsPresent.length, NEW_NAME_COLUMNS.length],
    ["catalog_source_links columns", snapshot.linkColumnsPresent.length, NEW_LINK_COLUMNS.length],
    ["functions", snapshot.functionsPresent.length, NEW_FUNCTIONS.length],
    ["triggers", snapshot.triggersPresent.length, NEW_TRIGGERS.length],
    ["indexes", snapshot.indexesPresent.length, NEW_INDEXES.length],
    ["constraints", snapshot.constraintsPresent.length, NEW_CONSTRAINTS.length],
  ];
  for (const [what, actual, expected] of expectations) {
    if (actual !== expected) {
      throw new Error(`${label}: ${what} present ${actual} of ${expected}`);
    }
  }
  if (!snapshot.reasonCheckAcceptsCatalogCard) {
    throw new Error(`${label}: the projection reason check lacks catalog_card`);
  }
}

function assertStructureAbsent(snapshot: StructureSnapshot, label: string) {
  const leftovers = [
    ...snapshot.tablesPresent,
    ...snapshot.itemColumnsPresent,
    ...snapshot.nameColumnsPresent,
    ...snapshot.linkColumnsPresent,
    ...snapshot.functionsPresent,
    ...snapshot.triggersPresent,
    ...snapshot.indexesPresent,
    ...snapshot.constraintsPresent,
  ];
  if (leftovers.length !== 0) {
    throw new Error(`${label}: objects survived the rollback: ${leftovers.join(",")}`);
  }
  if (snapshot.reasonCheckAcceptsCatalogCard) {
    throw new Error(`${label}: the projection reason check still lists catalog_card`);
  }
}

/** What a gardener or a crawler sees. Must not change across the migration. */
async function gardenerFingerprint(queryable: Queryable) {
  const items = await queryable.query(
    `select id, canonical_name, catalog_kind, status, public_slug, source, locale, normalized_name
       from catalog_items order by id`,
  );
  const names = await queryable.query(
    `select catalog_item_id, display_name, normalized_name, locale, is_primary
       from catalog_item_names order by catalog_item_id, display_name, locale`,
  );
  const objects = await queryable.query(
    `select id, catalog_item_id, variety_state, variety_text, display_name, object_kind
       from plant_objects order by id`,
  );
  const links = await queryable.query(
    `select catalog_item_id, source_record_id, source_slug, source_record_key, projection_kind
       from catalog_source_links order by catalog_item_id, source_record_id`,
  );
  return sha256(JSON.stringify({ items: items.rows, names: names.rows, objects: objects.rows, links: links.rows }));
}

/** The graph rows 0054 derives. Must be identical after the second application. */
async function graphFingerprint(queryable: Queryable) {
  const items = await queryable.query(
    `select canonical_name, node_kind, rank, kingdom, identity_state,
            (accepted_name_id is not null) as has_accepted_name,
            (first_hand_content_at is not null) as has_first_hand
       from catalog_items order by canonical_name`,
  );
  const names = await queryable.query(
    `select display_name, locale, name_type, script from catalog_item_names order by display_name, locale`,
  );
  const identifiers = await queryable.query(
    `select scheme, value from catalog_item_identifiers order by scheme, value`,
  );
  const assertions = await queryable.query(
    `select source_slug, rights_class, decision, reason_codes from catalog_source_assertions order by source_slug`,
  );
  const slugs = await queryable.query(
    `select namespace, slug, (valid_to is null) as current from catalog_item_slug_history order by namespace, slug`,
  );
  return sha256(
    JSON.stringify({
      items: items.rows,
      names: names.rows,
      identifiers: identifiers.rows,
      assertions: assertions.rows,
      slugs: slugs.rows,
    }),
  );
}

interface Seed {
  ownerUserId: string;
  speciesId: string;
  speciesLatinNameId: string;
  speciesVernacularNameId: string;
  cultivarId: string;
  breedId: string;
  provisionalId: string;
  mergedId: string;
  rejectedId: string;
  objectId: string;
  linkCount: number;
}

/**
 * The legacy shape as the imports, the composer and the alias review ledger
 * left it before 0054: a species with names, an accepted-scientific-name
 * projection and five source links carrying one `sourceIds` object each; a
 * register cultivar with its link; a breed; a provisional user-added card; a
 * merged and a rejected card; a gardener object on the species with one public
 * entry and one deleted one.
 */
async function seedLegacyCatalog(pool: Pool): Promise<Seed> {
  const ownerUserId = randomUUID();
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'ove386 proof', $2, true, now(), now())`,
    [ownerUserId, `ove386-${ownerUserId.slice(0, 8)}@example.test`],
  );

  const colSnapshotId = randomUUID();
  const registerSnapshotId = randomUUID();
  for (const [id, slug, name] of [
    [colSnapshotId, "catalogue-of-life-checklistbank", "Catalogue of Life"],
    [registerSnapshotId, "ua-state-register", "State Register of Plant Varieties"],
  ]) {
    await pool.query(
      `insert into catalog_source_snapshots (
         id, source_slug, source_name, source_category, source_version, source_url,
         license, parser_version, payload_sha256, fetched_at, verified_at, status
       ) values ($1, $2, $3, 'taxonomy', 'ove386', 'https://example.test/', 'CC BY 4.0',
                 'ove386', $4, now(), now(), 'imported')`,
      [id, slug, name, sha256(`${id}`)],
    );
  }

  const sourceIds = {
    colId: "4Y369",
    wfoId: "wfo-0001030236",
    eppoCode: "LYPES",
    wikidataId: "Q23501",
    gbifTaxonKey: 2930137,
    colDatasetKey: 315448,
  };
  const speciesRecords: Array<[string, string, string]> = [
    [randomUUID(), colSnapshotId, "CoL:3LR:4Y369"],
    [randomUUID(), colSnapshotId, "EPPO:LYPES"],
    [randomUUID(), colSnapshotId, "GBIF:species:2930137"],
    [randomUUID(), colSnapshotId, "Wikidata:Q23501"],
    [randomUUID(), colSnapshotId, "WFO:2026-06:wfo-0001030236"],
  ];
  for (const [id, snapshotId, recordId] of speciesRecords) {
    await pool.query(
      `insert into catalog_source_records (
         id, source_snapshot_id, source_record_id, raw_payload, raw_payload_sha256,
         source_only_fields, allowed_projection, projection_status
       ) values ($1, $2, $3, '{}'::jsonb, $4, '{}'::jsonb, $5::jsonb, 'projected')`,
      [
        id,
        snapshotId,
        recordId,
        sha256(recordId),
        JSON.stringify({
          canonicalName: "Solanum lycopersicum L.",
          sourceIds,
          source: "species_backbone",
        }),
      ],
    );
  }
  const registerRecordId = randomUUID();
  await pool.query(
    `insert into catalog_source_records (
       id, source_snapshot_id, source_record_id, raw_payload, raw_payload_sha256,
       source_only_fields, allowed_projection, projection_status
     ) values ($1, $2, 'RegisterVarietis:OVE386', '{}'::jsonb, $3, '{}'::jsonb, $4::jsonb, 'projected')`,
    [
      registerRecordId,
      registerSnapshotId,
      sha256("RegisterVarietis:OVE386"),
      JSON.stringify({
        canonicalName: "Де Барао",
        source: "ua_state_register",
        sourceId: "ua-state-register:2025-07-15:RegisterVarietis:OVE386",
      }),
    ],
  );

  const speciesId = randomUUID();
  const cultivarId = randomUUID();
  const breedId = randomUUID();
  const provisionalId = randomUUID();
  const mergedId = randomUUID();
  const rejectedId = randomUUID();
  const items: Array<[string, string, string, string, string, string | null, string, string | null]> = [
    [speciesId, "Solanum lycopersicum L.", "species", "seeded", "species_backbone", "solanum-lycopersicum-ove386", "la", null],
    [cultivarId, "Де Барао", "plant_variety", "seeded", "ua_state_register", "de-barao-ove386", "uk", null],
    [breedId, "Карпатська", "breed", "seeded", "ua_official_bee_breed", "karpatska-ove386", "uk", null],
    [provisionalId, "Бичаче серце", "plant_variety", "provisional", "user_added", null, "und", ownerUserId],
    [mergedId, "Де-Барао", "plant_variety", "merged", "internal_seed", null, "uk", null],
    [rejectedId, "Fixture species", "species", "rejected", "visual_fixture", null, "la", null],
  ];
  for (const [id, name, kind, status, source, slug, locale, createdBy] of items) {
    await pool.query(
      `insert into catalog_items (
         id, canonical_name, catalog_kind, normalized_name, public_slug, status, source,
         source_id, created_by_user_id, locale
       ) values ($1, $2, $3, lower($2), $4, $5, $6, $7, $8, $9)`,
      [id, name, kind, slug, status, source, `${source}:${id}`, createdBy, locale],
    );
  }
  await pool.query(
    `update catalog_items set merged_into_catalog_item_id = $1 where id = $2`,
    [cultivarId, mergedId],
  );

  const speciesLatinNameId = randomUUID();
  const speciesVernacularNameId = randomUUID();
  const names: Array<[string, string, string, string, boolean]> = [
    [speciesLatinNameId, speciesId, "Solanum lycopersicum L.", "la", true],
    [speciesVernacularNameId, speciesId, "Томат", "uk", false],
    [randomUUID(), cultivarId, "Де Барао", "uk", true],
    [randomUUID(), breedId, "Карпатська", "uk", true],
    [randomUUID(), provisionalId, "Бичаче серце", "und", true],
    [randomUUID(), mergedId, "Де-Барао", "uk", true],
    [randomUUID(), rejectedId, "Fixture species", "la", true],
  ];
  for (const [id, itemId, display, locale, primary] of names) {
    await pool.query(
      `insert into catalog_item_names (id, catalog_item_id, display_name, normalized_name, locale, is_primary)
       values ($1, $2, $3, lower($3), $4, $5)`,
      [id, itemId, display, locale, primary],
    );
  }

  await pool.query(
    `insert into catalog_alias_projections (
       catalog_item_id, catalog_item_name_id, display_name, normalized_name, locale, script,
       alias_kind, status, source_slug, source_method, source_record_id, source_record_key,
       confidence, license, attribution_required
     ) values ($1, $2, 'Solanum lycopersicum L.', 'solanum lycopersicum l.', 'la', 'Latn',
               'accepted_scientific_name', 'accepted', 'catalogue-of-life-checklistbank',
               'source_backed', $3, 'CoL:3LR:4Y369', 1, 'CC BY 4.0', true)`,
    [speciesId, speciesLatinNameId, speciesRecords[0]![0]],
  );

  let linkCount = 0;
  for (const [recordId, , key] of speciesRecords) {
    await pool.query(
      `insert into catalog_source_links (catalog_item_id, source_record_id, source_slug, source_record_key, projection_kind)
       values ($1, $2, $3, $4, 'canonical_item')`,
      [speciesId, recordId, key.startsWith("EPPO") ? "eppo-codes" : key.startsWith("GBIF") ? "gbif-backbone" : key.startsWith("Wikidata") ? "wikidata" : key.startsWith("WFO") ? "world-flora-online" : "catalogue-of-life-checklistbank", key],
    );
    linkCount += 1;
  }
  await pool.query(
    `insert into catalog_source_links (catalog_item_id, source_record_id, source_slug, source_record_key, projection_kind)
     values ($1, $2, 'ua-state-register', 'RegisterVarietis:OVE386', 'canonical_item')`,
    [cultivarId, registerRecordId],
  );
  linkCount += 1;

  const spaceId = randomUUID();
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'ove386 garden')`,
    [spaceId, ownerUserId],
  );
  const objectId = randomUUID();
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, catalog_item_id, variety_state)
     values ($1, $2, $3, 'Томати біля паркану', 'plant', $4, 'selected')`,
    [objectId, ownerUserId, spaceId, speciesId],
  );
  await pool.query(
    `insert into journal_entries (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
       visibility, lifecycle_state, published_at, client_mutation_id)
     values ($1, $2, $3, 'Перший запис', 'Посадив томати.', 'object', 'public', 'active', now() - interval '2 days', $4)`,
    [ownerUserId, spaceId, objectId, `ove386-live-${objectId}`],
  );
  await pool.query(
    `insert into journal_entries (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
       visibility, lifecycle_state, published_at, deleted_at, purge_after, client_mutation_id)
     values ($1, $2, $3, 'Видалений запис', 'Помилково.', 'object', 'public', 'deleted_retention',
             now(), now(), now() + interval '7 days', $4)`,
    [ownerUserId, spaceId, objectId, `ove386-deleted-${objectId}`],
  );

  return {
    ownerUserId,
    speciesId,
    speciesLatinNameId,
    speciesVernacularNameId,
    cultivarId,
    breedId,
    provisionalId,
    mergedId,
    rejectedId,
    objectId,
    linkCount,
  };
}

async function assertBackfill(queryable: Queryable, seed: Seed, label: string) {
  const items = await queryable.query<{
    id: string;
    node_kind: string;
    rank: string | null;
    kingdom: string | null;
    identity_state: string;
    accepted_name_id: string | null;
    first_hand_content_at: Date | null;
  }>(
    `select id, node_kind, rank, kingdom, identity_state, accepted_name_id, first_hand_content_at
       from catalog_items where id = any($1::uuid[])`,
    [[seed.speciesId, seed.cultivarId, seed.breedId, seed.provisionalId, seed.mergedId, seed.rejectedId]],
  );
  const byId = new Map(items.rows.map((row) => [row.id, row]));
  const expect = (id: string, field: keyof (typeof items.rows)[number], value: unknown, what: string) => {
    const row = byId.get(id);
    if (!row) throw new Error(`${label}: seeded item missing (${what})`);
    const actual = row[field];
    if (actual !== value) throw new Error(`${label}: ${what}: expected ${String(value)}, got ${String(actual)}`);
  };
  expect(seed.speciesId, "node_kind", "taxon", "species node_kind");
  expect(seed.speciesId, "rank", "species", "species rank");
  expect(seed.speciesId, "kingdom", "Plantae", "species kingdom from species_backbone");
  expect(seed.speciesId, "identity_state", "active", "species identity_state");
  expect(seed.speciesId, "accepted_name_id", seed.speciesLatinNameId, "species accepted name is the scientific one");
  expect(seed.cultivarId, "node_kind", "cultivar", "cultivar node_kind");
  expect(seed.cultivarId, "rank", "cultivar", "cultivar rank");
  expect(seed.cultivarId, "kingdom", "Plantae", "cultivar kingdom");
  expect(seed.breedId, "node_kind", "breed", "breed node_kind");
  expect(seed.breedId, "rank", "breed", "breed rank");
  expect(seed.breedId, "kingdom", "Animalia", "breed kingdom");
  expect(seed.provisionalId, "node_kind", "cultivar", "provisional node_kind");
  expect(seed.provisionalId, "identity_state", "active", "provisional stays active until the labels task");
  expect(seed.mergedId, "identity_state", "merged", "merged status maps to merged");
  expect(seed.rejectedId, "identity_state", "retired", "rejected status maps to retired");
  if (!byId.get(seed.speciesId)!.first_hand_content_at) {
    throw new Error(`${label}: species first_hand_content_at not set from its public entry`);
  }
  if (byId.get(seed.cultivarId)!.first_hand_content_at) {
    throw new Error(`${label}: cultivar first_hand_content_at set without an entry`);
  }

  const names = await queryable.query<{ id: string; name_type: string; script: string }>(
    `select id, name_type, script from catalog_item_names where catalog_item_id = any($1::uuid[])`,
    [[seed.speciesId, seed.cultivarId]],
  );
  const latin = names.rows.find((row) => row.id === seed.speciesLatinNameId);
  const vernacular = names.rows.find((row) => row.id === seed.speciesVernacularNameId);
  if (latin?.name_type !== "scientific_accepted" || latin.script !== "Latn") {
    throw new Error(`${label}: the alias-linked scientific name did not become scientific_accepted/Latn`);
  }
  if (vernacular?.name_type !== "vernacular" || vernacular.script !== "Cyrl") {
    throw new Error(`${label}: the Ukrainian vernacular did not stay vernacular/Cyrl`);
  }
  const cultivarNames = names.rows.filter((row) => row.id !== seed.speciesLatinNameId && row.id !== seed.speciesVernacularNameId);
  if (cultivarNames.length !== 1 || cultivarNames[0]!.name_type !== "denomination") {
    throw new Error(`${label}: the cultivar primary name did not become a denomination`);
  }

  const assertionCount = await count(queryable, "catalog_source_assertions");
  if (assertionCount !== seed.linkCount) {
    throw new Error(`${label}: assertions ${assertionCount}, links ${seed.linkCount}`);
  }
  const unlinked = await queryable.query(
    "select 1 from catalog_source_links where assertion_id is null limit 1",
  );
  if ((unlinked.rowCount ?? 0) > 0) throw new Error(`${label}: a source link has no assertion`);

  const identifiers = await queryable.query<{ scheme: string; value: string; catalog_item_id: string }>(
    "select scheme, value, catalog_item_id from catalog_item_identifiers order by scheme",
  );
  const expectedIdentifiers = new Map<string, [string, string]>([
    ["col", ["4Y369", seed.speciesId]],
    ["wfo", ["wfo-0001030236", seed.speciesId]],
    ["eppo", ["LYPES", seed.speciesId]],
    ["wikidata", ["Q23501", seed.speciesId]],
    ["gbif", ["2930137", seed.speciesId]],
    ["ua_register", ["RegisterVarietis:OVE386", seed.cultivarId]],
  ]);
  if (identifiers.rows.length !== expectedIdentifiers.size) {
    throw new Error(`${label}: identifiers ${identifiers.rows.length}, expected ${expectedIdentifiers.size}`);
  }
  for (const row of identifiers.rows) {
    const expected = expectedIdentifiers.get(row.scheme);
    if (!expected || expected[0] !== row.value || expected[1] !== row.catalog_item_id) {
      throw new Error(`${label}: unexpected identifier ${row.scheme}=${row.value}`);
    }
  }

  const slugs = await queryable.query<{ namespace: string; slug: string; catalog_item_id: string; valid_to: Date | null }>(
    "select namespace, slug, catalog_item_id, valid_to from catalog_item_slug_history where catalog_item_id = any($1::uuid[]) order by slug",
    [[seed.speciesId, seed.cultivarId, seed.breedId, seed.provisionalId, seed.mergedId, seed.rejectedId]],
  );
  const baseSlugRows = await queryable.query<{ n: number }>(
    "select count(*)::int as n from catalog_item_slug_history as h join catalog_items as i on i.id = h.catalog_item_id where i.public_slug is not null",
  );
  const slugItems = await queryable.query<{ n: number }>(
    "select count(*)::int as n from catalog_items where public_slug is not null",
  );
  if (baseSlugRows.rows[0]!.n !== slugItems.rows[0]!.n) {
    throw new Error(`${label}: every item with a public slug must have exactly one history row`);
  }
  const expectedSlugs = new Map([
    ["solanum-lycopersicum-ove386", ["species", seed.speciesId]],
    ["de-barao-ove386", ["form", seed.cultivarId]],
    ["karpatska-ove386", ["form", seed.breedId]],
  ]);
  if (slugs.rows.length !== expectedSlugs.size) {
    throw new Error(`${label}: slug history rows ${slugs.rows.length}, expected ${expectedSlugs.size}`);
  }
  for (const row of slugs.rows) {
    const expected = expectedSlugs.get(row.slug);
    if (!expected || expected[0] !== row.namespace || expected[1] !== row.catalog_item_id || row.valid_to !== null) {
      throw new Error(`${label}: unexpected slug history row ${row.namespace}/${row.slug}`);
    }
  }
}

/** Every CHECK and trigger refuses what it is there to refuse; executed inside savepoints. */
async function assertGuards(client: PoolClient, seed: Seed, label: string) {
  const assertionId = (
    await client.query<{ id: string }>("select id from catalog_source_assertions limit 1")
  ).rows[0]!.id;

  const mustFail = async (what: string, statement: string, params: unknown[] = []) => {
    await client.query("savepoint guard");
    try {
      await client.query(statement, params);
    } catch {
      await client.query("rollback to savepoint guard");
      return;
    }
    await client.query("rollback to savepoint guard");
    throw new Error(`${label}: ${what} was accepted`);
  };
  const mustPass = async (what: string, statement: string, params: unknown[] = []) => {
    await client.query("savepoint guard");
    try {
      await client.query(statement, params);
    } catch (error) {
      await client.query("rollback to savepoint guard");
      throw new Error(`${label}: ${what} was refused: ${error instanceof Error ? error.message : String(error)}`);
    }
    await client.query("rollback to savepoint guard");
  };

  await mustFail("node_kind outside the set", "update catalog_items set node_kind = 'thing' where id = $1", [seed.speciesId]);
  await mustFail("rank outside the set", "update catalog_items set rank = 'clade' where id = $1", [seed.speciesId]);
  await mustFail("kingdom outside the set", "update catalog_items set kingdom = 'Monera' where id = $1", [seed.speciesId]);
  await mustFail("identity_state outside the set", "update catalog_items set identity_state = 'deleted' where id = $1", [seed.speciesId]);
  await mustFail("a node as its own parent", "update catalog_items set parent_catalog_item_id = id where id = $1", [seed.speciesId]);
  await mustFail("name_type outside the set", "update catalog_item_names set name_type = 'nickname' where id = $1", [seed.speciesLatinNameId]);
  await mustFail("rights_class outside the set", "update catalog_source_assertions set rights_class = 'secret' where id = $1", [assertionId]);
  await mustFail("decision outside the set", "update catalog_source_assertions set decision = 'maybe' where id = $1", [assertionId]);
  await mustFail("identifier scheme outside the set", "insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id) values ($1, 'itis', '1', $2)", [seed.speciesId, assertionId]);
  await mustFail("duplicate identifier", "insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id) values ($1, 'eppo', 'LYPES', $2)", [seed.cultivarId, assertionId]);
  await mustFail("relation type outside the set", "insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id) values ($1, $2, 'synonym_of', $3)", [seed.cultivarId, seed.speciesId, assertionId]);
  await mustFail("form_of from a taxon", "insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id) values ($1, $2, 'form_of', $3)", [seed.speciesId, seed.cultivarId, assertionId]);
  await mustFail("pest_of onto a cultivar", "insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id) values ($1, $2, 'pest_of', $3)", [seed.speciesId, seed.cultivarId, assertionId]);
  await mustFail("host_class on form_of", "insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, host_class, assertion_id) values ($1, $2, 'form_of', 'host', $3)", [seed.cultivarId, seed.speciesId, assertionId]);
  await mustPass("form_of from the cultivar to the species", "insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id) values ($1, $2, 'form_of', $3)", [seed.cultivarId, seed.speciesId, assertionId]);
  await mustPass("pest_of between two taxa with a host class", "insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, host_class, assertion_id) values ($1, $2, 'pest_of', 'major_host', $3)", [seed.rejectedId, seed.speciesId, assertionId]);
  await mustFail("fact predicate outside the set", "insert into catalog_item_facts (catalog_item_id, predicate, value, assertion_id) values ($1, 'colour', 'red', $2)", [seed.speciesId, assertionId]);
  await mustFail("fact region outside ISO shape", "insert into catalog_item_facts (catalog_item_id, predicate, region_code, value, assertion_id) values ($1, 'distribution_status', 'ukraine', 'present', $2)", [seed.speciesId, assertionId]);
  await mustPass("fact with a country and a sub-national region", "insert into catalog_item_facts (catalog_item_id, predicate, region_code, value, value_normalized, assertion_id) values ($1, 'distribution_status', 'UA-05', 'Present, widespread', 'present', $2)", [seed.speciesId, assertionId]);
  await mustFail("slug namespace outside the set", "insert into catalog_item_slug_history (namespace, slug, catalog_item_id) values ('variety', 'x-y', $1)", [seed.speciesId]);
  await mustFail("slug outside the slug shape", "insert into catalog_item_slug_history (namespace, slug, catalog_item_id) values ('species', 'Not A Slug', $1)", [seed.speciesId]);
  await mustFail("queue item type outside the set", "insert into catalog_curation_queue (item_type, subject_catalog_item_id) values ('rename', $1)", [seed.speciesId]);
  await mustFail("queue state outside the set", "insert into catalog_curation_queue (item_type, subject_catalog_item_id, state) values ('node_merge', $1, 'pending')", [seed.speciesId]);
  await mustFail("queue item without a subject", "insert into catalog_curation_queue (item_type) values ('label_link')");
  await mustFail("search miss object_kind outside the set", "insert into catalog_search_misses (query_normalized, locale, object_kind) values ('x', 'uk', 'fungus')");
  await mustFail("projection reason outside the set", "insert into public_projection_intents (entity_kind, entity_id, owner_user_id, desired_state, desired_generation, desired_reason) values ('journal_entry', $1, $2, 'present', 1, 'nonsense')", [randomUUID(), seed.ownerUserId]);
  await mustPass("projection reason catalog_card", "insert into public_projection_intents (entity_kind, entity_id, owner_user_id, desired_state, desired_generation, desired_reason) values ('journal_entry', $1, $2, 'present', 1, 'catalog_card')", [randomUUID(), seed.ownerUserId]);

  // Append-only actions.
  await client.query("savepoint actions");
  try {
    const action = await client.query<{ id: string }>(
      `insert into catalog_curation_actions (action_type, subject_catalog_item_ids, payload, inverse, performed_by_user_id)
       values ('link', $1::uuid[], '{"to":"x"}', '{"from":"x"}', $2) returning id`,
      [[seed.speciesId], seed.ownerUserId],
    );
    const actionId = action.rows[0]!.id;
    await mustFail("deleting an action", "delete from catalog_curation_actions where id = $1", [actionId]);
    await mustFail("rewriting an action payload", "update catalog_curation_actions set payload = '{}' where id = $1", [actionId]);
    await mustFail("changing an action type", "update catalog_curation_actions set action_type = 'merge' where id = $1", [actionId]);
    await mustFail("assigning a performer", "update catalog_curation_actions set performed_by_user_id = $2 where id = $1", [actionId, randomUUID()]);
    await mustPass("erasing the performer", "update catalog_curation_actions set performed_by_user_id = null where id = $1", [actionId]);
    const revert = await client.query<{ id: string }>(
      `insert into catalog_curation_actions (action_type, subject_catalog_item_ids) values ('revert', $1::uuid[]) returning id`,
      [[seed.speciesId]],
    );
    await client.query("update catalog_curation_actions set reverted_by_action_id = $2 where id = $1", [actionId, revert.rows[0]!.id]);
    await mustFail("reverting twice", "update catalog_curation_actions set reverted_by_action_id = $2 where id = $1", [actionId, randomUUID()]);
  } finally {
    await client.query("rollback to savepoint actions");
  }

  // content_updated_at moves when a name is added; the slug history follows a slug change.
  await client.query("savepoint touch");
  try {
    const before = (await client.query<{ at: Date }>("select content_updated_at as at from catalog_items where id = $1", [seed.speciesId])).rows[0]!.at;
    await client.query("select pg_sleep(0.01)");
    await client.query(
      "insert into catalog_item_names (catalog_item_id, display_name, normalized_name, locale) values ($1, 'Помідор', 'помідор', 'uk')",
      [seed.speciesId],
    );
    const after = (await client.query<{ at: Date }>("select content_updated_at as at from catalog_items where id = $1", [seed.speciesId])).rows[0]!.at;
    if (!(after.getTime() > before.getTime())) throw new Error(`${label}: content_updated_at did not move on a new name`);

    await client.query("update catalog_items set public_slug = 'tomato-ove386' where id = $1", [seed.speciesId]);
    const history = await client.query<{ slug: string; valid_to: Date | null }>(
      "select slug, valid_to from catalog_item_slug_history where catalog_item_id = $1 order by slug",
      [seed.speciesId],
    );
    const old = history.rows.find((row) => row.slug === "solanum-lycopersicum-ove386");
    const fresh = history.rows.find((row) => row.slug === "tomato-ove386");
    if (!old || old.valid_to === null) throw new Error(`${label}: the old slug was not closed in history`);
    if (!fresh || fresh.valid_to !== null) throw new Error(`${label}: the new slug was not recorded as current`);
  } finally {
    await client.query("rollback to savepoint touch");
  }

  // A node with names can be deleted despite the accepted_name_id cycle.
  await client.query("savepoint cycle");
  try {
    const temp = randomUUID();
    await client.query(
      `insert into catalog_items (id, canonical_name, catalog_kind, normalized_name, status, source, locale)
       values ($1, 'ove386 temp', 'species', 'ove386 temp', 'seeded', 'visual_fixture', 'la')`,
      [temp],
    );
    const nameId = (await client.query<{ id: string }>(
      "insert into catalog_item_names (catalog_item_id, display_name, normalized_name, locale, is_primary) values ($1, 'ove386 temp', 'ove386 temp', 'la', true) returning id",
      [temp],
    )).rows[0]!.id;
    await client.query("update catalog_items set accepted_name_id = $2 where id = $1", [temp, nameId]);
    await client.query("delete from catalog_items where id = $1", [temp]);
  } finally {
    await client.query("rollback to savepoint cycle");
  }
}

async function assertNormalizerFixture(queryable: Queryable, label: string) {
  const fixture = JSON.parse(
    readFileSync(path.join(process.cwd(), "..", "..", "contracts", "catalog", "normalize-name.fixture.json"), "utf8"),
  ) as { cases: Array<{ input: string; expected: string; note: string }> };
  const result = await queryable.query<{ actual: string }>(
    "select catalog_normalize_name(input) as actual from unnest($1::text[]) as input",
    [fixture.cases.map((entry) => entry.input)],
  );
  const mismatches = result.rows.filter((row, index) => row.actual !== fixture.cases[index]!.expected);
  if (mismatches.length !== 0) {
    throw new Error(`${label}: the SQL normalizer disagrees with the fixture on ${mismatches.length} of ${fixture.cases.length} cases`);
  }
  const strict = await queryable.query<{ ok: boolean }>("select catalog_normalize_name(null) is null as ok");
  if (!strict.rows[0]?.ok) throw new Error(`${label}: the SQL normalizer is not strict on null`);
  return fixture.cases.length;
}

export async function runDisposableProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const databaseUrl = requiredEnv("DATABASE_URL");

  const disposable = `overgarden_ove386_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 1 });

  try {
    await applyMigrationsBefore(pool, targetUrl.toString(), FOUNDATION_MIGRATION);
    const seed = await seedLegacyCatalog(pool);

    const structureBefore = await readStructureSnapshot(pool);
    assertStructureAbsent(structureBefore, "before");
    const gardenerBefore = await gardenerFingerprint(pool);

    await pool.query(migrationSql());
    const structureAfter = await readStructureSnapshot(pool);
    assertStructurePresent(structureAfter, "after");
    await assertBackfill(pool, seed, "after");
    const gardenerAfter = await gardenerFingerprint(pool);
    if (gardenerAfter !== gardenerBefore) {
      throw new Error("after: what a gardener sees changed");
    }
    const graphFirst = await graphFingerprint(pool);
    const fixtureCases = await assertNormalizerFixture(pool, "after");

    const client = await pool.connect();
    try {
      await client.query("begin");
      await assertGuards(client, seed, "guards");
      await client.query("rollback");
    } finally {
      client.release();
    }

    // Replaying the migration on an already migrated database is a no-op.
    await pool.query(migrationSql());
    if ((await graphFingerprint(pool)) !== graphFirst) {
      throw new Error("replay: a second application on the same database changed the graph");
    }

    await pool.query(rollbackSql());
    const structureRolledBack = await readStructureSnapshot(pool);
    assertStructureAbsent(structureRolledBack, "rollback");
    if ((await gardenerFingerprint(pool)) !== gardenerBefore) {
      throw new Error("rollback: what a gardener sees changed");
    }

    await pool.query(migrationSql());
    const structureAgain = await readStructureSnapshot(pool);
    assertStructurePresent(structureAgain, "reapply");
    await assertBackfill(pool, seed, "reapply");
    if ((await gardenerFingerprint(pool)) !== gardenerBefore) {
      throw new Error("reapply: what a gardener sees changed");
    }
    if ((await graphFingerprint(pool)) !== graphFirst) {
      throw new Error("reapply: the graph differs from the first application");
    }

    return {
      schemaVersion: "ove386.organismGraphFoundation.v1",
      mode: "disposable",
      status: "pass",
      migration: FOUNDATION_MIGRATION,
      newTables: NEW_TABLES.length,
      newItemColumns: NEW_ITEM_COLUMNS.length,
      newNameColumns: NEW_NAME_COLUMNS.length,
      newFunctions: NEW_FUNCTIONS.length,
      newTriggers: NEW_TRIGGERS.length,
      newIndexes: NEW_INDEXES.length,
      newConstraints: NEW_CONSTRAINTS.length,
      seededSourceLinks: seed.linkCount,
      normalizerFixtureCases: fixtureCases,
      gardenerFingerprintUnchanged: true,
      replayIsNoOp: true,
      rollbackRemovedEveryObject: true,
      reapplyReproducesGraph: true,
    };
  } finally {
    await pool.end().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

/**
 * Read-only. Hashes what a gardener or a crawler can see on the loopback
 * database: every item, name, object and source link, and the typeahead answer
 * for thirty fixed queries, once through the real path (Meilisearch merged in)
 * and once through Postgres alone.
 */
export async function runFingerprint() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("fingerprint_database_url_missing");
  const hostClass = classifyDatabaseHost(new URL(connectionString).hostname);
  if (hostClass !== "loopback") throw new Error(`fingerprint_refused_host_class_${hostClass}`);

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  try {
    const database = (await pool.query("select current_database() as db")).rows[0]?.db as string;
    const rows = await gardenerFingerprint(pool);
    const counts = await pool.query(
      "select catalog_kind, status, count(*)::int as n from catalog_items group by 1, 2 order by 1, 2",
    );
    const queries = JSON.parse(
      readFileSync(path.join(process.cwd(), "..", "..", "contracts", "catalog", "typeahead-fingerprint-queries.json"), "utf8"),
    ) as { queries: Array<{ locale: string; query: string }> };
    const { searchCatalogSuggestionsForTypeaheadResult } = await import(
      "../src/server/catalog-repository"
    );
    const full: unknown[] = [];
    const postgresOnly: unknown[] = [];
    for (const entry of queries.queries) {
      const real = await searchCatalogSuggestionsForTypeaheadResult(entry.query, { limit: 8 });
      full.push({ query: entry.query, state: real.state, ids: real.suggestions.map((s) => s.id) });
      const canonical = await searchCatalogSuggestionsForTypeaheadResult(
        entry.query,
        { limit: 8 },
        { searchWithMeili: async () => [] },
      );
      postgresOnly.push({ query: entry.query, state: canonical.state, ids: canonical.suggestions.map((s) => s.id) });
    }
    return {
      schemaVersion: "ove386.organismGraphFoundation.v1",
      mode: "fingerprint",
      hostClass,
      database,
      readOnly: true,
      countsByKindAndStatus: counts.rows,
      rowsSha256: rows,
      typeaheadFullPathSha256: sha256(JSON.stringify(full)),
      typeaheadPostgresOnlySha256: sha256(JSON.stringify(postgresOnly)),
      queries: queries.queries.length,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function applyMigrationsBefore(pool: Pool, connectionString: string, number: string) {
  const applicationSql = await loadVersionedApplicationSql(path.join(process.cwd(), "sql"));
  await pool.query(applicationSql[0]!.sql);

  const authDb = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 1 }) }),
  });
  const authOptions = {
    appName: "OverGarden",
    baseURL: "http://localhost:3000",
    basePath: "/api/auth",
    secret: "ove386-disposable-proof-secret-value-not-a-credential",
    database: { db: authDb, type: "postgres", casing: "snake" },
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    advanced: { cookiePrefix: "overgarden", database: { generateId: "uuid" } },
  } satisfies BetterAuthOptions;
  betterAuth(authOptions);
  await (await getMigrations(authOptions)).runMigrations();
  await authDb.destroy();

  for (const migration of applicationSql) {
    if (migration.name.slice(0, 4) >= number) continue;
    await pool.query(migration.sql);
  }
}

function migrationSql() {
  return readFileSync(path.join(process.cwd(), "sql", MIGRATION_FILE), "utf8");
}

function rollbackSql() {
  return readFileSync(path.join(process.cwd(), "sql", "rollback", ROLLBACK_FILE), "utf8");
}

async function presentColumns(queryable: Queryable, table: string, columns: readonly string[]) {
  const result = await queryable.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name = any($2::text[])`,
    [table, [...columns]],
  );
  return result.rows.map((row) => row.column_name).sort();
}

async function tablePresent(queryable: Queryable, table: string) {
  const result = await queryable.query<{ present: boolean }>(
    "select to_regclass($1) is not null as present",
    [`public.${table}`],
  );
  return result.rows[0]?.present === true;
}

async function count(queryable: Queryable, table: string) {
  // Table names come from this file's own lists, never from input.
  const result = await queryable.query<{ count: string }>(`select count(*)::text as count from "${table}"`);
  return Number(result.rows[0]?.count ?? 0);
}

async function functionPresent(queryable: Queryable, name: string) {
  const result = await queryable.query(
    `select 1 from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [name],
  );
  return (result.rowCount ?? 0) > 0;
}

async function constraintPresent(queryable: Queryable, name: string) {
  const result = await queryable.query("select 1 from pg_constraint where conname = $1", [name]);
  return (result.rowCount ?? 0) > 0;
}

async function constraintDefinition(queryable: Queryable, name: string) {
  const result = await queryable.query<{ definition: string }>(
    "select pg_get_constraintdef(oid) as definition from pg_constraint where conname = $1",
    [name],
  );
  return result.rows[0]?.definition ?? "";
}

async function triggerPresent(queryable: Queryable, name: string, table: string) {
  const result = await queryable.query(
    `select 1 from pg_trigger as t join pg_class as c on c.oid = t.tgrelid
      where t.tgname = $1 and c.relname = $2 and not t.tgisinternal`,
    [name, table],
  );
  return (result.rowCount ?? 0) > 0;
}

async function indexPresent(queryable: Queryable, name: string) {
  const result = await queryable.query(
    "select 1 from pg_indexes where schemaname = 'public' and indexname = $1",
    [name],
  );
  return (result.rowCount ?? 0) > 0;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const mode = process.argv.includes("--fingerprint") ? "fingerprint" : "database";
  const receipt = mode === "fingerprint" ? await runFingerprint() : await runDisposableProof();
  console.log(JSON.stringify(receipt, null, 2));
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).endsWith("prove-organism-graph-foundation.ts");

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
