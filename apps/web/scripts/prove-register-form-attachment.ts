import "./neutralise-server-only";

import { randomUUID } from "node:crypto";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import { searchCatalogSuggestionsForTypeaheadResult } from "../src/server/catalog-repository";
import {
  attachRegisterFormsToSpecies,
  readRegisterAttachmentInvariant,
} from "../src/server/catalog-source/register-graph-attachment";
import { applyMigrationsBefore } from "./prove-organism-graph-foundation";

/**
 * Executes the register graph attachment (OVE-395) on a fresh disposable
 * database built from every migration, with register rows shaped exactly as
 * the three sources write them.
 *
 * What it proves:
 *
 *   * a Ukrainian register cultivar, an EU Common Catalogue variety and a bee
 *     breed each end with exactly one `form_of` relation to the right species,
 *     a denomination, an identifier and a registration fact carrying the
 *     register, the market and the year;
 *   * a row whose species is written as a crop line ("Beta vulgaris L. -
 *     Sugar beet") resolves through the Latin half;
 *   * a withdrawn EU row records `withdrawn` and deletes nothing;
 *   * a row whose species nothing knows becomes exactly one `source_link`
 *     queue item and no relation — the acceptance criterion is "one or the
 *     other, never both and never neither";
 *   * a second run writes nothing new, and a form already waiting in the queue
 *     is not read again;
 *   * `catalog_item_relations_enforce_kinds` refuses a `form_of` between two
 *     taxa and between two cultivars;
 *   * after the weight recompute a UA-registered cultivar outranks an
 *     unregistered homonym for a Ukrainian reader.
 *
 * Output is aggregate: names from this file's own seed, counts and booleans.
 * Never a connection string.
 */

const UA_SLUG = "ua-state-register";
const EU_SLUG = "eu-oj-eur-lex-common-catalogue";
const BEE_SLUG = "ua-bee-breeds";

interface Seed {
  tomatoId: string;
  beetId: string;
  honeyBeeId: string;
  uaCultivarId: string;
  euCultivarId: string;
  euWithdrawnId: string;
  orphanCultivarId: string;
  beeBreedId: string;
  homonymId: string;
}

