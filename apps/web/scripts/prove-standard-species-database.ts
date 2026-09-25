import "./neutralise-server-only";

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import {
  findSelectableCatalogItem,
  searchCatalogSuggestionsForTypeaheadResult,
} from "../src/server/catalog-repository";
import {
  loadStandardSpeciesBase,
  type StandardSpeciesFile,
  type StandardSpeciesFileRow,
  type StandardSpeciesLoadSummary,
} from "../src/server/catalog-source/standard-species-load";
import { applyMigrationsBefore } from "./prove-organism-graph-foundation";

/**
 * Executes the standard species base (OVE-530, ADR-0035 D3) on a fresh
 * disposable database built from every migration, with catalogue rows shaped
 * as production holds them.
 *
 * What it proves:
 *
 *   * a dry run counts and writes nothing;
 *   * each row finds its organism the way the loader promises — tomato by a
 *     GBIF identifier, Rosa by a Catalogue of Life identifier, garden
 *     strawberry materialized from the checklist, the domestic chicken created
 *     under an existing Gallus gallus — and a Latin name shared by a plant and
 *     an animal never crosses kingdoms;
 *   * the everyday names become the one primary vernacular in uk, bg and ru:
 *     a source import's primary is demoted and remembers it, its weight-2
 *     name is made heavier and remembers that, and a search word lands as a
 *     plain vernacular;
 *   * a second run over the same file writes nothing, name for name;
 *   * a newer file takes back exactly what the old one no longer wants —
 *     a dropped search word goes, a dropped organism leaves the base and its
 *     demoted primary comes back — and leaves every source-import name intact;
 *   * the picker offers a species only from the base, for its kind, and puts
 *     the base's everyday name first for «помідор» and «курка»; a species
 *     outside the base, or of the other kind, is not selectable;
 *   * the rollback file takes back every name change and drops the tables,
 *     and the migration then re-applies.
 *
 * Output is aggregate: names from this file's own seed, counts and booleans.
 * Never a connection string.
 */

const COL_SLUG = "catalogue-of-life-checklistbank";

interface Seed {
  tomato: string;
  rosa: string;
  gallusGallus: string;
  sharedAnimal: string;
  lilac: string;
  fish: string;
  tomatoRuPrimary: string;
  tomatoUkLight: string;
  tomatoUkOtherPrimary: string;
  tomatoBgLower: string;
  wheat: string;
  chamomile: string;
}

let seedAssertion: string | null = null;

/** The assertion a source import's identifiers carry in production. */
async function sourceAssertion(pool: Pool): Promise<string> {
  if (seedAssertion) return seedAssertion;
  const snapshot = await pool.query<{ id: string }>(
    `insert into catalog_source_snapshots (
       source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status
     )
     values ('ove530-seed', 'Seed', 'species_backbone', 'ove530-proof', 'https://example.test/',
             'CC0', 'ove530-proof', $1, now(), now(), 'imported')
     returning id`,
    [createHash("sha256").update(randomUUID()).digest("hex")],
  );
  const assertion = await pool.query<{ id: string }>(
    `insert into catalog_source_assertions (
       source_slug, source_snapshot_id, rights_class, confidence, decision, reason_codes
     )
     values ('ove530-seed', $1, 'source_public', 1, 'automatic', array['ove530_seed'])
     returning id`,
    [snapshot.rows[0]!.id],
  );
  seedAssertion = assertion.rows[0]!.id;
  return seedAssertion;
}

