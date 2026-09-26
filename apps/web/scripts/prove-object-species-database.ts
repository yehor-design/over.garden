import "./neutralise-server-only";

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Client, Pool } from "pg";

import type { Database } from "../src/db/schema";
import { loadVersionedApplicationSql } from "./application-sql";
import { cultivarNameKey } from "../src/lib/catalog/cultivar-key";
import { CULTIVAR_KEY_FIXTURE } from "../src/lib/catalog/cultivar-key-fixture";
import type { ObjectSetupInput } from "../src/lib/garden/object-setup";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import {
  buildStandardSpeciesTypeaheadStatement,
  STANDARD_SPECIES_TYPEAHEAD_DEADLINE_MS,
} from "../src/server/catalog-repository";
import {
  buildAnonymizeOwnedCatalogOperatorFieldsForErasureQuery,
  buildAnonymizePlantObjectsForErasureQuery,
} from "../src/server/erasure-execution";
import type { ClaimedOwnedPhoto } from "../src/server/media/owned-photo-handoff";
import { changeObjectPhoto } from "../src/server/object-photo-repository";
import { createOwnedObject } from "../src/server/object-setup-repository";
import { readPublicCatalogCanonicalAddress } from "../src/server/public-catalog-address-repository";
import { getSpeciesPage } from "../src/server/species-page";
import {
  findOrCreateSpeciesForm,
  listSpeciesForms,
} from "../src/server/species-forms-repository";
import { applyMigrationsBefore } from "./prove-organism-graph-foundation";

/**
 * Executes migration `0086` and the object's species and cultivar choices
 * (OVE-524) on a fresh disposable database built from every migration, with
 * objects in every state the release before it wrote.
 *
 * What it proves:
 *
 *   * the migration moves a label to the own species and an unknown object's
 *     stray text with it, leaves every linked and every empty object as it
 *     was, and its CHECK refuses each shape the two choices cannot take;
 *   * `catalog_cultivar_key` in Postgres and `cultivarNameKey` in TypeScript
 *     agree on the shared fixture;
 *   * a new breed typed in the stepper becomes one shared entry of its
 *     species — a form with its own assertion, relation, name and address,
 *     created by the gardener and not reviewed — and a second gardener sees it
 *     in the list and reuses it by any spelling with the same key; two
 *     gardeners adding one name at once make one entry;
 *   * the list holds the forms some object uses and the gardeners' entries,
 *     never a registered form nobody uses, never a merged entry; a typed name
 *     that matches an unused registered form reuses it;
 *   * an own species with an own cultivar, and nothing known, are stored as
 *     chosen; a species outside the base, of the other kind, or an entry of
 *     another species is refused;
 *   * a gardener's entry has an address and a species page like any form;
 *   * account erasure clears the entry's creator and keeps the entry, and
 *     clears an object's own species;
 *   * an object's photo is written, replaced and removed with its files
 *     queued for revocation;
 *   * the first species search on a fresh database backend answers inside
 *     its deadline, on every one of several fresh backends — the cold path
 *     that answered 503 on production on 2026-09-25;
 *   * replaying every migration over these rows succeeds (the `0001` and
 *     `0061` guards), the rollback folds the new states back and the
 *     migration then re-applies.
 *
 * Output is aggregate: counts, booleans and names from this file's own seed.
 * Never a connection string.
 */

const MIGRATION = "0086_ove524_species_and_cultivar_choices.sql";
const ROLLBACK = "0086_ove524_species_and_cultivar_choices.down.sql";
const COLD_SAMPLES = 5;

type Queryable = Pool | Client;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function migrationSql() {
  return readFileSync(path.join(process.cwd(), "sql", MIGRATION), "utf8");
}

function rollbackSql() {
  return readFileSync(
    path.join(process.cwd(), "sql", "rollback", ROLLBACK),
    "utf8",
  );
}

async function one<T>(
  queryable: Queryable,
  statement: string,
  params: unknown[] = [],
) {
  const result = await queryable.query(statement, params);
  return result.rows[0] as T;
}

async function expectRefusal(
  pool: Pool,
  statement: string,
  params: unknown[],
  label: string,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    try {
      await client.query(statement, params);
    } catch {
      return;
    } finally {
      await client.query("rollback");
    }
  } finally {
    client.release();
  }
  throw new Error(`${label} was accepted`);
}

let seedAssertion: string | null = null;

