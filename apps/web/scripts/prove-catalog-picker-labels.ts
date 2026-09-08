import "./neutralise-server-only";

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool, type PoolClient } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import type { CatalogSuggestion } from "../src/server/catalog-repository";
import { applyMigrationsBefore } from "./prove-organism-graph-foundation";

/**
 * Executes migration 0055 (OVE-387) instead of reading it, on a fresh
 * disposable database: a bootstrap up to 0054, a seed shaped like the data
 * the migration exists for (a tomato species with vernaculars in three
 * locales and a synonym, a registered cultivar that is a form of it, a
 * misspelling-shaped competitor, a name with a curly apostrophe, an animal
 * taxon with a breed, a merged card, two provisional cards a gardener created
 * and the objects that point at them, objects in every other state, journal
 * entries for the weights), then 0055 and the trigram sets of 0065 the picker
 * reads, then 0055's replay, its rollback and 0055 again.
 *
 * What it proves:
 *   * every object that pointed at a provisional card keeps the card's name
 *     as a label (`free_text`) and drops the link; nothing else about an
 *     object changes; the cards are retired, their alias projections and
 *     pending match suggestions stale;
 *   * stored names carry the shared normalizer's form; display names never
 *     change;
 *   * `catalog_recompute_search_weight()` writes usage, markets and forms and
 *     returns 0 on a second call;
 *   * the picker statement answers the fixed set the task names (tomato
 *     species first for "томат", "помідор", "домати", "tomato",
 *     "Lycopersicon esculentum" and "тамат"), applies the kind filter, never
 *     returns a retired or merged row, collapses to one row per organism and
 *     fits eight rows in a kilobyte;
 *   * search misses accumulate with the normalized text;
 *   * the replay is a no-op, the rollback restores the prior shape and the
 *     links, and the second application reproduces the first.
 *
 * Output is aggregate: names from this file's own seed, counts, booleans and
 * hashes. Never a connection string.
 */
const MIGRATION = "0055";
const MIGRATION_FILE = "0055_ove387_labels_instead_of_provisional_cards.sql";
const ROLLBACK_FILE = "0055_ove387_labels_instead_of_provisional_cards.down.sql";
// The picker statement reads the stored trigram sets 0065 adds, so the ranking
// is asserted on a schema that carries both. 0065 touches nothing 0055's
// rollback drops, and updating a normalized name recomputes its set.
const TRIGRAM_SETS_FILE = "0065_ove387_picker_trigram_sets.sql";

type Queryable = Pool | PoolClient;

interface Seed {
  ownerUserId: string;
  otherUserId: string;
  speciesId: string;
  cultivarId: string;
  competitorId: string;
  apostropheId: string;
  apostropheNameId: string;
  animalTaxonId: string;
  breedId: string;
  mergedId: string;
  provisionalPlantId: string;
  provisionalAnimalId: string;
  objects: {
    labelledPlant: string;
    labelledAnimal: string;
    labelWithoutCard: string;
    priorLabel: string;
    selectedSpecies: string;
    unknown: string;
    otherOwnerCultivar: string;
  };
}