async function node(
  pool: Pool,
  input: {
    latin: string;
    kingdom: "Plantae" | "Animalia";
    rank: string;
    slug: string | null;
    identifiers?: Array<[string, string]>;
    vernaculars?: Array<{
      locale: string;
      value: string;
      primary?: boolean;
      weight?: number;
    }>;
  },
): Promise<{ id: string; names: Map<string, string> }> {
  const id = randomUUID();
  await pool.query(
    `insert into catalog_items (
       id, canonical_name, normalized_name, public_slug, source, source_id,
       locale, node_kind, kingdom, rank, identity_state
     )
     values ($1, $2, catalog_normalize_name($2), $3, 'species_backbone', $4,
             'la', 'taxon', $5, $6, 'active')`,
    [id, input.latin, input.slug, `ove530:${id}`, input.kingdom, input.rank],
  );
  await pool.query(
    `insert into catalog_item_names (
       catalog_item_id, display_name, normalized_name, locale, script,
       is_primary, name_type, weight
     )
     values ($1, $2, catalog_normalize_name($2), 'la', 'latin', true,
             'scientific_accepted', 5)`,
    [id, input.latin],
  );
  for (const [scheme, value] of input.identifiers ?? []) {
    await pool.query(
      `insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
       values ($1, $2, $3, $4)`,
      [id, scheme, value, await sourceAssertion(pool)],
    );
  }
  const names = new Map<string, string>();
  for (const name of input.vernaculars ?? []) {
    const inserted = await pool.query<{ id: string }>(
      `insert into catalog_item_names (
         catalog_item_id, display_name, normalized_name, locale, script,
         is_primary, name_type, weight
       )
       values ($1, $2, catalog_normalize_name($2), $3, 'cyrillic', $4, 'vernacular', $5)
       returning id`,
      [id, name.value, name.locale, name.primary ?? false, name.weight ?? 2],
    );
    names.set(`${name.locale}:${name.value}`, inserted.rows[0]!.id);
  }
  return { id, names };
}

async function seed(pool: Pool): Promise<Seed> {
  const tomato = await node(pool, {
    latin: "Solanum lycopersicum",
    kingdom: "Plantae",
    rank: "species",
    slug: "solanum-lycopersicum",
    identifiers: [["gbif", "2930137"]],
    vernaculars: [
      { locale: "uk", value: "томат", weight: 2 },
      { locale: "uk", value: "паслін томатний", primary: true, weight: 1 },
      { locale: "ru", value: "томат", primary: true, weight: 2 },
      { locale: "bg", value: "домат", weight: 2 },
    ],
  });
  const rosa = await node(pool, {
    latin: "Rosa",
    kingdom: "Plantae",
    rank: "genus",
    slug: null,
    identifiers: [["col", "6CH8"]],
  });
  // A cultivar «Роса» already holds the plain slug the genus would take.
  await pool.query(
    `insert into catalog_items (canonical_name, normalized_name, public_slug, source, source_id,
       locale, node_kind, kingdom, rank, identity_state)
     values ('Роса', catalog_normalize_name('Роса'), 'rosa', 'ua_state_register', $1,
             'uk', 'cultivar', 'Plantae', 'cultivar', 'active')`,
    [`ove530:${randomUUID()}`],
  );
  const gallusGallus = await node(pool, {
    latin: "Gallus gallus",
    kingdom: "Animalia",
    rank: "species",
    slug: "gallus-gallus",
  });
  // A plant genus and an animal genus with one name: the chicken's parent
  // lookup must not land on the plant.
  await node(pool, {
    latin: "Gallus gallus",
    kingdom: "Plantae",
    rank: "species",
    slug: "gallus-gallus-plantae",
  });
  const sharedAnimal = gallusGallus.id;
  // German chamomile under its accepted name; the base row uses the synonym.
  const chamomile = await node(pool, {
    latin: "Matricaria chamomilla",
    kingdom: "Plantae",
    rank: "species",
    slug: "matricaria-chamomilla",
    identifiers: [["col", "72V3R"]],
  });
  // The catalogue folded spelt's EPPO code into bread wheat's node.
  const wheat = await node(pool, {
    latin: "Triticum aestivum",
    kingdom: "Plantae",
    rank: "species",
    slug: "triticum-aestivum",
    identifiers: [["eppo", "TRZSP"]],
  });
  // Outside the base: a lilac a gardener might mistype into, and a fish whose
  // Ukrainian name starts like the chicken's.
  const lilac = await node(pool, {
    latin: "Syringa persica",
    kingdom: "Plantae",
    rank: "species",
    slug: "syringa-persica",
    vernaculars: [{ locale: "uk", value: "бузок перський" }],
  });
  const fish = await node(pool, {
    latin: "Balistes carolinensis",
    kingdom: "Animalia",
    rank: "species",
    slug: "balistes-carolinensis",
    vernaculars: [{ locale: "uk", value: "курка морська" }],
  });

  // The checklist, with garden strawberry and its genus.
  const snapshot = await pool.query<{ id: string }>(
    `insert into catalog_source_snapshots (
       source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status
     )
     values ($1, 'Catalogue of Life', 'checklist', 'ove530-proof', 'https://example.test/',
             'CC BY 4.0', 'ove530-proof', $2, now(), now(), 'imported')
     returning id`,
    [COL_SLUG, createHash("sha256").update(randomUUID()).digest("hex")],
  );
  for (const [colId, parent, rank, name, kingdom, status] of [
    ["FRAG", null, "genus", "Fragaria", "Plantae", "accepted"],
    ["FRAGAN", "FRAG", "species", "Fragaria ×ananassa", "Plantae", "accepted"],
    ["72V3R", null, "species", "Matricaria chamomilla", "Plantae", "accepted"],
    ["72V38", "72V3R", "species", "Matricaria recutita", "Plantae", "synonym"],
  ] as const) {
    await pool.query(
      `insert into catalog_source_col_usages (
         source_snapshot_id, col_id, parent_col_id, rank, status,
         scientific_name, canonical_name, kingdom
       )
       values ($1, $2, $3, $4, $7, $5, $5, $6)`,
      [snapshot.rows[0]!.id, colId, parent, rank, name, kingdom, status],
    );
  }

  return {
    tomato: tomato.id,
    rosa: rosa.id,
    gallusGallus: gallusGallus.id,
    sharedAnimal,
    lilac: lilac.id,
    fish: fish.id,
    tomatoRuPrimary: tomato.names.get("ru:томат")!,
    tomatoUkLight: tomato.names.get("uk:томат")!,
    tomatoUkOtherPrimary: tomato.names.get("uk:паслін томатний")!,
    tomatoBgLower: tomato.names.get("bg:домат")!,
    wheat: wheat.id,
    chamomile: chamomile.id,
  };
}