async function assertionFor(pool: Pool): Promise<string> {
  if (seedAssertion) return seedAssertion;
  const snapshot = await one<{ id: string }>(
    pool,
    `insert into catalog_source_snapshots (
       source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status
     )
     values ('ove524-seed', 'Seed', 'species_backbone', 'ove524-proof', 'https://example.test/',
             'CC0', 'ove524-proof', $1, now(), now(), 'imported')
     returning id`,
    [createHash("sha256").update(randomUUID()).digest("hex")],
  );
  const assertion = await one<{ id: string }>(
    pool,
    `insert into catalog_source_assertions (
       source_slug, source_snapshot_id, rights_class, confidence, decision, reason_codes
     )
     values ('ove524-seed', $1, 'source_public', 1, 'automatic', array['ove524_seed'])
     returning id`,
    [snapshot.id],
  );
  seedAssertion = assertion.id;
  return seedAssertion;
}

async function taxon(
  pool: Pool,
  input: {
    latin: string;
    slug: string;
    kingdom: "Plantae" | "Animalia";
    vernacular: string;
    base?: {
      kind: "plant" | "animal";
      key: string;
      group: string;
      popularity: number;
    };
  },
) {
  const id = randomUUID();
  await pool.query(
    `insert into catalog_items (
       id, canonical_name, normalized_name, public_slug, source, source_id,
       locale, node_kind, kingdom, rank, identity_state
     )
     values ($1, $2, catalog_normalize_name($2), $3, 'species_backbone', $4,
             'la', 'taxon', $5, 'species', 'active')`,
    [id, input.latin, input.slug, `ove524:${id}`, input.kingdom],
  );
  await pool.query(
    `insert into catalog_item_names (
       catalog_item_id, display_name, normalized_name, locale, script,
       is_primary, name_type, weight
     )
     values ($1, $2, catalog_normalize_name($2), 'la', 'latin', true, 'scientific_accepted', 5),
            ($1, $3, catalog_normalize_name($3), 'uk', 'cyrillic', true, 'vernacular', 5)`,
    [id, input.latin, input.vernacular],
  );
  if (input.base) {
    await pool.query(
      `insert into catalog_standard_species (
         catalog_item_id, base_key, object_kind, base_group, latin_name,
         popularity, base_version
       )
       values ($1, $2, $3, $4, $5, $6, '2026-09-26')`,
      [
        id,
        input.base.key,
        input.base.kind,
        input.base.group,
        input.latin,
        input.base.popularity,
      ],
    );
  }
  return id;
}

async function registeredForm(
  pool: Pool,
  input: { name: string; slug: string; species: string },
) {
  const id = randomUUID();
  await pool.query(
    `insert into catalog_items (
       id, canonical_name, normalized_name, public_slug, source, source_id,
       locale, node_kind, kingdom, rank, identity_state
     )
     values ($1, $2, catalog_normalize_name($2), $3, 'ua_state_register', $4,
             'uk', 'cultivar', 'Plantae', 'cultivar', 'active')`,
    [id, input.name, input.slug, `ove524:${id}`],
  );
  await pool.query(
    `insert into catalog_item_names (
       catalog_item_id, display_name, normalized_name, locale, script,
       is_primary, name_type, weight
     )
     values ($1, $2, catalog_normalize_name($2), 'uk', 'cyrillic', true, 'denomination', 4)`,
    [id, input.name],
  );
  await pool.query(
    `insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id)
     values ($1, $2, 'form_of', $3)`,
    [id, input.species, await assertionFor(pool)],
  );
  return id;
}

async function gardener(pool: Pool, label: string) {
  const id = randomUUID();
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, $2, $3, true, now(), now())`,
    [id, `ove524 ${label}`, `ove524-${label}-${id.slice(0, 8)}@example.test`],
  );
  const space = randomUUID();
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Двір')`,
    [space, id],
  );
  return { id, space };
}