async function seedCatalog(pool: Pool): Promise<Seed> {
  const ownerUserId = randomUUID();
  const otherUserId = randomUUID();
  for (const [id, label] of [
    [ownerUserId, "owner"],
    [otherUserId, "other"],
  ]) {
    await pool.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, $2, $3, true, now(), now())`,
      [id, `ove387 ${label}`, `ove387-${label}-${id.slice(0, 8)}@example.test`],
    );
  }

  const snapshotId = randomUUID();
  await pool.query(
    `insert into catalog_source_snapshots (
       id, source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status
     ) values ($1, 'ua-state-register', 'State Register of Plant Varieties', 'taxonomy', 'ove387',
               'https://example.test/', 'CC BY 4.0', 'ove387', $2, now(), now(), 'imported')`,
    [snapshotId, "0".repeat(64)],
  );
  const assertionId = randomUUID();
  await pool.query(
    `insert into catalog_source_assertions (id, source_slug, source_snapshot_id)
     values ($1, 'ua-state-register', $2)`,
    [assertionId, snapshotId],
  );

  const speciesId = randomUUID();
  const cultivarId = randomUUID();
  const competitorId = randomUUID();
  const apostropheId = randomUUID();
  const animalTaxonId = randomUUID();
  const breedId = randomUUID();
  const mergedId = randomUUID();
  const provisionalPlantId = randomUUID();
  const provisionalAnimalId = randomUUID();

  // id, canonical name, legacy kind, status, source, slug, locale, created by, node kind, kingdom
  const items: Array<[string, string, string, string, string, string | null, string, string | null, string, string | null]> = [
    [speciesId, "Solanum lycopersicum L.", "species", "seeded", "species_backbone", "ove387-solanum-lycopersicum", "la", null, "taxon", "Plantae"],
    [cultivarId, "Де Барао", "plant_variety", "seeded", "ua_state_register", "ove387-de-barao", "uk", null, "cultivar", "Plantae"],
    [competitorId, "Тамара", "plant_variety", "seeded", "ua_state_register", "ove387-tamara", "uk", null, "cultivar", "Plantae"],
    [apostropheId, "Мар’яна", "plant_variety", "seeded", "ua_state_register", "ove387-mariana", "uk", null, "cultivar", "Plantae"],
    [animalTaxonId, "Apis mellifera", "species", "seeded", "species_backbone", "ove387-apis-mellifera", "la", null, "taxon", "Animalia"],
    [breedId, "Карпатська", "breed", "seeded", "ua_official_bee_breed", "ove387-karpatska", "uk", null, "breed", "Animalia"],
    [mergedId, "Де-Барао", "plant_variety", "merged", "internal_seed", null, "uk", null, "cultivar", "Plantae"],
    [provisionalPlantId, "Мій томат", "plant_variety", "provisional", "user_added", null, "und", ownerUserId, "cultivar", "Plantae"],
    [provisionalAnimalId, "Бджола сусіда", "species", "provisional", "user_added", null, "und", ownerUserId, "taxon", null],
  ];
  for (const [id, name, kind, status, source, slug, locale, createdBy, nodeKind, kingdom] of items) {
    await pool.query(
      `insert into catalog_items (
         id, canonical_name, catalog_kind, normalized_name, public_slug, status, source,
         source_id, created_by_user_id, locale, node_kind, kingdom,
         identity_state
       ) values ($1, $2, $3, lower($2), $4, $5, $6, $7, $8, $9, $10, $11,
                 case when $5 = 'merged' then 'merged' else 'active' end)`,
      [id, name, kind, slug, status, source, `${source}:${id}`, createdBy, locale, nodeKind, kingdom],
    );
  }
  await pool.query(
    `update catalog_items set merged_into_catalog_item_id = $1 where id = $2`,
    [cultivarId, mergedId],
  );

  const apostropheNameId = randomUUID();
  // id, item, display, locale, primary, name type — normalized the legacy way (lower, trim)
  const names: Array<[string, string, string, string, boolean, string]> = [
    [randomUUID(), speciesId, "Solanum lycopersicum", "la", true, "scientific_accepted"],
    [randomUUID(), speciesId, "Lycopersicon esculentum", "la", false, "scientific_synonym"],
    [randomUUID(), speciesId, "помідор", "uk", false, "vernacular"],
    [randomUUID(), speciesId, "томат", "uk", false, "vernacular"],
    [randomUUID(), speciesId, "домат", "bg", false, "vernacular"],
    [randomUUID(), speciesId, "домати", "bg", false, "vernacular"],
    [randomUUID(), speciesId, "помидор", "ru", false, "vernacular"],
    [randomUUID(), speciesId, "Tomato", "en", false, "vernacular"],
    [randomUUID(), cultivarId, "Де Барао", "uk", true, "denomination"],
    [randomUUID(), cultivarId, "Помідор їстівний Де Барао", "uk", false, "vernacular"],
    [randomUUID(), competitorId, "Тамара", "uk", true, "denomination"],
    [apostropheNameId, apostropheId, "Мар’яна", "uk", true, "denomination"],
    [randomUUID(), animalTaxonId, "Apis mellifera", "la", true, "scientific_accepted"],
    [randomUUID(), animalTaxonId, "бджола медоносна", "uk", false, "vernacular"],
    [randomUUID(), breedId, "Карпатська", "uk", true, "denomination"],
    [randomUUID(), breedId, "Карпатська бджола", "uk", false, "vernacular"],
    [randomUUID(), mergedId, "Де-Барао", "uk", true, "denomination"],
    [randomUUID(), provisionalPlantId, "Мій томат", "und", true, "denomination"],
    [randomUUID(), provisionalAnimalId, "Бджола сусіда", "und", true, "vernacular"],
  ];
  for (const [id, itemId, display, locale, primary, nameType] of names) {
    await pool.query(
      `insert into catalog_item_names (id, catalog_item_id, display_name, normalized_name, locale, is_primary, name_type)
       values ($1, $2, $3, lower(btrim($3)), $4, $5, $6)`,
      [id, itemId, display, locale, primary, nameType],
    );
  }

  await pool.query(
    `insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
     values ($1, 'ua_register', 'ove387-24256099', $2), ($3, 'ua_register', 'ove387-24256100', $2)`,
    [cultivarId, assertionId, competitorId],
  );
  await pool.query(
    `insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id)
     values ($1, $2, 'form_of', $3), ($4, $5, 'form_of', $3)`,
    [cultivarId, speciesId, assertionId, breedId, animalTaxonId],
  );

  const provisionalNameId = names.find(([, itemId]) => itemId === provisionalPlantId)![0];
  await pool.query(
    `insert into catalog_alias_projections (
       catalog_item_id, catalog_item_name_id, display_name, normalized_name, locale, script,
       alias_kind, status, source_slug, source_method, confidence, license, attribution_required
     ) values ($1, $2, 'Мій томат', 'мій томат', 'und', 'Cyrl', 'user_provisional', 'user_provisional',
               'user-provisional', 'user_provisional', 1, 'user-provided', false)`,
    [provisionalPlantId, provisionalNameId],
  );
  // A pending match the worker proposed for the provisional card, in the
  // exact shape the table's evidence constraints demand.
  const speciesNameId = names[0]![0];
  const evidence = {
    schemaVersion: "ove158.catalogMatchEvidence.v2",
    score: 61,
    confidenceBucket: "medium",
    matchType: "fuzzy_name",
    normalizedInput: "мій томат",
    candidateDisplayName: "Solanum lycopersicum",
    candidateCanonicalName: "Solanum lycopersicum L.",
    sourceLocale: "und",
    targetLocale: "la",
    sourceScript: "cyrillic",
    targetScript: "latin",
    catalogKind: "plant_variety",
    affectedObjectCount: 0,
    reasonCodes: [],
    thresholds: { low: 70, high: 95, medium: 85 },
  };
  await pool.query(
    `insert into catalog_match_suggestions (
       source_catalog_item_id, target_catalog_item_id, target_catalog_item_name_id, candidate_key,
       match_type, score, confidence_bucket, status, normalized_input, matched_name,
       target_canonical_name, source_locale, target_locale, source_script, target_script,
       catalog_kind, affected_object_count, reason_codes, safe_evidence, matcher_version
     ) values ($1, $2, $3, $5, 'fuzzy_name', 61, 'medium', 'pending', 'мій томат',
               'Solanum lycopersicum', 'Solanum lycopersicum L.', 'und', 'la', 'cyrillic', 'latin',
               'plant_variety', 0, array[]::text[], $4::jsonb, 'ove158-v2')`,
    [provisionalPlantId, speciesId, speciesNameId, JSON.stringify(evidence), speciesId],
  );

  const spaceId = randomUUID();
  const otherSpaceId = randomUUID();
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'ove387 garden'), ($3, $4, 'ove387 other garden')`,
    [spaceId, ownerUserId, otherSpaceId, otherUserId],
  );
  const objects = {
    labelledPlant: randomUUID(),
    labelledAnimal: randomUUID(),
    labelWithoutCard: randomUUID(),
    priorLabel: randomUUID(),
    selectedSpecies: randomUUID(),
    unknown: randomUUID(),
    otherOwnerCultivar: randomUUID(),
  };
  // id, owner, space, display, kind, catalog item, state, text
  const rows: Array<[string, string, string, string, string, string | null, string, string | null]> = [
    [objects.labelledPlant, ownerUserId, spaceId, "Помідорчик", "plant", provisionalPlantId, "user_added", "Мій томат"],
    [objects.labelledAnimal, ownerUserId, spaceId, "Вулик 1", "animal", provisionalAnimalId, "user_added", "Бджола сусіда"],
    [objects.labelWithoutCard, ownerUserId, spaceId, "Насіння", "plant", null, "user_added", "Насіння з обміну"],
    [objects.priorLabel, ownerUserId, spaceId, "Базилік", "plant", null, "free_text", "Генуезький"],
    [objects.selectedSpecies, ownerUserId, spaceId, "Томати біля паркану", "plant", speciesId, "selected", "Solanum lycopersicum L."],
    [objects.unknown, ownerUserId, spaceId, "Щось", "plant", null, "unknown", null],
    [objects.otherOwnerCultivar, otherUserId, otherSpaceId, "Де Барао сусіда", "plant", cultivarId, "selected", "Де Барао"],
  ];
  for (const [id, owner, space, display, kind, itemId, state, text] of rows) {
    await pool.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, catalog_item_id, variety_state, variety_text)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, owner, space, display, kind, itemId, state, text],
    );
  }
  const entries: Array<[string, string, string, string, string]> = [
    [ownerUserId, spaceId, objects.selectedSpecies, "active", "one"],
    [ownerUserId, spaceId, objects.selectedSpecies, "active", "two"],
    [ownerUserId, spaceId, objects.selectedSpecies, "deleted_retention", "gone"],
    [otherUserId, otherSpaceId, objects.otherOwnerCultivar, "active", "other"],
  ];
  for (const [owner, space, objectId, lifecycle, key] of entries) {
    await pool.query(
      lifecycle === "active"
        ? `insert into journal_entries (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
             visibility, lifecycle_state, published_at, client_mutation_id)
           values ($1, $2, $3, 'Запис', 'Текст.', 'object', 'public', 'active', now() - interval '1 day', $4)`
        : `insert into journal_entries (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
             visibility, lifecycle_state, published_at, deleted_at, purge_after, client_mutation_id)
           values ($1, $2, $3, 'Видалений', 'Помилково.', 'object', 'public', 'deleted_retention',
                   now(), now(), now() + interval '7 days', $4)`,
      [owner, space, objectId, `ove387-${key}-${objectId}`],
    );
  }

  return {
    ownerUserId,
    otherUserId,
    speciesId,
    cultivarId,
    competitorId,
    apostropheId,
    apostropheNameId,
    animalTaxonId,
    breedId,
    mergedId,
    provisionalPlantId,
    provisionalAnimalId,
    objects,
  };
}