function row(
  input: Pick<
    StandardSpeciesFileRow,
    "key" | "kind" | "group" | "latin" | "rank" | "wikidata"
  > & {
    gbif?: string;
    col?: string;
    parentLatin?: string;
    uk: [string, string[]];
    bg: [string, string[]];
    ru: [string, string[]];
    registerCultivars?: number;
  },
): StandardSpeciesFileRow {
  const name = ([display, search]: [string, string[]]) => ({
    display,
    search,
    status: "confirmed" as const,
  });
  return {
    key: input.key,
    kind: input.kind,
    group: input.group,
    latin: input.latin,
    rank: input.rank,
    wikidata: input.wikidata,
    identifiers: {
      gbif: input.gbif ?? null,
      col: input.col ?? null,
      wfo: null,
      eppo: [],
    },
    parentLatin: input.parentLatin ?? null,
    names: { uk: name(input.uk), bg: name(input.bg), ru: name(input.ru) },
    popularity: {
      registerCultivars: input.registerCultivars ?? 0,
      pageviews: { uk: 100, bg: 10, ru: 100 },
    },
  };
}

function baseFile(version: string, rows: StandardSpeciesFileRow[]) {
  const file: StandardSpeciesFile = { version, rows };
  return { file, payload: JSON.stringify(file) };
}