async function seedBefore(pool: Pool) {
  const tomato = await taxon(pool, {
    latin: "Solanum lycopersicum",
    slug: "solanum-lycopersicum",
    kingdom: "Plantae",
    vernacular: "помідор",
    base: {
      kind: "plant",
      key: "plant:tomato",
      group: "vegetables",
      popularity: 90,
    },
  });
  const chicken = await taxon(pool, {
    latin: "Gallus gallus domesticus",
    slug: "gallus-gallus-domesticus",
    kingdom: "Animalia",
    vernacular: "курка",
    base: {
      kind: "animal",
      key: "animal:chicken",
      group: "poultry",
      popularity: 16,
    },
  });
  const turtle = await taxon(pool, {
    latin: "Testudo graeca",
    slug: "testudo-graeca",
    kingdom: "Animalia",
    vernacular: "черепаха",
    base: {
      kind: "animal",
      key: "animal:turtle",
      group: "reptiles",
      popularity: 3,
    },
  });
  const wolf = await taxon(pool, {
    latin: "Canis lupus",
    slug: "canis-lupus",
    kingdom: "Animalia",
    vernacular: "вовк",
  });
  const oxheart = await registeredForm(pool, {
    name: "Бичаче серце",
    slug: "bychache-sertse",
    species: tomato,
  });
  const barao = await registeredForm(pool, {
    name: "Де Барао",
    slug: "de-barao",
    species: tomato,
  });
  const first = await gardener(pool, "first");
  const objects = {
    onSpecies: randomUUID(),
    onOxheart: randomUUID(),
    label: randomUUID(),
    emptyLabel: randomUUID(),
    unknownWithText: randomUUID(),
    unknown: randomUUID(),
  };
  const insert = `insert into plant_objects (
      id, owner_user_id, space_id, display_name, object_kind,
      catalog_item_id, variety_state, variety_text
    ) values ($1, $2, $3, $4, $5, $6, $7, $8)`;
  for (const row of [
    [
      objects.onSpecies,
      "Помідор на балконі",
      "plant",
      tomato,
      "selected",
      "Solanum lycopersicum",
    ],
    [
      objects.onOxheart,
      "Бичаче серце з грядки",
      "plant",
      oxheart,
      "selected",
      "Бичаче серце",
    ],
    [
      objects.label,
      "Мій томат",
      "plant",
      null,
      "free_text",
      "  Томат  бабусин ",
    ],
    [objects.emptyLabel, "Без назви", "plant", null, "free_text", "   "],
    [
      objects.unknownWithText,
      "Молода яблуня",
      "plant",
      null,
      "unknown",
      "Сорт ще не визначено",
    ],
    [objects.unknown, "Невідома", "plant", null, "unknown", null],
  ] as const) {
    await pool.query(insert, [
      row[0],
      first.id,
      first.space,
      row[1],
      row[2],
      row[3],
      row[4],
      row[5],
    ]);
  }
  return { tomato, chicken, turtle, wolf, oxheart, barao, first, objects };
}

type Seed = Awaited<ReturnType<typeof seedBefore>>;

async function objectState(pool: Pool, id: string) {
  return one<{
    catalog_item_id: string | null;
    variety_state: string;
    variety_text: string | null;
    species_text: string | null;
  }>(
    pool,
    `select catalog_item_id, variety_state, variety_text, species_text
       from plant_objects where id = $1`,
    [id],
  );
}

async function objectsFingerprint(pool: Pool) {
  const result = await pool.query(
    `select id, catalog_item_id, variety_state, variety_text, species_text
       from plant_objects order by id`,
  );
  return createHash("sha256").update(JSON.stringify(result.rows)).digest("hex");
}

async function assertMigrated(pool: Pool, seed: Seed, label: string) {
  const o = seed.objects;
  const onSpecies = await objectState(pool, o.onSpecies);
  check(
    onSpecies.catalog_item_id === seed.tomato &&
      onSpecies.variety_state === "selected" &&
      onSpecies.species_text === null,
    `${label}: a species link changed`,
  );
  const onOxheart = await objectState(pool, o.onOxheart);
  check(
    onOxheart.catalog_item_id === seed.oxheart &&
      onOxheart.variety_text === "Бичаче серце",
    `${label}: a cultivar link changed`,
  );
  const labelled = await objectState(pool, o.label);
  check(
    labelled.variety_state === "unknown" &&
      labelled.variety_text === null &&
      labelled.species_text === "Томат бабусин",
    `${label}: the label did not become the own species: ${JSON.stringify(labelled)}`,
  );
  const empty = await objectState(pool, o.emptyLabel);
  check(
    empty.variety_state === "unknown" &&
      empty.variety_text === null &&
      empty.species_text === null,
    `${label}: an empty label was kept`,
  );
  const stray = await objectState(pool, o.unknownWithText);
  check(
    stray.variety_state === "unknown" &&
      stray.variety_text === null &&
      stray.species_text === "Сорт ще не визначено",
    `${label}: an unknown object's text was lost`,
  );
  const unknown = await objectState(pool, o.unknown);
  check(
    unknown.variety_state === "unknown" && unknown.species_text === null,
    `${label}: an empty object changed`,
  );
}