async function readObjects(queryable: Queryable, seed: Seed) {
  const result = await queryable.query<{
    id: string;
    variety_state: string;
    variety_text: string | null;
    catalog_item_id: string | null;
  }>(
    `select id, variety_state, variety_text, catalog_item_id
     from plant_objects where owner_user_id in ($1, $2)`,
    [seed.ownerUserId, seed.otherUserId],
  );
  return new Map(result.rows.map((row) => [row.id, row]));
}

function expectObject(
  objects: Awaited<ReturnType<typeof readObjects>>,
  id: string,
  expected: { state: string; text: string | null; item: string | null },
  label: string,
) {
  const row = objects.get(id);
  if (!row) throw new Error(`${label}: object missing`);
  if (
    row.variety_state !== expected.state ||
    row.variety_text !== expected.text ||
    row.catalog_item_id !== expected.item
  ) {
    throw new Error(
      `${label}: object ${JSON.stringify({ state: row.variety_state, text: row.variety_text, item: row.catalog_item_id })} expected ${JSON.stringify(expected)}`,
    );
  }
}

async function assertLabels(queryable: Queryable, seed: Seed, label: string) {
  const objects = await readObjects(queryable, seed);
  const o = seed.objects;
  expectObject(objects, o.labelledPlant, { state: "free_text", text: "Мій томат", item: null }, `${label} labelledPlant`);
  expectObject(objects, o.labelledAnimal, { state: "free_text", text: "Бджола сусіда", item: null }, `${label} labelledAnimal`);
  expectObject(objects, o.labelWithoutCard, { state: "free_text", text: "Насіння з обміну", item: null }, `${label} labelWithoutCard`);
  expectObject(objects, o.priorLabel, { state: "free_text", text: "Генуезький", item: null }, `${label} priorLabel`);
  expectObject(objects, o.selectedSpecies, { state: "selected", text: "Solanum lycopersicum L.", item: seed.speciesId }, `${label} selectedSpecies`);
  expectObject(objects, o.unknown, { state: "unknown", text: null, item: null }, `${label} unknown`);
  expectObject(objects, o.otherOwnerCultivar, { state: "selected", text: "Де Барао", item: seed.cultivarId }, `${label} otherOwnerCultivar`);

  const userAdded = await count(queryable, "plant_objects where variety_state = 'user_added'");
  if (userAdded !== 0) throw new Error(`${label}: ${userAdded} objects still carry user_added`);

  const states = await queryable.query<{ id: string; identity_state: string; status: string }>(
    `select id, identity_state, status from catalog_items where id = any($1::uuid[])`,
    [[seed.provisionalPlantId, seed.provisionalAnimalId, seed.speciesId, seed.mergedId]],
  );
  const byId = new Map(states.rows.map((row) => [row.id, row]));
  for (const id of [seed.provisionalPlantId, seed.provisionalAnimalId]) {
    const row = byId.get(id);
    if (row?.identity_state !== "retired" || row.status !== "provisional") {
      throw new Error(`${label}: provisional card ${JSON.stringify(row)} is not retired with its history kept`);
    }
  }
  if (byId.get(seed.speciesId)?.identity_state !== "active") throw new Error(`${label}: species is not active`);
  if (byId.get(seed.mergedId)?.identity_state !== "merged") throw new Error(`${label}: merged card changed`);

  const alias = await queryable.query<{ status: string }>(
    `select status from catalog_alias_projections where catalog_item_id = $1`,
    [seed.provisionalPlantId],
  );
  if (alias.rows[0]?.status !== "stale") throw new Error(`${label}: alias projection is ${alias.rows[0]?.status}`);
  const suggestion = await queryable.query<{ status: string }>(
    `select status from catalog_match_suggestions where source_catalog_item_id = $1`,
    [seed.provisionalPlantId],
  );
  if (suggestion.rows[0]?.status !== "stale") throw new Error(`${label}: match suggestion is ${suggestion.rows[0]?.status}`);
}

