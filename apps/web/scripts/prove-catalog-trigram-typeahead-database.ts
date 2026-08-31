import { randomUUID } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import {
  searchCatalogSuggestionsForTypeaheadResult,
  type CatalogTypeaheadDivergenceSample,
} from "../src/server/catalog-repository";
import {
  buildActiveStableRegistryProductTrigramTypeaheadQuery,
  buildActiveStableRegistryProductTypeaheadQuery,
  searchActiveStableRegistryProductSuggestions,
  searchActiveStableRegistryProductTrigramSuggestions,
} from "../src/server/stable-registry/product-projection-repository";
import { loadVersionedApplicationSql } from "./application-sql";
import {
  assertSafeCatalogTrigramReceipt,
  CATALOG_TYPEAHEAD_QUERY_BUDGET_MS,
  roundMs,
  type CatalogTrigramMode,
  type CatalogTrigramProofReceipt,
} from "./prove-catalog-trigram-typeahead";

/**
 * Large enough that a sequential scan is the expensive plan.
 *
 * With a handful of rows Postgres will scan the table no matter what index
 * exists, and an index-usage assertion against a toy corpus proves nothing
 * about the corpus a gardener actually searches.
 */
const FILLER_NAMES = 20_000;

/** The misspellings this source exists for, in both scripts it must serve. */
const TYPO_CASES = [
  { correct: "помідор", typed: "помдор" },
  { correct: "solanum lycopersicum", typed: "solanum lycopersicm" },
  { correct: "гарбуз звичайний", typed: "гарбз звичайний" },
] as const;

/**
 * Proves the trigram source against migration 0043 and a realistic corpus.
 *
 * Three things a compile-only test cannot check: whether the planner reaches
 * the GIN index or scans every name, whether the misspelled query the card
 * names actually recovers the identity, and how much recall the derived index
 * still contributes that the canonical source cannot.
 *
 * It builds its own disposable database and drops it, so it never writes to the
 * database whose connection string it borrows.
 */