async function assertChecks(pool: Pool, seed: Seed) {
  const insert = `insert into plant_objects (
      id, owner_user_id, space_id, display_name, object_kind,
      catalog_item_id, variety_state, variety_text, species_text
    ) values (gen_random_uuid(), $1, $2, 'x', 'plant', $3, $4, $5, $6)`;
  const owner = seed.first.id;
  const space = seed.first.space;
  for (const [label, params] of [
    ["a link without a node", [null, "selected", "x", null]],
    ["a link beside an own species", [seed.tomato, "selected", "x", "Томат"]],
    ["nothing known with a text", [null, "unknown", "x", null]],
    ["an own cultivar without an own species", [null, "own", "x", null]],
    ["an own cultivar without its text", [null, "own", null, "Томат"]],
    ["an own cultivar beside a link", [seed.tomato, "own", "x", "Томат"]],
    ["an untrimmed own species", [null, "unknown", null, " Томат "]],
    ["a label beside an own species", [null, "free_text", "x", "Томат"]],
    ["a state outside the vocabulary", [null, "guessed", null, null]],
  ] as const) {
    await expectRefusal(pool, insert, [owner, space, ...params], label);
  }
  return 9;
}

async function assertKeyParity(pool: Pool) {
  for (const [value, key] of CULTIVAR_KEY_FIXTURE) {
    const row = await one<{ key: string }>(
      pool,
      "select catalog_cultivar_key($1) as key",
      [value],
    );
    check(
      row.key === key,
      `catalog_cultivar_key(${JSON.stringify(value)}) is ${row.key}, not ${key}`,
    );
    check(
      cultivarNameKey(value) === key,
      `cultivarNameKey(${JSON.stringify(value)}) differs`,
    );
  }
  return CULTIVAR_KEY_FIXTURE.length;
}

function objectInput(
  seed: Seed,
  space: string,
  input: Partial<ObjectSetupInput> &
    Pick<ObjectSetupInput, "objectKind" | "displayName">,
): ObjectSetupInput {
  return {
    requestId: randomUUID(),
    spaceId: space,
    species: { kind: "unknown" },
    cultivar: { kind: "unknown" },
    photo: null,
    allowDuplicateName: false,
    ...input,
  };
}

async function gardenerEntries(pool: Pool, species: string) {
  const result = await pool.query<{ id: string; canonical_name: string }>(
    `select item.id, item.canonical_name
       from catalog_items as item
       join catalog_item_relations as relation
         on relation.from_catalog_item_id = item.id and relation.relation_type = 'form_of'
      where relation.to_catalog_item_id = $1 and item.source = 'gardener'
      order by item.created_at`,
    [species],
  );
  return result.rows;
}