async function assertRolledBack(queryable: Queryable, seed: Seed) {
  const objects = await readObjects(queryable, seed);
  const o = seed.objects;
  expectObject(objects, o.labelledPlant, { state: "user_added", text: "Мій томат", item: seed.provisionalPlantId }, "rollback labelledPlant");
  expectObject(objects, o.labelledAnimal, { state: "user_added", text: "Бджола сусіда", item: seed.provisionalAnimalId }, "rollback labelledAnimal");
  // A label that never came from a card stays a label: the rollback cannot
  // invent the state a row had before the migration retired it.
  expectObject(objects, o.labelWithoutCard, { state: "free_text", text: "Насіння з обміну", item: null }, "rollback labelWithoutCard");
  expectObject(objects, o.priorLabel, { state: "free_text", text: "Генуезький", item: null }, "rollback priorLabel");
  const cards = await queryable.query<{ identity_state: string }>(
    `select identity_state from catalog_items where id = any($1::uuid[])`,
    [[seed.provisionalPlantId, seed.provisionalAnimalId]],
  );
  if (cards.rows.some((row) => row.identity_state !== "active")) throw new Error("rollback: a provisional card stayed retired");
  const alias = await queryable.query<{ status: string }>(
    `select status from catalog_alias_projections where catalog_item_id = $1`,
    [seed.provisionalPlantId],
  );
  if (alias.rows[0]?.status !== "user_provisional") throw new Error(`rollback: alias projection is ${alias.rows[0]?.status}`);
  const normalized = await nameNormalized(queryable, seed.apostropheNameId);
  if (normalized !== "мар’яна") throw new Error(`rollback: apostrophe name normalized as ${normalized}`);
}