const TOMATO = row({
  key: "plant:solanum-lycopersicum",
  kind: "plant",
  group: "vegetables",
  latin: "Solanum lycopersicum",
  rank: "species",
  wikidata: "Q23501",
  gbif: "2930137",
  uk: ["Помідор", ["томат", "помідори"]],
  bg: ["Домат", ["домати"]],
  ru: ["Помидор", ["томат", "помидоры"]],
  registerCultivars: 300,
});
const STRAWBERRY = row({
  key: "plant:fragaria-x-ananassa",
  kind: "plant",
  group: "berries",
  latin: "Fragaria × ananassa",
  rank: "nothospecies",
  wikidata: "Q13158",
  gbif: "3029912",
  uk: ["Полуниця", ["полуниці садові"]],
  bg: ["Ягода", ["градинска ягода"]],
  ru: ["Клубника", ["земляника садовая"]],
  registerCultivars: 40,
});
const ROSE = row({
  key: "plant:rosa",
  kind: "plant",
  group: "flowers",
  latin: "Rosa",
  rank: "genus",
  wikidata: "Q34687",
  col: "6CH8",
  uk: ["Троянда", ["роза"]],
  bg: ["Роза", []],
  ru: ["Роза", []],
});
const SPELT: StandardSpeciesFileRow = {
  ...row({
    key: "plant:triticum-spelta",
    kind: "plant",
    group: "field_crops",
    latin: "Triticum spelta",
    rank: "species",
    wikidata: "Q158767",
    uk: ["Спельта", []],
    bg: ["Лимец", []],
    ru: ["Спельта", []],
  }),
  identifiers: { gbif: null, col: null, wfo: null, eppo: ["TRZSP"] },
};
const CHAMOMILE = row({
  key: "plant:matricaria-recutita",
  kind: "plant",
  group: "herbs",
  latin: "Matricaria recutita",
  rank: "species",
  wikidata: "Q28437",
  uk: ["Ромашка", ["ромашка лікарська"]],
  bg: ["Лайка", []],
  ru: ["Ромашка", ["ромашка аптечная"]],
});
const CHICKEN = row({
  key: "animal:gallus-gallus-domesticus",
  kind: "animal",
  group: "poultry",
  latin: "Gallus gallus domesticus",
  rank: "subspecies",
  wikidata: "Q780",
  parentLatin: "Gallus gallus",
  uk: ["Курка", ["кури", "курка свійська"]],
  bg: ["Кокошка", ["кокошки"]],
  ru: ["Курица", ["куры"]],
});

async function nameState(pool: Pool) {
  const result = await pool.query<{ digest: string; count: string }>(
    `select md5(string_agg(
              id::text || catalog_item_id::text || locale || normalized_name ||
              is_primary::text || weight::text || name_type,
              ',' order by id)) as digest,
            count(*)::text as count
       from catalog_item_names`,
  );
  return result.rows[0]!;
}

async function flags(pool: Pool, nameId: string) {
  const result = await pool.query<{ is_primary: boolean; weight: string }>(
    `select is_primary, weight::text from catalog_item_names where id = $1`,
    [nameId],
  );
  return result.rows[0] ?? null;
}

async function member(pool: Pool, key: string) {
  const result = await pool.query<{
    id: string;
    kind: string;
    popularity: number;
  }>(
    `select catalog_item_id::text as id, object_kind as kind, popularity
       from catalog_standard_species where base_key = $1`,
    [key],
  );
  return result.rows[0] ?? null;
}

async function primaryVernacular(pool: Pool, organism: string, locale: string) {
  const result = await pool.query<{ display_name: string }>(
    `select display_name from catalog_item_names
      where catalog_item_id = $1 and locale = $2 and name_type = 'vernacular' and is_primary`,
    [organism, locale],
  );
  return result.rows.map((entry) => entry.display_name);
}

function expectQuiet(summary: StandardSpeciesLoadSummary, label: string) {
  const loud = {
    identifiersWritten: summary.identifiersWritten,
    addressesAssigned: summary.addressesAssigned,
    membershipsWritten: summary.membershipsWritten,
    membershipsRemoved: summary.membershipsRemoved,
    namesInserted: summary.namesInserted,
    namesChanged: summary.namesChanged,
    namesDemoted: summary.namesDemoted,
    namesTakenBack: summary.namesTakenBack,
    created: summary.created,
    materializedFromCol: summary.materializedFromCol,
  };
  if (Object.values(loud).some((value) => value !== 0)) {
    throw new Error(
      `${label}: a re-run wrote something: ${JSON.stringify(loud)}`,
    );
  }
}