async function assertWriter(pool: Pool, kdb: Kysely<Database>, seed: Seed) {
  const first = seed.first;
  const second = await gardener(pool, "second");

  // The full run: an animal, «Рябка», species «курка», a new breed «Брама».
  const ryabka = objectInput(seed, first.space, {
    objectKind: "animal",
    displayName: "Рябка",
    species: { kind: "catalog", catalogItemId: seed.chicken },
    cultivar: { kind: "new", name: "Брама" },
  });
  const created = await createOwnedObject({ userId: first.id }, ryabka, kdb, {
    locale: "uk",
  });
  check(
    created.status === "created",
    `the full run was not created: ${created.status}`,
  );
  const entries = await gardenerEntries(pool, seed.chicken);
  check(
    entries.length === 1 && entries[0]!.canonical_name === "Брама",
    "no single «Брама» entry",
  );
  const brama = entries[0]!.id;
  const entry = await one<Record<string, unknown>>(
    pool,
    `select source, created_by_user_id, reviewed_at, node_kind, rank, kingdom,
            identity_state, public_slug, locale,
            (select count(*)::int from catalog_item_names where catalog_item_id = $1) as names,
            (select name_type from catalog_item_names where catalog_item_id = $1 limit 1) as name_type,
            (select count(*)::int from catalog_item_slug_history where catalog_item_id = $1) as slugs
       from catalog_items where id = $1`,
    [brama],
  );
  check(
    entry.source === "gardener" &&
      entry.created_by_user_id === first.id &&
      entry.reviewed_at === null &&
      entry.node_kind === "breed" &&
      entry.rank === "breed" &&
      entry.kingdom === "Animalia" &&
      entry.identity_state === "active" &&
      entry.public_slug === "brama" &&
      entry.locale === "uk" &&
      entry.names === 1 &&
      entry.name_type === "denomination" &&
      entry.slugs === 1,
    `the «Брама» entry is not a shared unreviewed breed: ${JSON.stringify(entry)}`,
  );
  const ryabkaRow = await objectState(pool, ryabka.requestId);
  check(
    ryabkaRow.catalog_item_id === brama &&
      ryabkaRow.variety_state === "selected" &&
      ryabkaRow.variety_text === "Брама" &&
      ryabkaRow.species_text === null,
    "«Рябка» does not point at its breed",
  );

  // A second gardener sees it at once, and «брама» reuses it.
  const list = await listSpeciesForms(
    { speciesId: seed.chicken, objectKind: "animal" },
    kdb,
  );
  check(
    list.some((row) => row.id === brama),
    "the second gardener's list has no «Брама»",
  );
  const again = objectInput(seed, second.space, {
    objectKind: "animal",
    displayName: "Чорнушка",
    species: { kind: "catalog", catalogItemId: seed.chicken },
    cultivar: { kind: "new", name: " брама " },
  });
  check(
    (
      await createOwnedObject({ userId: second.id }, again, kdb, {
        locale: "ru",
      })
    ).status === "created",
    "the second «брама» was not created",
  );
  check(
    (await gardenerEntries(pool, seed.chicken)).length === 1,
    "«брама» made a duplicate",
  );
  check(
    (await objectState(pool, again.requestId)).catalog_item_id === brama,
    "«брама» did not reuse «Брама»",
  );

  // Ukrainian and Russian spellings of one name are one entry.
  for (const name of ["Черокі", "Чероки"]) {
    await createOwnedObject(
      { userId: first.id },
      objectInput(seed, first.space, {
        objectKind: "plant",
        displayName: `Помідор ${name}`,
        species: { kind: "catalog", catalogItemId: seed.tomato },
        cultivar: { kind: "new", name },
      }),
      kdb,
      { locale: "uk" },
    );
  }
  const tomatoEntries = await gardenerEntries(pool, seed.tomato);
  check(
    tomatoEntries.length === 1 && tomatoEntries[0]!.canonical_name === "Черокі",
    `«Черокі» and «Чероки» are not one entry: ${JSON.stringify(tomatoEntries)}`,
  );

  // A typed name that matches a registered form nobody used reuses it.
  const barao = objectInput(seed, first.space, {
    objectKind: "plant",
    displayName: "Барао на шпалері",
    species: { kind: "catalog", catalogItemId: seed.tomato },
    cultivar: { kind: "new", name: "де-барао" },
  });
  await createOwnedObject({ userId: first.id }, barao, kdb, { locale: "uk" });
  check(
    (await objectState(pool, barao.requestId)).catalog_item_id === seed.barao,
    "«де-барао» made an entry",
  );
  check(
    (await gardenerEntries(pool, seed.tomato)).length === 1,
    "a registered name became a gardener entry",
  );

  // The list: used and added, most used first, never unused or merged.
  const beforeMerge = await listSpeciesForms(
    { speciesId: seed.tomato, objectKind: "plant" },
    kdb,
  );
  const cherokee = tomatoEntries[0]!.id;
  check(
    JSON.stringify(beforeMerge.map((row) => row.name)) ===
      JSON.stringify(["Черокі", "Бичаче серце", "Де Барао"]),
    `the tomato list is not ordered by use: ${JSON.stringify(beforeMerge.map((row) => row.name))}`,
  );
  const unused = await registeredForm(pool, {
    name: "Ніхто не садив",
    slug: "nikhto-ne-sadyv",
    species: seed.tomato,
  });
  const withUnused = await listSpeciesForms(
    { speciesId: seed.tomato, objectKind: "plant" },
    kdb,
  );
  check(
    !withUnused.some((row) => row.id === unused),
    "an unused registered form is offered",
  );
  const orphan = await kdb.transaction().execute((trx) =>
    findOrCreateSpeciesForm(trx, {
      species: {
        id: seed.tomato,
        canonicalName: "Solanum lycopersicum",
        kingdom: "Plantae",
      },
      objectKind: "plant",
      name: "Рожевий мед",
      locale: "uk",
      userId: second.id,
    }),
  );
  check(orphan.created, "«Рожевий мед» was not created");
  const withOrphan = await listSpeciesForms(
    { speciesId: seed.tomato, objectKind: "plant" },
    kdb,
  );
  check(
    withOrphan.some((row) => row.id === orphan.id),
    "an added entry no object uses yet is not offered",
  );
  await pool.query(
    `update catalog_items set identity_state = 'merged', merged_into_catalog_item_id = $2 where id = $1`,
    [orphan.id, cherokee],
  );
  const merged = await listSpeciesForms(
    { speciesId: seed.tomato, objectKind: "plant" },
    kdb,
  );
  check(
    !merged.some((row) => row.id === orphan.id),
    "a merged entry is offered",
  );

  // Two gardeners adding one name at once make one entry.
  const racers = await Promise.all(
    [first.id, second.id].map((userId) =>
      kdb.transaction().execute((trx) =>
        findOrCreateSpeciesForm(trx, {
          species: {
            id: seed.chicken,
            canonicalName: "Gallus gallus domesticus",
            kingdom: "Animalia",
          },
          objectKind: "animal",
          name: "Кохінхін",
          locale: "uk",
          userId,
        }),
      ),
    ),
  );
  check(
    racers[0]!.id === racers[1]!.id,
    "two concurrent «Кохінхін» made two entries",
  );
  check(
    racers.filter((racer) => racer.created).length === 1,
    "both racers claim to have created it",
  );

  // Own species with an own cultivar; nothing known.
  const own = objectInput(seed, first.space, {
    objectKind: "plant",
    displayName: "Бабусин кущ",
    species: { kind: "own", text: "Помідор бабусин" },
    cultivar: { kind: "own", text: "Рожевий" },
  });
  await createOwnedObject({ userId: first.id }, own, kdb, { locale: "uk" });
  const ownRow = await objectState(pool, own.requestId);
  check(
    ownRow.catalog_item_id === null &&
      ownRow.variety_state === "own" &&
      ownRow.variety_text === "Рожевий" &&
      ownRow.species_text === "Помідор бабусин",
    `the own species and cultivar were not stored as chosen: ${JSON.stringify(ownRow)}`,
  );
  const nothing = objectInput(seed, first.space, {
    objectKind: "plant",
    displayName: "Щось зелене",
  });
  await createOwnedObject({ userId: first.id }, nothing, kdb, { locale: "uk" });
  const nothingRow = await objectState(pool, nothing.requestId);
  check(
    nothingRow.variety_state === "unknown" &&
      nothingRow.catalog_item_id === null &&
      nothingRow.species_text === null,
    "«Не знаю» stored something",
  );

  // Refusals: outside the base, the other kind, another species' entry.
  for (const [label, input] of [
    [
      "a species outside the base",
      {
        objectKind: "animal",
        displayName: "Сірко",
        species: { kind: "catalog", catalogItemId: seed.wolf },
      },
    ],
    [
      "a base species of the other kind",
      {
        objectKind: "plant",
        displayName: "Курка-рослина",
        species: { kind: "catalog", catalogItemId: seed.chicken },
      },
    ],
    [
      "another species' entry",
      {
        objectKind: "animal",
        displayName: "Черепаха Брама",
        species: { kind: "catalog", catalogItemId: seed.turtle },
        cultivar: { kind: "entry", catalogItemId: brama },
      },
    ],
  ] as const) {
    const result = await createOwnedObject(
      { userId: first.id },
      objectInput(
        seed,
        first.space,
        input as Partial<ObjectSetupInput> &
          Pick<ObjectSetupInput, "objectKind" | "displayName">,
      ),
      kdb,
      { locale: "uk" },
    );
    check(
      result.status === "identity_unavailable",
      `${label} was accepted: ${result.status}`,
    );
  }

  // A gardener's entry has an address and a species page, like any form.
  const address = await readPublicCatalogCanonicalAddress(kdb, brama);
  check(
    address?.canonicalPath === "/species/gallus-gallus-domesticus/brama",
    `«Брама» has no form address: ${JSON.stringify(address)}`,
  );
  const page = await getSpeciesPage(brama, "uk", kdb);
  check(
    page?.catalog.catalogKind === "breed" &&
      page.catalog.species?.publicSlug === "gallus-gallus-domesticus",
    "«Брама» has no page",
  );

  // Account erasure: the entry stays with its creator cleared; the own
  // species goes with the object's other private words.
  const now = new Date();
  await buildAnonymizeOwnedCatalogOperatorFieldsForErasureQuery(
    kdb,
    first.id,
    now,
  ).execute();
  const afterErasure = await one<{
    created_by_user_id: string | null;
    identity_state: string;
  }>(
    pool,
    "select created_by_user_id, identity_state from catalog_items where id = $1",
    [brama],
  );
  check(
    afterErasure.created_by_user_id === null &&
      afterErasure.identity_state === "active",
    "erasure took the shared entry away",
  );
  check(
    (await objectState(pool, again.requestId)).catalog_item_id === brama,
    "the other gardener lost «Брама»",
  );
  const tombstone = randomUUID();
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'erased', $2, true, now(), now())`,
    [tombstone, `ove524-erased-${tombstone.slice(0, 8)}@example.test`],
  );
  await buildAnonymizePlantObjectsForErasureQuery(kdb, {
    requesterUserId: first.id,
    erasedSubjectUserId: tombstone,
    now,
  }).execute();
  const erasedOwn = await objectState(pool, own.requestId);
  check(
    erasedOwn.species_text === null &&
      erasedOwn.variety_text === null &&
      erasedOwn.variety_state === "unknown",
    "erasure kept an own species",
  );

  return { second, brama, ryabka: ryabka.requestId };
}

function claimed(mediaAssetId: string): ClaimedOwnedPhoto {
  const key = `derivatives/${mediaAssetId}/1.webp`;
  return {
    media: {
      mediaAssetId,
      generation: 1,
      sha256: createHash("sha256").update(mediaAssetId).digest("base64url"),
      sizeBytes: 12_345,
      width: 1600,
      height: 1200,
      publicPath: key,
      variants: ([480] as const).map((variant) => ({
        variant,
        sha256: createHash("sha256")
          .update(`${mediaAssetId}${variant}`)
          .digest("base64url"),
        sizeBytes: 1_000,
        width: variant,
        height: Math.round((variant * 3) / 4),
        publicPath: key.replace(".webp", `-${variant}.webp`),
      })),
      placeholderDataUri: null,
    },
    stagingSessionId: randomUUID(),
    receiptSetDigest: createHash("sha256")
      .update(randomUUID())
      .digest("base64url"),
  };
}

async function revokeJobs(pool: Pool) {
  return (
    await one<{ count: number }>(
      pool,
      `select count(*)::int as count from job_queue where payload->>'kind' = 'media_derivative_revoke'`,
    )
  ).count;
}

async function assertObjectPhoto(
  pool: Pool,
  kdb: Kysely<Database>,
  owner: string,
  objectId: string,
) {
  const scope = { userId: owner };
  const photos = () =>
    one<{ count: number }>(
      pool,
      "select count(*)::int as count from media_assets where plant_object_id = $1",
      [objectId],
    );
  const revokesBefore = await revokeJobs(pool);
  check(
    (
      await changeObjectPhoto(
        scope,
        { objectId, photo: claimed(randomUUID()) },
        kdb,
      )
    ).status === "saved",
    "the photo was not saved",
  );
  check((await photos()).count === 1, "the object has no photo");
  await changeObjectPhoto(
    scope,
    { objectId, photo: claimed(randomUUID()) },
    kdb,
  );
  check((await photos()).count === 1, "a replaced photo was kept");
  const afterReplace = await revokeJobs(pool);
  check(afterReplace > revokesBefore, "replacing queued no revocation");
  await changeObjectPhoto(scope, { objectId, photo: null }, kdb);
  check((await photos()).count === 0, "a removed photo was kept");
  check(
    (await revokeJobs(pool)) > afterReplace,
    "removing queued no revocation",
  );
  const stranger = await changeObjectPhoto(
    { userId: randomUUID() },
    { objectId, photo: null },
    kdb,
  );
  check(stranger.status === "missing", "somebody else changed the photo");
  return true;
}

/**
 * The cold path: every sample is a new connection, so a new backend with an
 * empty catalog cache, and the species statement is its first statement.
 */
async function assertColdSearch(url: string, kdb: Kysely<Database>) {
  const compiled = buildStandardSpeciesTypeaheadStatement({
    normalizedQuery: "курка",
    locale: "uk",
    objectKind: "animal",
  }).compile(kdb);
  const samples: number[] = [];
  const pids = new Set<number>();
  for (let index = 0; index < COLD_SAMPLES; index += 1) {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const pid = await one<{ pid: number }>(
        client,
        "select pg_backend_pid() as pid",
      );
      pids.add(pid.pid);
      await client.query("begin");
      await client.query(
        `set local statement_timeout = '${STANDARD_SPECIES_TYPEAHEAD_DEADLINE_MS}'`,
      );
      const startedAt = performance.now();
      const result = await client.query(compiled.sql, [...compiled.parameters]);
      samples.push(performance.now() - startedAt);
      await client.query("commit");
      check(
        result.rows[0]?.display_name === "курка",
        "«курка» is not the first answer on a fresh backend",
      );
    } finally {
      await client.end();
    }
  }
  check(
    pids.size === COLD_SAMPLES,
    "a sample reused a backend: it was not cold",
  );
  const worst = Math.max(...samples);
  check(
    worst < STANDARD_SPECIES_TYPEAHEAD_DEADLINE_MS,
    `a cold first search took ${worst} ms`,
  );
  return { samples: COLD_SAMPLES, worstMs: Math.round(worst * 10) / 10 };
}

/** Every migration again, over rows the new states wrote. */
async function replayEveryMigration(pool: Pool) {
  const migrations = await loadVersionedApplicationSql(
    path.join(process.cwd(), "sql"),
  );
  for (const migration of migrations) {
    try {
      await pool.query(migration.sql);
    } catch (error) {
      throw new Error(
        `replay of ${migration.name} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return migrations.length;
}