async function assertNormalized(queryable: Queryable, seed: Seed, label: string) {
  const normalized = await nameNormalized(queryable, seed.apostropheNameId);
  if (normalized !== "мар'яна") throw new Error(`${label}: apostrophe name normalized as ${normalized}`);
  const drift = await queryable.query<{ n: number }>(
    `select count(*)::int as n from catalog_item_names
     where normalized_name is distinct from catalog_normalize_name(display_name)`,
  );
  if ((drift.rows[0]?.n ?? 1) !== 0) throw new Error(`${label}: ${drift.rows[0]?.n} names still carry the legacy form`);
}

async function assertWeights(queryable: Queryable, seed: Seed, label: string) {
  const rows = await queryable.query<{
    id: string;
    search_weight: string;
    registered_ua: boolean;
    registered_eu: boolean;
    has_registered_forms: boolean;
    is_host: boolean;
  }>(
    `select id, search_weight::text, registered_ua, registered_eu, has_registered_forms, is_host
     from catalog_items where id = any($1::uuid[])`,
    [[seed.speciesId, seed.cultivarId, seed.competitorId, seed.animalTaxonId, seed.breedId]],
  );
  const byId = new Map(rows.rows.map((row) => [row.id, row]));
  const expectRow = (id: string, expected: { weight: number; ua: boolean; forms: boolean }, name: string) => {
    const row = byId.get(id);
    if (!row) throw new Error(`${label}: ${name} missing`);
    if (
      Number(row.search_weight).toFixed(4) !== expected.weight.toFixed(4) ||
      row.registered_ua !== expected.ua ||
      row.registered_eu !== false ||
      row.has_registered_forms !== expected.forms ||
      row.is_host !== false
    ) {
      throw new Error(`${label}: ${name} ranking inputs ${JSON.stringify(row)} expected ${JSON.stringify(expected)}`);
    }
  };
  // The species: one object with two active entries; registered through its
  // form; has registered forms. The cultivar: one object (another owner's)
  // with one active entry; registered by its identifier.
  expectRow(seed.speciesId, { weight: Math.log(2) + Math.log(3), ua: true, forms: true }, "species");
  expectRow(seed.cultivarId, { weight: Math.log(2) + Math.log(2), ua: true, forms: false }, "cultivar");
  expectRow(seed.competitorId, { weight: 0, ua: true, forms: false }, "competitor");
  expectRow(seed.animalTaxonId, { weight: 0, ua: false, forms: false }, "animal taxon");
  expectRow(seed.breedId, { weight: 0, ua: false, forms: false }, "breed");

  const again = await queryable.query<{ touched: number }>("select catalog_recompute_search_weight() as touched");
  if (Number(again.rows[0]?.touched) !== 0) throw new Error(`${label}: a second recompute changed ${again.rows[0]?.touched} rows`);
}