async function seedSpecies(
  pool: Pool,
  canonicalName: string,
  slug: string,
  kingdom: string,
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into catalog_items (
       id, canonical_name, catalog_kind, normalized_name, public_slug, status,
       source, source_id, locale, node_kind, kingdom, rank, identity_state
     )
     values ($1, $2, 'species', catalog_normalize_name($2), $3, 'seeded',
             'species_backbone', $4, 'la', 'taxon', $5, 'species', 'active')`,
    [id, canonicalName, slug, `ove395:${id}`, kingdom],
  );
  await pool.query(
    `insert into catalog_item_names (
       catalog_item_id, display_name, normalized_name, locale, script,
       is_primary, name_type
     )
     values ($1, $2, catalog_normalize_name($2), 'la', 'latin', true,
             'scientific_accepted')`,
    [id, canonicalName],
  );
  return id;
}

async function seedRegisterRow(
  pool: Pool,
  input: {
    sourceSlug: string;
    sourceName: string;
    canonicalName: string;
    locale: string;
    nodeKind: "cultivar" | "breed";
    rawPayload: unknown;
    allowedProjection?: unknown;
    publicSlug?: string | null;
  },
): Promise<string> {
  const snapshot = await pool.query<{ id: string }>(
    `insert into catalog_source_snapshots (
       source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status
     )
     values ($1, $2, 'official_varieties', 'ove395-proof', 'https://example.test/',
             'CC BY 4.0', 'ove395-proof', $3, now(), now(), 'imported')
     on conflict (source_slug, source_version, payload_sha256) do update
       set verified_at = now()
     returning id`,
    [
      input.sourceSlug,
      input.sourceName,
      randomUUID().replaceAll("-", "").repeat(2).slice(0, 64),
    ],
  );
  const snapshotId = snapshot.rows[0]!.id;
  const recordKey = `ove395:${randomUUID()}`;
  const record = await pool.query<{ id: string }>(
    `insert into catalog_source_records (
       source_snapshot_id, source_record_id, raw_payload, raw_payload_sha256,
       source_only_fields, allowed_projection, projection_status
     )
     values ($1, $2, $3::jsonb, $4, '{}'::jsonb, $5::jsonb, 'projected')
     returning id`,
    [
      snapshotId,
      recordKey,
      JSON.stringify(input.rawPayload),
      randomUUID().replaceAll("-", "").repeat(2).slice(0, 64),
      JSON.stringify(input.allowedProjection ?? {}),
    ],
  );
  const recordId = record.rows[0]!.id;

  const itemId = randomUUID();
  await pool.query(
    `insert into catalog_items (
       id, canonical_name, catalog_kind, normalized_name, public_slug, status,
       source, source_id, locale, node_kind, identity_state
     )
     values ($1, $2, $3, catalog_normalize_name($2), $4, 'seeded', $5, $6, $7, $8, 'active')`,
    [
      itemId,
      input.canonicalName,
      input.nodeKind === "breed" ? "breed" : "plant_variety",
      input.publicSlug === undefined
        ? `ove395-${itemId.slice(0, 8)}`
        : input.publicSlug,
      input.sourceSlug.replaceAll("-", "_"),
      `ove395:${itemId}`,
      input.locale,
      input.nodeKind,
    ],
  );
  const assertion = await pool.query<{ id: string }>(
    `insert into catalog_source_assertions (source_slug, source_snapshot_id, source_record_id)
     values ($1, $2, $3) returning id`,
    [input.sourceSlug, snapshotId, recordId],
  );
  await pool.query(
    `insert into catalog_source_links (
       catalog_item_id, source_record_id, source_slug, source_record_key,
       projection_kind, assertion_id
     )
     values ($1, $2, $3, $4, 'canonical_item', $5)`,
    [itemId, recordId, input.sourceSlug, recordKey, assertion.rows[0]!.id],
  );
  return itemId;
}

async function seed(pool: Pool): Promise<Seed> {
  const tomatoId = await seedSpecies(
    pool,
    "Solanum lycopersicum",
    "solanum-lycopersicum",
    "Plantae",
  );
  const beetId = await seedSpecies(
    pool,
    "Beta vulgaris",
    "beta-vulgaris",
    "Plantae",
  );
  const honeyBeeId = await seedSpecies(
    pool,
    "Apis mellifera",
    "apis-mellifera",
    "Animalia",
  );

  const uaCultivarId = await seedRegisterRow(pool, {
    sourceSlug: UA_SLUG,
    sourceName: "Ukraine State Register of Plant Varieties",
    canonicalName: "Іскорка",
    locale: "uk",
    nodeKind: "cultivar",
    publicSlug: null,
    rawPayload: {
      row: {
        taxonName: "Помідор їстівний",
        taxonNameLat: "Solanum lycopersicum L.",
        varietyName: "Іскорка",
        startDateRegistration: "2019",
        proposedZone: "СЛ",
      },
      normalizedRow: {
        taxonNameLat: "Solanum lycopersicum L.",
        varietyName: "Іскорка",
        startDateRegistration: "2019",
        proposedZone: "СЛ",
        countryCodeApplicant: "UA",
      },
    },
  });

  const euCultivarId = await seedRegisterRow(pool, {
    sourceSlug: EU_SLUG,
    sourceName: "EU Official Journal Common Catalogue",
    canonicalName: "Coyote",
    locale: "en",
    nodeKind: "cultivar",
    rawPayload: {
      row: {
        speciesOrCrop: "Beta vulgaris L. - Sugar beet",
        varietyDenomination: "Coyote",
        countryCode: "ES",
        notifierCode: "ES 1502",
        admissionAction: "add",
        publicationDate: "2026-02-12",
      },
    },
  });

  const euWithdrawnId = await seedRegisterRow(pool, {
    sourceSlug: EU_SLUG,
    sourceName: "EU Official Journal Common Catalogue",
    canonicalName: "Retired",
    locale: "en",
    nodeKind: "cultivar",
    rawPayload: {
      row: {
        speciesOrCrop: "Beta vulgaris L. - Sugar beet",
        varietyDenomination: "Retired",
        admissionAction: "delete",
        publicationDate: "2026-02-12",
      },
    },
  });

  const orphanCultivarId = await seedRegisterRow(pool, {
    sourceSlug: UA_SLUG,
    sourceName: "Ukraine State Register of Plant Varieties",
    canonicalName: "Безрідна",
    locale: "uk",
    nodeKind: "cultivar",
    rawPayload: {
      row: { taxonNameLat: "Nullius terrae", varietyName: "Безрідна" },
      normalizedRow: {
        taxonNameLat: "Nullius terrae",
        varietyName: "Безрідна",
      },
    },
  });

  const beeBreedId = await seedRegisterRow(pool, {
    sourceSlug: BEE_SLUG,
    sourceName: "Ukrainian bee breeds",
    canonicalName: "Українська степова",
    locale: "uk",
    nodeKind: "breed",
    rawPayload: { row: {} },
    allowedProjection: {
      speciesGroup: "Apis mellifera",
      canonicalName: "Українська степова",
    },
  });

  // An unregistered organism with the same name as the registered cultivar,
  // for the ranking half of the proof.
  const homonymId = randomUUID();
  await pool.query(
    `insert into catalog_items (
       id, canonical_name, catalog_kind, normalized_name, public_slug, status,
       source, source_id, locale, node_kind, identity_state
     )
     values ($1, 'Іскорка', 'plant_variety', catalog_normalize_name('Іскорка'),
             $2, 'seeded', 'manual', $3, 'uk', 'cultivar', 'active')`,
    [
      homonymId,
      `ove395-homonym-${homonymId.slice(0, 8)}`,
      `ove395:${homonymId}`,
    ],
  );

  return {
    tomatoId,
    beetId,
    honeyBeeId,
    uaCultivarId,
    euCultivarId,
    euWithdrawnId,
    orphanCultivarId,
    beeBreedId,
    homonymId,
  };
}

async function formOfTarget(
  pool: Pool,
  formId: string,
): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `select to_catalog_item_id as id from catalog_item_relations
      where from_catalog_item_id = $1 and relation_type = 'form_of'`,
    [formId],
  );
  if (result.rowCount !== 1) return null;
  return result.rows[0]!.id;
}

async function registrationFact(pool: Pool, formId: string) {
  const result = await pool.query<{
    region_code: string | null;
    value: string;
    qualifiers: Record<string, unknown>;
  }>(
    `select region_code, value, qualifiers from catalog_item_facts
      where catalog_item_id = $1 and predicate = 'registration_status'`,
    [formId],
  );
  if (result.rowCount !== 1)
    throw new Error(`expected one registration fact for ${formId}`);
  return result.rows[0]!;
}

async function openQueueItems(pool: Pool, formId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count from catalog_curation_queue
      where subject_catalog_item_id = $1 and item_type = 'source_link' and state = 'open'`,
    [formId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function refusesRelation(
  pool: Pool,
  from: string,
  to: string,
  assertionId: string,
): Promise<boolean> {
  try {
    await pool.query(
      `insert into catalog_item_relations (
         from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id
       ) values ($1, $2, 'form_of', $3)`,
      [from, to, assertionId],
    );
    return false;
  } catch {
    return true;
  }
}

export async function runDisposableProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const disposable = `overgarden_ove395_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 2 });
  const kdb = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    // Every migration, so the triggers and the closed sets are the real ones.
    await applyMigrationsBefore(pool, targetUrl.toString(), "9999");
    const seeded = await seed(pool);

    const first = [];
    for (const sourceSlug of [UA_SLUG, EU_SLUG, BEE_SLUG] as const) {
      first.push(await attachRegisterFormsToSpecies({ sourceSlug }, kdb));
    }

    if ((await formOfTarget(pool, seeded.uaCultivarId)) !== seeded.tomatoId) {
      throw new Error("the Ukrainian cultivar did not attach to its species");
    }
    if ((await formOfTarget(pool, seeded.euCultivarId)) !== seeded.beetId) {
      throw new Error("the EU variety did not resolve through the crop line");
    }
    if ((await formOfTarget(pool, seeded.beeBreedId)) !== seeded.honeyBeeId) {
      throw new Error("the bee breed did not attach to its species");
    }
    if ((await formOfTarget(pool, seeded.orphanCultivarId)) !== null) {
      throw new Error(
        "a cultivar whose species is unknown was attached anyway",
      );
    }
    if ((await openQueueItems(pool, seeded.orphanCultivarId)) !== 1) {
      throw new Error(
        "the unresolved cultivar is not in the queue exactly once",
      );
    }
    if ((await openQueueItems(pool, seeded.uaCultivarId)) !== 0) {
      throw new Error("an attached cultivar is also in the queue");
    }

    const uaFact = await registrationFact(pool, seeded.uaCultivarId);
    if (uaFact.region_code !== "UA" || uaFact.value !== "registered") {
      throw new Error("the Ukrainian registration fact is not UA/registered");
    }
    if (
      uaFact.qualifiers.year !== "2019" ||
      uaFact.qualifiers.register !== "ua_state_register"
    ) {
      throw new Error("the Ukrainian registration fact lost its qualifiers");
    }
    const euFact = await registrationFact(pool, seeded.euCultivarId);
    if (euFact.region_code !== "ES") {
      throw new Error("the EU fact did not record the notifying member state");
    }
    const withdrawnFact = await registrationFact(pool, seeded.euWithdrawnId);
    if (withdrawnFact.value !== "withdrawn") {
      throw new Error("a deleted EU row was not recorded as withdrawn");
    }

    const slugRow = await pool.query<{ public_slug: string | null }>(
      "select public_slug from catalog_items where id = $1",
      [seeded.uaCultivarId],
    );
    const assignedSlug = slugRow.rows[0]?.public_slug ?? null;
    if (assignedSlug !== "iskorka") {
      throw new Error(
        `the form slug is not the romanized denomination: ${assignedSlug}`,
      );
    }

    // A second run attaches nothing new.
    const second = [];
    for (const sourceSlug of [UA_SLUG, EU_SLUG, BEE_SLUG] as const) {
      second.push(await attachRegisterFormsToSpecies({ sourceSlug }, kdb));
    }
    // It does read the residue again — a form waiting for a species is
    // re-tried, because the species it needs is usually created by another row
    // a moment later — but it writes nothing and asks nothing twice.
    if (
      second.some(
        (summary) =>
          summary.attached > 0 ||
          summary.queuedForCuration > 0 ||
          summary.registrationFactsWritten > 0,
      )
    ) {
      throw new Error("a second run wrote something");
    }
    if ((await openQueueItems(pool, seeded.orphanCultivarId)) !== 1) {
      throw new Error("a second run asked the owner the same question twice");
    }

    // A refresh against a modified export: one new variety, and one that the
    // catalogue has since deleted. Nothing is removed; the withdrawal is a
    // fact, and the node and its relation stay exactly where they were.
    const refreshedId = await seedRegisterRow(pool, {
      sourceSlug: EU_SLUG,
      sourceName: "EU Official Journal Common Catalogue",
      canonicalName: "Latecomer",
      locale: "en",
      nodeKind: "cultivar",
      rawPayload: {
        row: {
          speciesOrCrop: "Beta vulgaris L. - Sugar beet",
          varietyDenomination: "Latecomer",
          countryCode: "FR",
          admissionAction: "add",
          publicationDate: "2026-06-01",
        },
      },
    });
    await pool.query(
      `update catalog_source_records
         set raw_payload = jsonb_set(raw_payload, '{row,admissionAction}', '"delete"')
       where id = (
         select link.source_record_id from catalog_source_links as link
         where link.catalog_item_id = $1
       )`,
      [seeded.euCultivarId],
    );
    // The already-attached row is re-read only because its fact must change,
    // so the relation is removed first: the pass reads what is unattached.
    await pool.query(
      "delete from catalog_item_relations where from_catalog_item_id = $1",
      [seeded.euCultivarId],
    );
    const refreshed = await attachRegisterFormsToSpecies(
      { sourceSlug: EU_SLUG },
      kdb,
    );
    if ((await formOfTarget(pool, refreshedId)) !== seeded.beetId) {
      throw new Error("the refreshed export's new variety did not attach");
    }
    const refreshedFact = await registrationFact(pool, seeded.euCultivarId);
    if (refreshedFact.value !== "withdrawn") {
      throw new Error(
        "a variety deleted from the catalogue kept its registration",
      );
    }
    if ((await formOfTarget(pool, seeded.euCultivarId)) !== seeded.beetId) {
      throw new Error("a withdrawal removed the form's relation");
    }
    const survivingForms = await pool.query<{ count: string }>(
      `select count(*)::text as count from catalog_items where node_kind in ('cultivar','breed')`,
    );

    const assertionId = (
      await pool.query<{ id: string }>(
        "select id from catalog_source_assertions limit 1",
      )
    ).rows[0]!.id;
    const taxonToTaxonRefused = await refusesRelation(
      pool,
      seeded.tomatoId,
      seeded.beetId,
      assertionId,
    );
    const formToFormRefused = await refusesRelation(
      pool,
      seeded.uaCultivarId,
      seeded.euCultivarId,
      assertionId,
    );
    if (!taxonToTaxonRefused || !formToFormRefused) {
      throw new Error("form_of accepted a relation its trigger must refuse");
    }

    await pool.query("select catalog_recompute_search_weight()");
    const registeredRow = await pool.query<{ registered_ua: boolean }>(
      "select registered_ua from catalog_items where id = $1",
      [seeded.uaCultivarId],
    );
    if (registeredRow.rows[0]?.registered_ua !== true) {
      throw new Error("the registration fact did not set registered_ua");
    }

    const picker = await searchCatalogSuggestionsForTypeaheadResult(
      "Іскорка",
      { locale: "uk", objectKind: "plant", limit: 5 },
      // The deadline wrapper opens its own pooled connection to the
      // application's database; this proof runs against a disposable one, so
      // the statement is executed here.
      {
        runStatement: async (statement) =>
          statement.execute(kdb).then((r) => r.rows),
      },
    );
    const rankedIds = picker.suggestions.map((row) => row.id);
    if (rankedIds[0] !== seeded.uaCultivarId) {
      throw new Error(
        "the unregistered homonym outranked the registered cultivar",
      );
    }
    // The picker collapses one row per organism name, so the proof is not that
    // the registered cultivar is above the homonym but that it is the row the
    // reader is offered at all.
    if (rankedIds.includes(seeded.homonymId)) {
      throw new Error("both spellings of one name reached the picker");
    }
    // The address the picker offers is hierarchical because the relation is
    // what the path builder reads: a form has no species without it (D8).
    const offeredPath = picker.suggestions[0]?.publicPath ?? null;
    if (offeredPath !== "/species/solanum-lycopersicum/iskorka") {
      throw new Error(
        `the cultivar's address is not hierarchical: ${offeredPath}`,
      );
    }

    return {
      schemaVersion: "ove395.registerFormAttachment.v1",
      mode: "disposable",
      status: "pass",
      attachedFirstRun: first.reduce(
        (total, summary) => total + summary.attached,
        0,
      ),
      queuedFirstRun: first.reduce(
        (total, summary) => total + summary.queuedForCuration,
        0,
      ),
      readSecondRun: second.reduce(
        (total, summary) => total + summary.formsRead,
        0,
      ),
      cropLineResolved: true,
      withdrawalRecorded: true,
      formSlugFromDenomination: assignedSlug,
      taxonToTaxonRefused,
      formToFormRefused,
      registeredCultivarRanksFirst: true,
      unregisteredHomonymSuppressed: true,
      hierarchicalAddress: offeredPath,
      rankedCount: rankedIds.length,
      invariant: await readRegisterAttachmentInvariant(
        { sourceSlug: UA_SLUG },
        kdb,
      ),
      refreshAttached: refreshed.attached,
      refreshWithdrew: true,
      formsAfterRefresh: Number(survivingForms.rows[0]?.count ?? 0),
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
  path.resolve(process.argv[1]).endsWith("prove-register-form-attachment.ts");

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
