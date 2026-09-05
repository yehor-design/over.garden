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
  buildCatalogTypeaheadQuery,
  searchCatalogSuggestions,
  searchCatalogSuggestionsForTypeaheadResult,
  type CatalogTypeaheadDivergenceSample,
} from "../src/server/catalog-repository";
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

/** Every row this proof seeds carries a slug under this prefix. */
const SEED_SLUG_PREFIX = "ove355-";

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
    const seeded = await seedSelectableCatalog(pool);

    // AC-07: the planner must reach the index, not scan every name.
    const usesTrigramIndex = await trigramPlanUsesIndex(pool);
    if (!usesTrigramIndex) {
      throw new Error("trigram_query_did_not_use_the_trigram_index");
    }

    let substringRecall = 0;
    let typoRecall = 0;
    let maxQueryLatencyMs = 0;
    let replayIdentical = true;

    for (const [index, typo] of TYPO_CASES.entries()) {
      const substring = await buildCatalogTypeaheadQuery(
        db,
        typo.typed,
        8,
        "plant",
      ).execute();
      if (substring.some((row) => row.id === seeded.targetIds[index])) {
        substringRecall += 1;
      }

      const startedAt = performance.now();
      const trigram = await buildCatalogTypeaheadQuery(
        db,
        typo.typed,
        8,
        "plant",
        "trigram",
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
      const replay = await buildCatalogTypeaheadQuery(
        db,
        typo.typed,
        8,
        "plant",
        "trigram",
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
    const canonicalRows = await searchCatalogSuggestions(correct, 8, db, "plant");
    const trigramRows = await searchCatalogSuggestions(
      typed,
      8,
      db,
      "plant",
      "trigram",
    );
    // The derived index is simulated as the source that already finds the
    // misspelling today: that is exactly the recall this measures against.
    const derivedRows = canonicalRows;

    let divergence: CatalogTypeaheadDivergenceSample | undefined;
    const mergedResult = await searchCatalogSuggestionsForTypeaheadResult(
      typed,
      { limit: 8, objectKind: "plant" },
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
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString, max: 1 }),
    }),
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
  targetIds: string[];
}

/**
 * A selectable catalog holding a realistic corpus.
 *
 * The rows go through the same tables and the same predicate the picker reads:
 * `catalog_items` with a selectable status and no owner, each with one primary
 * `catalog_item_names` row. The filler names are generated in bulk rather than
 * row by row: the point of this corpus is to make a sequential scan expensive,
 * and 20,000 round trips would make the proof itself the slow part.
 */
async function seedSelectableCatalog(pool: Pool): Promise<SeededCorpus> {
  const names = [
    ...TYPO_CASES.map((typo) => typo.correct),
    ...Array.from({ length: FILLER_NAMES }, (_, index) => fillerName(index)),
  ];

  // Bulk-insert the whole corpus through one statement per table. The slug
  // carries the 1-based ordinality, so the three targets are `ove355-1..3`.
  await pool.query(
    `insert into catalog_items (
       id, canonical_name, normalized_name, catalog_kind, public_slug,
       status, source, locale
     )
     select gen_random_uuid(), name.value, lower(name.value), 'species',
            $2 || name.ordinality::text, 'confirmed', 'internal_seed', 'la'
       from unnest($1::text[]) with ordinality as name(value, ordinality)`,
    [names, SEED_SLUG_PREFIX],
  );
  await pool.query(
    `insert into catalog_item_names (
       catalog_item_id, display_name, normalized_name, locale, is_primary
     )
     select items.id, items.canonical_name, items.normalized_name, items.locale,
            true
       from catalog_items as items
      where items.public_slug like $1 || '%'`,
    [SEED_SLUG_PREFIX],
  );
  // The planner needs statistics before it can prefer the index over a scan.
  await pool.query("analyze catalog_item_names");
  await pool.query("analyze catalog_items");

  const targetSlugs = TYPO_CASES.map(
    (_, index) => `${SEED_SLUG_PREFIX}${index + 1}`,
  );
  const targets = await pool.query<{ id: string }>(
    `select id from catalog_items
      where public_slug = any($1::text[])
      order by array_position($1::text[], public_slug)`,
    [targetSlugs],
  );
  if (targets.rows.length !== TYPO_CASES.length) {
    throw new Error("proof_corpus_is_missing_a_target_identity");
  }

  return { targetIds: targets.rows.map((row) => row.id) };
}

/**
 * AC-07's second half: the executed plan, not the existence of the index.
 *
 * An index that exists but is never chosen leaves every keystroke scanning the
 * whole name table, which is the cost this migration exists to remove.
 */
async function trigramPlanUsesIndex(pool: Pool): Promise<boolean> {
  const explained = await pool.query<{ "QUERY PLAN": string }>(
    `explain (analyze false, costs false)
     select names.catalog_item_id
       from catalog_item_names as names
      where lower(names.display_name) % $1`,
    [TYPO_CASES[0]!.typed],
  );
  const plan = explained.rows.map((row) => row["QUERY PLAN"]).join("\n");
  return (
    plan.includes("catalog_item_names_display_trgm_idx") &&
    !/Seq Scan on catalog_item_names/u.test(plan)
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