async function assertPicker(kdb: Kysely<Database>, seed: Seed) {
  // Imported here, after the environment is loaded, so the shared `db` module
  // does not warn about a missing connection at import time.
  const { recordCatalogSearchMiss, searchCatalogSuggestionsForTypeaheadResult } =
    await import("../src/server/catalog-repository");
  const search = (query: string, locale: "uk" | "bg" | "ru", objectKind: "plant" | "animal") =>
    searchCatalogSuggestionsForTypeaheadResult(
      query,
      { objectKind, locale },
      { runStatement: async (statement) => (await statement.execute(kdb)).rows },
    );
  const firstIs = async (query: string, locale: "uk" | "bg" | "ru", objectKind: "plant" | "animal", id: string, what: string) => {
    const result = await search(query, locale, objectKind);
    const first = result.suggestions[0];
    if (first?.id !== id) {
      throw new Error(
        `picker: "${query}" (${locale}, ${objectKind}) put ${JSON.stringify(first)} first, expected ${what}`,
      );
    }
    return result.suggestions;
  };

  // The fixed set of the task: the tomato species first, every time.
  for (const [query, locale] of [
    ["томат", "uk"],
    ["помідор", "uk"],
    ["домати", "bg"],
    ["tomato", "uk"],
    ["Lycopersicon esculentum", "uk"],
    ["тамат", "uk"],
    ["Помідор", "ru"],
  ] as const) {
    await firstIs(query, locale, "plant", seed.speciesId, "the tomato species");
  }
  const tomato = await search("томат", "uk", "plant");
  if (tomato.suggestions[0]?.displayName !== "Помідор" || tomato.suggestions[0]?.matchedName !== "томат") {
    throw new Error(`picker: the species row is ${JSON.stringify(tomato.suggestions[0])}`);
  }
  if (tomato.suggestions[0]?.publicPath !== "/species/ove387-solanum-lycopersicum") {
    throw new Error(`picker: the species path is ${tomato.suggestions[0]?.publicPath}`);
  }
  if (tomato.suggestions[0]?.kind !== "species") throw new Error("picker: the taxon does not read as a species");

  // A form carries its species.
  const forms = await firstIs("де барао", "uk", "plant", seed.cultivarId, "the De Barao cultivar");
  if (forms[0]?.kind !== "cultivar" || forms[0]?.parentDisplayName !== "Помідор") {
    throw new Error(`picker: the cultivar row is ${JSON.stringify(forms[0])}`);
  }

  // The renormalized apostrophe: typed with a curly apostrophe, found by prefix.
  await firstIs("Мар’я", "uk", "plant", seed.apostropheId, "the Мар’яна cultivar");
  await firstIs("мар'я", "uk", "plant", seed.apostropheId, "the Мар’яна cultivar");

  // The kind filter: a taxon by kingdom, a breed for animals.
  const bees = await firstIs("бджола", "uk", "animal", seed.animalTaxonId, "Apis mellifera");
  if (!bees.some((row) => row.id === seed.breedId)) throw new Error("picker: the breed is missing for an animal");
  if ((await search("бджола", "uk", "plant")).suggestions.some((row) => row.id === seed.animalTaxonId || row.id === seed.breedId)) {
    throw new Error("picker: an animal row answered a plant query");
  }
  if ((await search("томат", "uk", "animal")).suggestions.some((row) => row.id === seed.speciesId)) {
    throw new Error("picker: a plant taxon answered an animal query");
  }

  // Retired and merged rows never leave the database.
  for (const [query, locale, kind] of [["мій томат", "uk", "plant"], ["бджола сусіда", "uk", "animal"], ["де-барао", "uk", "plant"]] as const) {
    const ids = (await search(query, locale, kind)).suggestions.map((row) => row.id);
    if (ids.includes(seed.provisionalPlantId) || ids.includes(seed.provisionalAnimalId) || ids.includes(seed.mergedId)) {
      throw new Error(`picker: "${query}" returned a retired or merged card`);
    }
  }

  // The list is bounded and small.
  const broad = await search("по", "uk", "plant");
  if (broad.suggestions.length > 8) throw new Error(`picker: ${broad.suggestions.length} rows for a two-letter query`);
  const bytes = Buffer.byteLength(JSON.stringify({ suggestions: broad.suggestions.map(serializeRow), state: broad.state }));
  if (broad.suggestions.length === 8 && bytes > 1024) throw new Error(`picker: eight rows weigh ${bytes} bytes`);

  // Search misses accumulate with the normalized text, never a raw string
  // longer than 120 characters.
  const first = await recordCatalogSearchMiss({ query: "  Де   Барао ", locale: "uk", objectKind: "plant" }, kdb);
  const second = await recordCatalogSearchMiss({ query: "де барао", locale: "uk", objectKind: "plant" }, kdb);
  if (first?.queryNormalized !== "де барао" || second?.occurrences !== 2) {
    throw new Error(`picker: search misses ${JSON.stringify({ first, second })}`);
  }
  const long = await recordCatalogSearchMiss({ query: "я".repeat(300), locale: "bg", objectKind: "animal" }, kdb);
  if ((long?.queryNormalized.length ?? 0) > 120) throw new Error("picker: a search miss kept more than 120 characters");
  const short = await recordCatalogSearchMiss({ query: "де", locale: "uk", objectKind: "plant" }, kdb);
  if (short !== null) throw new Error("picker: a two-character query was recorded as a miss");
  const misses = await kdb.selectFrom("catalog_search_misses").select(({ fn }) => fn.countAll<number>().as("n")).executeTakeFirstOrThrow();
  if (Number(misses.n) !== 2) throw new Error(`picker: ${misses.n} search miss rows, expected 2`);
  return { fixedSet: 7, bytesForBroadQuery: bytes, broadRows: broad.suggestions.length };
}