export async function runDisposableProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const disposable = `overgarden_ove530_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  admin.on("error", () => undefined);
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 2 });
  pool.on("error", () => undefined);
  const kdb = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  const picker = (query: string, objectKind: "plant" | "animal") =>
    searchCatalogSuggestionsForTypeaheadResult(
      query,
      { objectKind, locale: "uk" },
      {
        runStatement: async (statement) => (await statement.execute(kdb)).rows,
      },
    );

  try {
    await applyMigrationsBefore(pool, targetUrl.toString(), "9999");
    const seeded = await seed(pool);
    const v1 = baseFile("2026-09-26", [
      TOMATO,
      STRAWBERRY,
      ROSE,
      CHICKEN,
      SPELT,
      CHAMOMILE,
    ]);

    // Before the base: the picker offers no species at all.
    const before = await picker("помідор", "plant");
    if (
      before.suggestions.some((suggestion) => suggestion.kind === "species")
    ) {
      throw new Error("a species was offered before the base was loaded");
    }

    // A dry run counts and leaves nothing.
    const namesBefore = await nameState(pool);
    const dry = await loadStandardSpeciesBase(kdb, { ...v1, apply: false });
    if (dry.applied || dry.membershipsWritten !== 6 || dry.unresolved.length) {
      throw new Error(
        `the dry run did not count six members: ${JSON.stringify(dry)}`,
      );
    }
    if (
      (await member(pool, TOMATO.key)) ||
      (await nameState(pool)).digest !== namesBefore.digest
    ) {
      throw new Error("the dry run left rows behind");
    }

    // The first run.
    const first = await loadStandardSpeciesBase(kdb, { ...v1, apply: true });
    const tomato = await member(pool, TOMATO.key);
    const strawberry = await member(pool, STRAWBERRY.key);
    const rose = await member(pool, ROSE.key);
    const chicken = await member(pool, CHICKEN.key);
    if (tomato?.id !== seeded.tomato)
      throw new Error("tomato did not resolve by its GBIF identifier");
    if (rose?.id !== seeded.rosa)
      throw new Error(
        "Rosa did not resolve by its Catalogue of Life identifier",
      );
    const roseSlug = await pool.query<{ public_slug: string | null }>(
      `select public_slug from catalog_items where id = $1`,
      [seeded.rosa],
    );
    if (roseSlug.rows[0]?.public_slug !== "rosa-spp") {
      throw new Error(
        `the genus Rosa got the address ${roseSlug.rows[0]?.public_slug}, not rosa-spp`,
      );
    }
    if (!strawberry || !first.materializedKeys.includes(STRAWBERRY.key)) {
      throw new Error(
        "garden strawberry was not materialized from the checklist",
      );
    }
    const strawberryCol = await pool.query(
      `select 1 from catalog_item_identifiers where catalog_item_id = $1 and scheme = 'col' and value = 'FRAGAN'`,
      [strawberry.id],
    );
    if (strawberryCol.rowCount !== 1)
      throw new Error(
        "the materialized strawberry has no checklist identifier",
      );
    if (!chicken || chicken.kind !== "animal")
      throw new Error("the domestic chicken is not an animal member");
    const chickenNode = await pool.query<{
      parent: string;
      kingdom: string;
      rank: string;
    }>(
      `select parent_catalog_item_id::text as parent, kingdom, rank from catalog_items where id = $1`,
      [chicken.id],
    );
    if (
      chickenNode.rows[0]?.parent !== seeded.gallusGallus ||
      chickenNode.rows[0]?.kingdom !== "Animalia" ||
      chickenNode.rows[0]?.rank !== "subspecies"
    ) {
      throw new Error(
        "the chicken was not created under the animal Gallus gallus",
      );
    }
    const spelt = await member(pool, SPELT.key);
    if (
      !spelt ||
      spelt.id === seeded.wheat ||
      first.duplicateOrganisms.length
    ) {
      throw new Error(
        "spelt took bread wheat's node through a folded EPPO code",
      );
    }
    if ((await member(pool, CHAMOMILE.key))?.id !== seeded.chamomile) {
      throw new Error("a checklist synonym did not lead to its accepted node");
    }
    if (tomato.popularity !== 300 * 100 + 210)
      throw new Error("the tomato's popularity is not the base's");

    // Names: one primary per language, the base's.
    for (const [organism, locale, expected] of [
      [seeded.tomato, "uk", "Помідор"],
      [seeded.tomato, "ru", "Помидор"],
      [seeded.tomato, "bg", "Домат"],
      [chicken.id, "uk", "Курка"],
    ] as const) {
      const primary = await primaryVernacular(pool, organism, locale);
      if (primary.length !== 1 || primary[0] !== expected) {
        throw new Error(
          `${locale} primary is ${JSON.stringify(primary)}, not ${expected}`,
        );
      }
    }
    const ruDemoted = await flags(pool, seeded.tomatoRuPrimary);
    if (!ruDemoted || ruDemoted.is_primary || Number(ruDemoted.weight) !== 5) {
      throw new Error(
        "the source import's ru primary «томат» was not demoted to a search word",
      );
    }
    const otherPrimary = await flags(pool, seeded.tomatoUkOtherPrimary);
    if (!otherPrimary || otherPrimary.is_primary || first.namesDemoted !== 1) {
      throw new Error("a source import's other uk primary was not demoted");
    }
    const ukHeavier = await flags(pool, seeded.tomatoUkLight);
    if (!ukHeavier || ukHeavier.is_primary || Number(ukHeavier.weight) !== 5) {
      throw new Error(
        "the source import's uk «томат» did not become a search word",
      );
    }

    // A second run writes nothing.
    const namesAfterFirst = await nameState(pool);
    const second = await loadStandardSpeciesBase(kdb, { ...v1, apply: true });
    expectQuiet(second, "second run");
    if ((await nameState(pool)).digest !== namesAfterFirst.digest) {
      throw new Error("the second run changed a name row");
    }

    // The picker: the base only, the base's names first.
    const tomatoes = await picker("помідор", "plant");
    if (
      tomatoes.suggestions[0]?.id !== seeded.tomato ||
      tomatoes.suggestions[0]?.displayName !== "Помідор"
    ) {
      throw new Error(
        `«помідор» did not find the tomato first: ${JSON.stringify(tomatoes.suggestions[0])}`,
      );
    }
    const chickens = await picker("курка", "animal");
    if (chickens.suggestions[0]?.id !== chicken.id) {
      throw new Error(
        `«курка» did not find the chicken first: ${JSON.stringify(chickens.suggestions)}`,
      );
    }
    if (
      chickens.suggestions.some((suggestion) => suggestion.id === seeded.fish)
    ) {
      throw new Error("a fish outside the base was offered for «курка»");
    }
    const strawberries = await picker("полуниця", "plant");
    if (strawberries.suggestions[0]?.id !== strawberry.id) {
      throw new Error("«полуниця» did not find garden strawberry first");
    }
    const lilacs = await picker("бузок", "plant");
    if (lilacs.suggestions.length !== 0)
      throw new Error("a lilac outside the base was offered");
    const chickenAsPlant = await picker("курка", "plant");
    if (
      chickenAsPlant.suggestions.some(
        (suggestion) => suggestion.id === chicken.id,
      )
    ) {
      throw new Error("the chicken was offered to a plant");
    }
    if (
      await findSelectableCatalogItem(kdb, seeded.lilac, {
        expectedObjectKind: "plant",
      })
    ) {
      throw new Error("a species outside the base is selectable for an object");
    }
    if (
      await findSelectableCatalogItem(kdb, chicken.id, {
        expectedObjectKind: "plant",
      })
    ) {
      throw new Error("an animal species is selectable for a plant");
    }
    const selectable = await findSelectableCatalogItem(kdb, chicken.id, {
      expectedObjectKind: "animal",
    });
    if (selectable?.standardKind !== "animal")
      throw new Error("the chicken is not selectable for an animal");
    // A mention names any organism, as before.
    if (!(await findSelectableCatalogItem(kdb, seeded.lilac))) {
      throw new Error(
        "a mention of a species outside the base stopped resolving",
      );
    }

    // A newer file: tomato loses a search word, strawberry leaves the base.
    const v2 = baseFile("2026-10-01", [
      {
        ...TOMATO,
        names: {
          ...TOMATO.names,
          uk: { ...TOMATO.names.uk, search: ["томат"] },
        },
      },
      ROSE,
      CHICKEN,
      SPELT,
      CHAMOMILE,
    ]);
    const third = await loadStandardSpeciesBase(kdb, { ...v2, apply: true });
    if (
      third.membershipsRemoved !== 1 ||
      (await member(pool, STRAWBERRY.key))
    ) {
      throw new Error("strawberry did not leave the base");
    }
    const leftovers = await pool.query(
      `select 1 from catalog_item_names where catalog_item_id = $1 and normalized_name = catalog_normalize_name('помідори')`,
      [seeded.tomato],
    );
    if (leftovers.rowCount !== 0)
      throw new Error("a search word the new file dropped is still there");
    const strawberryNames = await pool.query(
      `select 1 from catalog_item_names where catalog_item_id = $1 and locale in ('uk', 'bg', 'ru')`,
      [strawberry.id],
    );
    if (strawberryNames.rowCount !== 0)
      throw new Error("the names the base gave strawberry stayed behind");
    if (
      (await flags(pool, seeded.tomatoUkOtherPrimary))?.is_primary !== false
    ) {
      throw new Error(
        "the newer file gave the demoted primary back while tomato stays",
      );
    }
    const fourth = await loadStandardSpeciesBase(kdb, { ...v2, apply: true });
    expectQuiet(fourth, "re-run of the newer file");

    // The rollback takes back every name change, then the migration re-applies.
    await pool.query(
      readFileSync(
        path.join(
          process.cwd(),
          "sql",
          "rollback",
          "0081_ove530_standard_species_base.down.sql",
        ),
        "utf8",
      ),
    );
    const ruRestored = await flags(pool, seeded.tomatoRuPrimary);
    const ukRestored = await flags(pool, seeded.tomatoUkLight);
    if (
      !ruRestored?.is_primary ||
      Number(ruRestored.weight) !== 2 ||
      Number(ukRestored?.weight) !== 2
    ) {
      throw new Error("the rollback did not restore the source import's names");
    }
    if ((await flags(pool, seeded.tomatoUkOtherPrimary))?.is_primary !== true) {
      throw new Error("the rollback did not give the demoted primary back");
    }
    const bgSpelling = await pool.query<{ display_name: string }>(
      `select display_name from catalog_item_names where id = $1`,
      [seeded.tomatoBgLower],
    );
    if (bgSpelling.rows[0]?.display_name !== "домат") {
      throw new Error(
        "the rollback did not restore the source import's spelling",
      );
    }
    const baseNames = await pool.query(
      `select 1 from catalog_item_names where catalog_item_id = $1 and normalized_name = catalog_normalize_name('Помідор')`,
      [seeded.tomato],
    );
    if (baseNames.rowCount !== 0)
      throw new Error("the rollback left a name the base wrote");
    const tables = await pool.query(
      `select to_regclass('catalog_standard_species') as base, to_regclass('catalog_standard_species_names') as names`,
    );
    if (tables.rows[0]?.base !== null || tables.rows[0]?.names !== null) {
      throw new Error("the rollback left a table");
    }
    await pool.query(
      readFileSync(
        path.join(
          process.cwd(),
          "sql",
          "0081_ove530_standard_species_base.sql",
        ),
        "utf8",
      ),
    );
    await pool.query(
      readFileSync(
        path.join(
          process.cwd(),
          "sql",
          "0081_ove530_standard_species_base.sql",
        ),
        "utf8",
      ),
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          class: "standard_species_database_proof",
          dryRun: { membershipsCounted: dry.membershipsWritten, rowsLeft: 0 },
          firstRun: {
            resolvedByIdentifier: first.resolvedByIdentifier,
            materializedFromCol: first.materializedFromCol,
            created: first.created,
            namesInserted: first.namesInserted,
            namesChanged: first.namesChanged,
            namesDemoted: first.namesDemoted,
          },
          secondRunQuiet: true,
          newerFile: {
            membershipsRemoved: third.membershipsRemoved,
            namesTakenBack: third.namesTakenBack,
          },
          picker: {
            помідор: tomatoes.suggestions[0]?.displayName,
            курка: chickens.suggestions[0]?.displayName,
            полуниця: strawberries.suggestions[0]?.displayName,
            бузок: lilacs.suggestions.length,
          },
          rollbackRestoredSourceNames: true,
          migrationReapplied: true,
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

if (process.argv[1]?.endsWith("prove-standard-species-database.ts") === true) {
  runDisposableProof().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        class: "standard_species_database_proof_error",
        detail: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