export async function runDisposableProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const disposable = `overgarden_ove524_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  admin.on("error", () => undefined);
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 4 });
  pool.on("error", () => undefined);
  const kdb = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    await applyMigrationsBefore(pool, targetUrl.toString(), "0086");
    const seed = await seedBefore(pool);

    await pool.query(migrationSql());
    await assertMigrated(pool, seed, "after");
    const refusals = await assertChecks(pool, seed);
    const keyCases = await assertKeyParity(pool);

    const fingerprint = await objectsFingerprint(pool);
    await pool.query(migrationSql());
    check(
      (await objectsFingerprint(pool)) === fingerprint,
      "replaying 0086 changed an object",
    );

    const writer = await assertWriter(pool, kdb, seed);
    const photo = await assertObjectPhoto(
      pool,
      kdb,
      writer.second.id,
      (
        await one<{ id: string }>(
          pool,
          "select id from plant_objects where owner_user_id = $1 limit 1",
          [writer.second.id],
        )
      ).id,
    );
    const cold = await assertColdSearch(targetUrl.toString(), kdb);

    const replayed = await replayEveryMigration(pool);
    check(
      (
        await one<{ present: boolean }>(
          pool,
          `select exists (select 1 from pg_indexes where indexname = 'catalog_items_owner_normalized_locale_node_uidx') as present`,
        )
      ).present === false,
      "a replay brought the per-gardener index back",
    );

    // The rollback folds an own species back into a label and an own cultivar
    // into it; the migration then re-applies.
    const ownBefore = await one<{ count: number }>(
      pool,
      "select count(*)::int as count from plant_objects where species_text is not null",
    );
    await pool.query(rollbackSql());
    const labels = await one<{ count: number; column: boolean }>(
      pool,
      `select count(*)::int as count,
              exists (select 1 from information_schema.columns
                       where table_name = 'plant_objects' and column_name = 'species_text') as column
         from plant_objects where variety_state = 'free_text'`,
    );
    check(!labels.column, "the rollback kept species_text");
    check(labels.count === ownBefore.count, "the rollback lost an own species");
    await pool.query(migrationSql());
    await pool.query(migrationSql());
    const ownAfter = await one<{ count: number }>(
      pool,
      "select count(*)::int as count from plant_objects where species_text is not null",
    );
    check(
      ownAfter.count === ownBefore.count,
      "re-applying lost an own species",
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          schemaVersion: "ove524.objectSpecies.v1",
          mode: "disposable",
          status: "pass",
          migration: MIGRATION,
          labelsMovedToOwnSpecies: true,
          checkRefusals: refusals,
          cultivarKeyFixtureCases: keyCases,
          migrationReplayIsNoOp: true,
          sharedEntryCreatedOnce: true,
          secondGardenerReusesEntry: true,
          ukrainianRussianOneEntry: true,
          registeredUnusedReused: true,
          listUsedAndAddedOnly: true,
          concurrentAddsMakeOneEntry: true,
          ownSpeciesAndCultivarStored: true,
          staleOrForeignChoicesRefused: 3,
          gardenerEntryHasAddressAndPage: true,
          erasureKeepsSharedEntry: true,
          objectPhotoWrittenReplacedRemoved: photo,
          coldFirstSearch: cold,
          everyMigrationReplayedOverNewRows: replayed,
          rollbackAndReapply: true,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await kdb.destroy().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

if (process.argv[1]?.endsWith("prove-object-species-database.ts") === true) {
  runDisposableProof().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        class: "object_species_database_proof_error",
        detail: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