function serializeRow(row: CatalogSuggestion) {
  return {
    id: row.id,
    displayName: row.displayName,
    kind: row.kind,
    ...(row.matchedName ? { matchedName: row.matchedName } : {}),
    ...(row.parentDisplayName ? { parentDisplayName: row.parentDisplayName } : {}),
    ...(row.publicPath ? { publicPath: row.publicPath } : {}),
  };
}

async function displayNameFingerprint(queryable: Queryable) {
  const rows = await queryable.query<{ line: string }>(
    `select line from (
       select 'object:' || id::text || ':' || display_name as line, 0 as k, id::text as o from plant_objects
       union all
       select 'name:' || id::text || ':' || display_name, 1, id::text from catalog_item_names
       union all
       select 'item:' || id::text || ':' || canonical_name || ':' || coalesce(public_slug, ''), 2, id::text from catalog_items
     ) as lines order by k, o`,
  );
  return sha256(rows.rows.map((row) => row.line).join("\n"));
}

async function stateFingerprint(queryable: Queryable) {
  const rows = await queryable.query<{ line: string }>(
    `select line from (
       select 'object:' || id::text || ':' || variety_state || ':' || coalesce(variety_text, '') || ':' || coalesce(catalog_item_id::text, '') as line, 0 as k, id::text as o from plant_objects
       union all
       select 'item:' || id::text || ':' || identity_state || ':' || search_weight::text || ':' || registered_ua::text || ':' || registered_eu::text || ':' || has_registered_forms::text || ':' || is_host::text, 1, id::text from catalog_items
       union all
       select 'name:' || id::text || ':' || normalized_name, 2, id::text from catalog_item_names
       union all
       select 'alias:' || id::text || ':' || status, 3, id::text from catalog_alias_projections
       union all
       select 'suggestion:' || id::text || ':' || status, 4, id::text from catalog_match_suggestions
     ) as lines order by k, o`,
  );
  return sha256(rows.rows.map((row) => row.line).join("\n"));
}