export async function runCatalogTrigramTypeaheadDatabaseProof(input: {
  mode: CatalogTrigramMode;
}): Promise<CatalogTrigramProofReceipt> {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackLocalRuntimeEnvironment(process.env);

  const disposable = `overgarden_ove355_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(requiredEnv("DATABASE_URL"));
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(requiredEnv("DATABASE_URL"));
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);

  const pool = new Pool({ connectionString: targetUrl.toString(), max: 2 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    await applyEveryMigration(pool, targetUrl.toString());
    const seeded = await seedActiveFoundation(pool);

    // AC-07: the planner must reach the index, not scan every name.
    const usesTrigramIndex = await trigramPlanUsesIndex(pool, seeded.releaseId);
    if (!usesTrigramIndex) {
      throw new Error("trigram_query_did_not_use_the_trigram_index");
    }

    let substringRecall = 0;
    let typoRecall = 0;
    let maxQueryLatencyMs = 0;
    let replayIdentical = true;

    for (const [index, typo] of TYPO_CASES.entries()) {
      const substring = await buildActiveStableRegistryProductTypeaheadQuery(
        db,
        typo.typed,
        "plant",
      ).execute();
      if (substring.some((row) => row.id === seeded.targetIds[index])) {
        substringRecall += 1;
      }

      const startedAt = performance.now();
      const trigram = await buildActiveStableRegistryProductTrigramTypeaheadQuery(
        db,
        typo.typed,
        "plant",
      ).execute();
      maxQueryLatencyMs = Math.max(
        maxQueryLatencyMs,
        performance.now() - startedAt,
      );
      if (trigram.some((row) => row.id === seeded.targetIds[index])) {
        typoRecall += 1;
      }

      // AC-04: the same query returns the same ranked set.
      const ids = trigram.map((row) => row.id);
      const replay = await buildActiveStableRegistryProductTrigramTypeaheadQuery(
        db,
        typo.typed,
        "plant",
      ).execute();
      if (replay.map((row) => row.id).join(",") !== ids.join(",")) {
        replayIdentical = false;
      }
    }

    if (typoRecall !== TYPO_CASES.length) {
      throw new Error("trigram_source_did_not_recover_the_misspelled_identity");
    }
    if (substringRecall !== 0) {
      throw new Error("the_substring_source_already_tolerated_the_typo");
    }
    if (maxQueryLatencyMs > CATALOG_TYPEAHEAD_QUERY_BUDGET_MS) {
      throw new Error("catalog_typeahead_query_budget_exceeded");
    }
    if (!replayIdentical) {
      throw new Error("replay_returned_a_different_ranked_set");
    }

    // AC-03: three sources through the real merge owner, no duplicate
    // identity. Building the merge here by hand would prove this file's
    // helper rather than the code a gardener's keystroke actually runs.
    const typed = TYPO_CASES[0]!.typed;
    const correct = TYPO_CASES[0]!.correct;
    const canonicalRows = await searchActiveStableRegistryProductSuggestions(
      correct,
      "plant",
      8,
      db,
    );
    const trigramRows = await searchActiveStableRegistryProductTrigramSuggestions(
      typed,
      "plant",
      8,
      db,
    );
    // The derived index is simulated as the source that already finds the
    // misspelling today: that is exactly the recall this measures against.
    const derivedRows = canonicalRows;

    let divergence: CatalogTypeaheadDivergenceSample | undefined;
    const mergedResult = await searchCatalogSuggestionsForTypeaheadResult(
      typed,
      { limit: 8, selectionMode: "stable_registry", objectKind: "plant" },
      {
        searchWithPostgres: async () => [],
        searchWithMeili: async () => derivedRows,
        searchWithTrigram: async () => trigramRows,
        recordDivergence: (sample) => {
          divergence = sample;
        },
      },
    );
    if (!divergence) {
      throw new Error("merge_owner_did_not_record_a_divergence_sample");
    }
    const mergedIds = mergedResult.suggestions.map((row) => row.id);
    const duplicateIdentityCount = mergedIds.length - new Set(mergedIds).size;
    if (!mergedIds.includes(seeded.targetIds[0]!)) {
      throw new Error("merged_result_lost_the_recovered_identity");
    }

    return assertSafeCatalogTrigramReceipt({
      schemaVersion: "ove355.catalogTrigramTypeahead.v1",
      mode: input.mode,
      runClass: "database",
      status: "pass",
      terminalClass: "verified",
      sourceClass: divergence.sourceClass,
      canonicalCount: divergence.canonicalCount,
      derivedCount: divergence.derivedCount,
      trigramCount: divergence.trigramCount,
      mergedCount: divergence.mergedCount,
      duplicateIdentityCount,
      canonicalOnlyCount: divergence.canonicalOnlyCount,
      derivedOnlyCount: divergence.derivedOnlyCount,
      trigramOnlyCount: divergence.trigramOnlyCount,
      trigramRecoveredDerivedOnlyCount:
        divergence.trigramRecoveredDerivedOnlyCount,
      unrecoveredDerivedOnlyCount: divergence.unrecoveredDerivedOnlyCount,
      typoRecallCount: typoRecall,
      substringRecallCount: substringRecall,
      usesTrigramIndex,
      replayIdentical,
      maxQueryLatencyMs: roundMs(maxQueryLatencyMs),
      queryBudgetMs: CATALOG_TYPEAHEAD_QUERY_BUDGET_MS,
      degradedReasonClass: null,
      forbiddenMarkersAbsent: true,
      controls: { retrySearchEnabled: true, continueWithUnknownEnabled: true },
    });
  } finally {
    await db.destroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

async function applyEveryMigration(pool: Pool, connectionString: string) {
  const applicationSql = await loadVersionedApplicationSql(
    path.join(process.cwd(), "sql"),
  );
  await pool.query(applicationSql[0]!.sql);

  const authDb = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 1 }) }),
  });
  const authOptions = {
    appName: "OverGarden",
    baseURL: "http://localhost:3000",
    basePath: "/api/auth",
    secret: "ove355-disposable-proof-secret-value-not-a-credential",
    database: { db: authDb, type: "postgres", casing: "snake" },
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    advanced: { cookiePrefix: "overgarden", database: { generateId: "uuid" } },
  } satisfies BetterAuthOptions;
  betterAuth(authOptions);
  await (await getMigrations(authOptions)).runMigrations();
  await authDb.destroy();

  for (const migration of applicationSql) {
    await pool.query(migration.sql);
  }
}

interface SeededCorpus {
  releaseId: string;
  targetIds: string[];
}

/**
 * One active Foundation release holding a realistic corpus.
 *
 * The filler names are generated in bulk rather than row by row: the point of
 * this corpus is to make a sequential scan expensive, and 20,000 round trips
 * would make the proof itself the slow part.
 */
async function seedActiveFoundation(pool: Pool): Promise<SeededCorpus> {
  const ownerId = randomUUID();
  const snapshotId = randomUUID();
  const captureId = randomUUID();
  const releaseId = randomUUID();
  const digest = "a".repeat(64);

  await pool.query(
    `insert into catalog_source_snapshots (
       id, source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status
     ) values ($1,'eppo-codes','EPPO','taxonomy','ove355','https://data.eppo.int/',
       'Open Licence','ove355',$2, now(), now(), 'imported')`,
    [snapshotId, digest],
  );
  await pool.query(
    `insert into catalog_source_capture_runs (
       id, source_snapshot_id, capture_schema_version, capture_tool_revision,
       source_host, endpoint_family, request_schema_version, openapi_sha256,
       license_sha256, observed_started_at, observed_ended_at,
       inventory_start_total, inventory_end_total, inventory_unique_codes,
       inventory_page_count, inventory_start_sha256, inventory_end_sha256,
       manifest_sha256, zero_product_receipt, state
     ) values ($1,$2,'ove355',$4,'api.eppo.int','gd/v2','v2',$3,$3, now(), now(),
       2, 2, 2, 1, $3, $3, $3,
       '{"productMutationCount":0,"searchMutationCount":0}'::jsonb, 'completed')`,
    [captureId, snapshotId, digest, "b".repeat(40)],
  );
  await pool.query(
    `insert into catalog_registry_releases (
       id, release_kind, state, capture_id, source_snapshot_id, policy_version,
       build_digest, preview_digest, created_by_user_id, activated_at
     ) values ($1,'foundation','active',$2,$3,'ove355.foundation.v1',$4,$4,$5, now())`,
    [releaseId, captureId, snapshotId, digest, ownerId],
  );
  await pool.query(
    `insert into catalog_registry_active_pointers (release_family, active_release_id)
     values ('foundation', $1)
     on conflict (release_family) do update set active_release_id = excluded.active_release_id`,
    [releaseId],
  );

  const names = [
    ...TYPO_CASES.map((typo) => typo.correct),
    ...Array.from({ length: FILLER_NAMES }, (_, index) => fillerName(index)),
  ];

  // Bulk-insert the whole corpus through one statement per table.
  await pool.query(
    `insert into catalog_items (
       id, canonical_name, normalized_name, catalog_kind, public_slug,
       status, source, locale
     )
     select gen_random_uuid(), name.value, lower(name.value), 'species',
            'ove355-' || name.ordinality::text, 'confirmed', 'internal_seed', 'la'
       from unnest($1::text[]) with ordinality as name(value, ordinality)`,
    [names],
  );
  await pool.query(
    `insert into catalog_item_revisions (
       catalog_item_id, revision_number, canonical_name, normalized_name,
       catalog_kind, identity_relation, source_evidence_digest, revision_digest
     )
     select items.id, 1, items.canonical_name, items.normalized_name, 'species',
            'canonical', $1, md5(items.id::text) || md5(items.id::text)
       from catalog_items as items
      where items.source = 'internal_seed'`,
    [digest],
  );
  await pool.query(
    `insert into catalog_registry_release_members (
       release_id, catalog_item_id, catalog_item_revision_id, eligibility, membership_digest
     )
     select $1, revisions.catalog_item_id, revisions.id, 'product_eligible',
            md5(revisions.id::text) || md5(revisions.id::text)
       from catalog_item_revisions as revisions`,
    [releaseId],
  );
  await pool.query(
    `insert into stable_registry_product_catalog_records (
       registry_release_id, catalog_item_id, catalog_item_revision_id,
       object_kind_scope, catalog_kind, canonical_name, item_locale,
       public_slug, activated_at
     )
     select $1, members.catalog_item_id, members.catalog_item_revision_id,
            'plant', 'species', items.canonical_name, items.locale,
            items.public_slug, now()
       from catalog_registry_release_members as members
       join catalog_items as items on items.id = members.catalog_item_id
      where members.release_id = $1`,
    [releaseId],
  );
  await pool.query(
    `insert into stable_registry_product_catalog_names (
       registry_release_id, catalog_item_id, object_kind_scope, normalized_name,
       locale, display_name, name_class, is_primary
     )
     select $1, records.catalog_item_id, 'plant', lower(records.canonical_name),
            records.item_locale, records.canonical_name, 'canonical', true
       from stable_registry_product_catalog_records as records
      where records.registry_release_id = $1`,
    [releaseId],
  );
  // The planner needs statistics before it can prefer the index over a scan.
  await pool.query("analyze stable_registry_product_catalog_names");
  await pool.query("analyze stable_registry_product_catalog_records");

  const targets = await pool.query<{ catalog_item_id: string }>(
    `select catalog_item_id from stable_registry_product_catalog_names
      where registry_release_id = $1 and normalized_name = any($2::text[])
      order by array_position($2::text[], normalized_name)`,
    [releaseId, TYPO_CASES.map((typo) => typo.correct)],
  );
  if (targets.rows.length !== TYPO_CASES.length) {
    throw new Error("proof_corpus_is_missing_a_target_identity");
  }

  return {
    releaseId,
    targetIds: targets.rows.map((row) => row.catalog_item_id),
  };
}

/**
 * AC-07's second half: the executed plan, not the existence of the index.
 *
 * An index that exists but is never chosen leaves every keystroke scanning the
 * whole name table, which is the cost this migration exists to remove.
 */
async function trigramPlanUsesIndex(
  pool: Pool,
  releaseId: string,
): Promise<boolean> {
  const explained = await pool.query<{ "QUERY PLAN": string }>(
    `explain (analyze false, costs false)
     select names.catalog_item_id
       from stable_registry_product_catalog_names as names
      where names.registry_release_id = $1
        and lower(names.normalized_name) % $2`,
    [releaseId, TYPO_CASES[0]!.typed],
  );
  const plan = explained.rows.map((row) => row["QUERY PLAN"]).join("\n");
  return (
    plan.includes("stable_registry_product_catalog_names_trgm_idx") &&
    !/Seq Scan on stable_registry_product_catalog_names/u.test(plan)
  );
}

function fillerName(index: number): string {
  const genus = FILLER_GENERA[index % FILLER_GENERA.length]!;
  return `${genus} ${index.toString(36)}`;
}

const FILLER_GENERA = [
  "brassica",
  "cucurbita",
  "capsicum",
  "allium",
  "daucus",
  "beta",
  "pisum",
  "phaseolus",
  "яблуня",
  "смородина",
  "малина",
  "домат",
] as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