async function structure(queryable: Queryable) {
  const fn = await queryable.query(
    `select 1 from pg_proc where proname = 'catalog_recompute_search_weight'`,
  );
  const idx = await queryable.query(
    `select 1 from pg_indexes where indexname = 'catalog_item_names_normalized_trgm_idx'`,
  );
  return { functionPresent: (fn.rowCount ?? 0) > 0, indexPresent: (idx.rowCount ?? 0) > 0 };
}

async function nameNormalized(queryable: Queryable, nameId: string) {
  const result = await queryable.query<{ normalized_name: string }>(
    `select normalized_name from catalog_item_names where id = $1`,
    [nameId],
  );
  return result.rows[0]?.normalized_name ?? null;
}

async function count(queryable: Queryable, fromClause: string) {
  const result = await queryable.query<{ n: number }>(`select count(*)::int as n from ${fromClause}`);
  return result.rows[0]?.n ?? 0;
}

function migrationSql() {
  return readFileSync(path.join(process.cwd(), "sql", MIGRATION_FILE), "utf8");
}

function rollbackSql() {
  return readFileSync(path.join(process.cwd(), "sql", "rollback", ROLLBACK_FILE), "utf8");
}

function trigramSetsSql() {
  return readFileSync(path.join(process.cwd(), "sql", TRIGRAM_SETS_FILE), "utf8");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function runDisposableProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const databaseUrl = requiredEnv("DATABASE_URL");

  const disposable = `overgarden_ove387_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 2 });
  const kdb = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    await applyMigrationsBefore(pool, targetUrl.toString(), MIGRATION);
    const seed = await seedCatalog(pool);

    const before = await structure(pool);
    if (before.functionPresent || before.indexPresent) throw new Error("before: 0055 objects already present");
    const namesBefore = await displayNameFingerprint(pool);

    await pool.query(migrationSql());
    await pool.query(trigramSetsSql());
    const after = await structure(pool);
    if (!after.functionPresent || !after.indexPresent) throw new Error("after: 0055 objects missing");
    await assertLabels(pool, seed, "after");
    await assertNormalized(pool, seed, "after");
    await assertWeights(pool, seed, "after");
    if ((await displayNameFingerprint(pool)) !== namesBefore) throw new Error("after: a display name changed");
    const stateFirst = await stateFingerprint(pool);
    const picker = await assertPicker(kdb, seed);

    await pool.query(migrationSql());
    if ((await stateFingerprint(pool)) !== stateFirst) throw new Error("replay: a second application changed the data");

    await pool.query(rollbackSql());
    const rolledBack = await structure(pool);
    if (rolledBack.functionPresent || rolledBack.indexPresent) throw new Error("rollback: 0055 objects remain");
    await assertRolledBack(pool, seed);
    if ((await displayNameFingerprint(pool)) !== namesBefore) throw new Error("rollback: a display name changed");

    await pool.query(migrationSql());
    await assertLabels(pool, seed, "reapply");
    await assertNormalized(pool, seed, "reapply");
    if ((await stateFingerprint(pool)) !== stateFirst) throw new Error("reapply: the state differs from the first application");
    if ((await displayNameFingerprint(pool)) !== namesBefore) throw new Error("reapply: a display name changed");

    return {
      schemaVersion: "ove387.catalogPickerLabels.v1",
      mode: "disposable",
      status: "pass",
      migration: MIGRATION,
      objectsRelabelled: 3,
      cardsRetired: 2,
      namesRenormalized: 1,
      fixedSetQueries: picker.fixedSet,
      broadQueryRows: picker.broadRows,
      broadQueryBytes: picker.bytesForBroadQuery,
      displayNamesUnchanged: true,
      replayIsNoOp: true,
      rollbackRestoresLinks: true,
      reapplyReproducesState: true,
    };
  } finally {
    await kdb.destroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

async function main() {
  const result = await runDisposableProof();
  console.log(JSON.stringify(result, null, 2));
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).endsWith("prove-catalog-picker-labels.ts");

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
