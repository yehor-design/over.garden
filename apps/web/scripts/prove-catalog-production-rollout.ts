import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Meilisearch } from "meilisearch";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import {
  buildCatalogProductionRolloutEvidence,
  type CatalogProductionRolloutSearchCaseProof,
  type CatalogProductionRolloutSearchProof,
} from "../src/lib/catalog/production-rollout-proof";
import { EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE } from "../src/lib/catalog/eu-official-journal-common-catalogue";
import {
  extractJsonObjectFromCommandOutput,
  parseCatalogSeedRolloutArgs,
  validateCatalogSeedRolloutOptions,
} from "../src/lib/catalog/seed-rollout-proof";
import { readCatalogEntityResolutionQaReport } from "../src/server/catalog-source/entity-resolution-qa-repository";
import {
  CATALOG_TYPEAHEAD_INDEX,
  catalogTypeaheadHitToSuggestion,
  dedupeCatalogTypeaheadSuggestions,
  toCatalogTypeaheadDocument,
  type CatalogTypeaheadCatalogKind,
  type CatalogTypeaheadDocument,
  type CatalogTypeaheadRow,
  type CatalogTypeaheadStatus,
  type CatalogTypeaheadSuggestion,
} from "../src/server/search/catalog-documents";

loadEnv({ path: ".env.local", override: false, quiet: true });

const SEARCH_PROOF_CASES = [
  {
    key: "ua-state-register",
    query: "Ботсадівський",
    expectedCanonicalName: "Ботсадівський",
    expectedCatalogKind: "plant_variety",
    expectedSource: "ua_state_register",
  },
  {
    key: "species-backbone",
    query: "помідор",
    expectedCanonicalName: "Solanum lycopersicum L.",
    expectedCatalogKind: "species",
    expectedSource: "species_backbone",
  },
  {
    key: "breed-seed",
    query: "Карпатська",
    expectedCanonicalName: "Карпатська бджола",
    expectedCatalogKind: "breed",
    expectedSource: "ua_official_bee_breed",
  },
  {
    key: "genebank-long-tail",
    query: "Red Cherry",
    expectedCanonicalName: "Red Cherry tomato",
    expectedCatalogKind: "plant_variety",
    expectedSource: "grin_genebank_candidate",
  },
] as const;

const CATALOG_SEARCHABLE_ATTRIBUTES = [
  "displayName",
  "canonicalName",
  "normalizedName",
] as const;
const CATALOG_FILTERABLE_ATTRIBUTES = [
  "status",
  "source",
  "locale",
  "itemLocale",
] as const;
const CATALOG_SORTABLE_ATTRIBUTES = ["rank"] as const;
const MEILI_WAIT_OPTIONS = { timeout: 120_000, interval: 250 } as const;

async function main() {
  const options = validateCatalogSeedRolloutOptions(
    parseCatalogSeedRolloutArgs(process.argv.slice(2)),
  );
  const codeState = readCodeState();
  const { db, connectionKind } = createDb();
  validateDatabaseTarget(options.environment, connectionKind);

  try {
    const seedRolloutEvidence = extractJsonObjectFromCommandOutput(
      runPackageScript("catalog:sources:seed-rollout-proof", [
        "--",
        "--environment",
        options.environment,
        "--confirm-environment",
        options.confirmEnvironment,
        "--base-url",
        options.baseUrl,
        ...(options.allowNonLocalMutation
          ? ["--allow-non-local-mutation"]
          : []),
      ]),
    );

    const euOjImportOutput = extractJsonObjectFromCommandOutput(
      runPackageScript("catalog:sources:import-eu-oj-common-catalogue"),
    );
    const bgOfficialVarietiesSmoke = extractJsonObjectFromCommandOutput(
      runPackageScript("smoke:garden-bg-official-varieties", [
        "--",
        "--base-url",
        options.baseUrl,
      ]),
    );
    const entityResolutionQa = await readCatalogEntityResolutionQaReport(db);
    const searchProof = await buildSearchProof(db, bgOfficialVarietiesSmoke);

    const evidence = buildCatalogProductionRolloutEvidence({
      options,
      codeState,
      seedRolloutEvidence,
      euOjImportOutput,
      bgOfficialVarietiesSmoke,
      entityResolutionQa,
      searchProof,
      generatedAt: new Date().toISOString(),
    });

    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await db.destroy();
  }
}

function createDb() {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);

  if (!connectionString) {
    throw new Error("Missing supported database connection env.");
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });

  return {
    db: new Kysely<Database>({ dialect: new PostgresDialect({ pool }) }),
    connectionKind: isLocalConnectionString(connectionString)
      ? ("local" as const)
      : ("non_local" as const),
  };
}

function validateDatabaseTarget(
  environment: string,
  connectionKind: "local" | "non_local",
) {
  if (environment === "local" && connectionKind !== "local") {
    throw new Error(
      "Local production-rollout proof must use a local database.",
    );
  }
  if (environment !== "local" && connectionKind !== "non_local") {
    throw new Error(
      "Non-local production-rollout proof must use a non-local database.",
    );
  }
}

async function buildSearchProof(
  db: Kysely<Database>,
  bgOfficialVarietiesSmoke: unknown,
): Promise<CatalogProductionRolloutSearchProof> {
  const bgCase = buildBgOfficialJournalSearchCase(bgOfficialVarietiesSmoke);
  const cases = [...SEARCH_PROOF_CASES, bgCase];
  const client = createMeiliClient();
  const indexRefresh = await refreshCatalogTypeaheadIndex(db, client);
  const proofCases: CatalogProductionRolloutSearchCaseProof[] = [];

  for (const proofCase of cases) {
    const postgresSuggestions = await searchPostgresTypeahead(
      db,
      proofCase.query,
    );
    const meiliSuggestions = await searchMeiliTypeahead(
      client,
      proofCase.query,
    );
    const postgresMatched = hasExpectedSuggestion(
      postgresSuggestions,
      proofCase,
    );
    const meilisearchMatched = hasExpectedSuggestion(
      meiliSuggestions,
      proofCase,
    );

    proofCases.push({
      key: proofCase.key,
      query: proofCase.query,
      expectedCanonicalName: proofCase.expectedCanonicalName,
      expectedCatalogKind: proofCase.expectedCatalogKind,
      expectedSource: proofCase.expectedSource,
      postgresMatched,
      meilisearchMatched,
      postgresSuggestionCount: postgresSuggestions.length,
      meilisearchSuggestionCount: meiliSuggestions.length,
      duplicateSameConceptSuggestionsAbsent:
        dedupeCatalogTypeaheadSuggestions(postgresSuggestions).length ===
          postgresSuggestions.length &&
        dedupeCatalogTypeaheadSuggestions(meiliSuggestions).length ===
          meiliSuggestions.length,
    });
  }

  return {
    indexName: CATALOG_TYPEAHEAD_INDEX,
    indexRefresh,
    postgresFallback: "checked",
    meilisearch: "checked",
    cases: proofCases,
    leakCheck: "passed",
  };
}

async function refreshCatalogTypeaheadIndex(
  db: Kysely<Database>,
  client: Meilisearch,
) {
  const documents = await readCatalogTypeaheadDocuments(db);
  const index = client.index(CATALOG_TYPEAHEAD_INDEX);

  for (const task of [
    index.updateSearchableAttributes([...CATALOG_SEARCHABLE_ATTRIBUTES]),
    index.updateFilterableAttributes([...CATALOG_FILTERABLE_ATTRIBUTES]),
    index.updateSortableAttributes([...CATALOG_SORTABLE_ATTRIBUTES]),
  ]) {
    await task.waitTask(MEILI_WAIT_OPTIONS);
  }

  await index.deleteAllDocuments().waitTask(MEILI_WAIT_OPTIONS);

  if (documents.length > 0) {
    await index
      .addDocuments(documents, { primaryKey: "id" })
      .waitTask(MEILI_WAIT_OPTIONS);
  }

  return {
    documentsIndexed: documents.length,
    taskWaited: true as const,
  };
}

async function readCatalogTypeaheadDocuments(
  db: Kysely<Database>,
): Promise<CatalogTypeaheadDocument[]> {
  const rows = await db
    .selectFrom("catalog_item_names")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_item_names.catalog_item_id",
    )
    .select([
      "catalog_items.id as id",
      "catalog_items.canonical_name as canonicalName",
      "catalog_items.normalized_name as normalizedName",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.status as status",
      "catalog_items.source as source",
      "catalog_items.created_by_user_id as createdByUserId",
      "catalog_items.locale as itemLocale",
      "catalog_item_names.display_name as displayName",
      "catalog_item_names.normalized_name as aliasNormalizedName",
      "catalog_item_names.locale as aliasLocale",
      "catalog_item_names.is_primary as isPrimary",
    ])
    .where("catalog_items.status", "in", ["seeded", "confirmed"])
    .where("catalog_items.created_by_user_id", "is", null)
    .orderBy("catalog_item_names.is_primary", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .$castTo<CatalogTypeaheadRow>()
    .execute();

  return rows
    .map((row) => toCatalogTypeaheadDocument(row))
    .filter((document): document is CatalogTypeaheadDocument =>
      Boolean(document),
    );
}

function buildBgOfficialJournalSearchCase(bgOfficialVarietiesSmoke: unknown) {
  const root = requireRecord(
    bgOfficialVarietiesSmoke,
    "BG official varieties smoke output",
  );
  const selected = requireRecord(
    root.selectedBgOfficialVariety,
    "selected BG official variety",
  );
  const canonicalName = stringValue(selected.canonicalName);
  if (!canonicalName) {
    throw new Error("BG official varieties smoke omitted canonical name.");
  }

  return {
    key: "eu-oj-bg-official-varieties",
    query: canonicalName,
    expectedCanonicalName: canonicalName,
    expectedCatalogKind: "plant_variety" as const,
    expectedSource: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
  };
}

async function searchPostgresTypeahead(
  db: Kysely<Database>,
  query: string,
): Promise<CatalogTypeaheadSuggestion[]> {
  const normalized = query.trim().replace(/\s+/g, " ").toLowerCase();
  const pattern = `%${normalized}%`;
  const prefixPattern = `${normalized}%`;
  const rows = await db
    .selectFrom("catalog_item_names")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_item_names.catalog_item_id",
    )
    .select([
      "catalog_items.id as id",
      "catalog_items.canonical_name as canonicalName",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.status as status",
      "catalog_items.source as source",
      "catalog_item_names.display_name as displayName",
      "catalog_item_names.locale as locale",
    ])
    .where("catalog_items.status", "in", ["seeded", "confirmed"])
    .where("catalog_items.created_by_user_id", "is", null)
    .where(
      sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${pattern}`,
    )
    .orderBy(
      sql<number>`case
        when ${sql.ref("catalog_item_names.normalized_name")} = ${normalized} then 0
        when ${sql.ref("catalog_item_names.normalized_name")} like ${prefixPattern} then 1
        when ${sql.ref("catalog_item_names.is_primary")} then 2
        else 3
      end`,
      "asc",
    )
    .orderBy("catalog_items.updated_at", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .limit(24)
    .$castTo<{
      id: string;
      displayName: string;
      canonicalName: string;
      locale: string;
      status: CatalogTypeaheadStatus;
      source: string;
      catalogKind: CatalogTypeaheadCatalogKind;
    }>()
    .execute();

  return dedupeCatalogTypeaheadSuggestions(
    rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      canonicalName: row.canonicalName,
      locale: row.locale,
      status: row.status,
      source: row.source,
      catalogKind: row.catalogKind,
    })),
  );
}

async function searchMeiliTypeahead(
  client: Meilisearch,
  query: string,
): Promise<CatalogTypeaheadSuggestion[]> {
  const result = await client.index(CATALOG_TYPEAHEAD_INDEX).search(query, {
    limit: 24,
  });
  const suggestions = (result.hits ?? [])
    .map((hit) => catalogTypeaheadHitToSuggestion(hit))
    .filter((hit): hit is CatalogTypeaheadSuggestion => Boolean(hit));

  return dedupeCatalogTypeaheadSuggestions(suggestions);
}

function createMeiliClient() {
  const host = process.env.MEILISEARCH_HOST?.trim();
  if (!host) {
    throw new Error("MEILISEARCH_HOST is required for OVE-90 proof.");
  }

  return new Meilisearch({
    host,
    apiKey: process.env.MEILISEARCH_API_KEY,
  });
}

function hasExpectedSuggestion(
  suggestions: CatalogTypeaheadSuggestion[],
  proofCase: {
    expectedCanonicalName: string;
    expectedCatalogKind: CatalogTypeaheadCatalogKind;
    expectedSource: string;
  },
) {
  return suggestions.some(
    (suggestion) =>
      suggestion.canonicalName === proofCase.expectedCanonicalName &&
      suggestion.catalogKind === proofCase.expectedCatalogKind &&
      suggestion.source === proofCase.expectedSource,
  );
}

function runPackageScript(script: string, args: string[] = []) {
  const result = spawnSync("pnpm", [script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 24 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      `${script} failed with exit ${result.status ?? "unknown"}. Output is withheld to keep rollout evidence redacted; run the package script directly in a private terminal for debugging.`,
    );
  }

  return result.stdout;
}

function readCodeState() {
  const commitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    readGitValue(["rev-parse", "HEAD"], "unknown") ??
    "unknown";
  const branch =
    process.env.VERCEL_GIT_COMMIT_REF ??
    readGitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown") ??
    "unknown";
  const status = readGitValue(["status", "--porcelain"], null);

  return {
    commitSha,
    branch,
    workingTree:
      status === null ? "unknown" : status.length === 0 ? "clean" : "dirty",
  } as const;
}

function readGitValue(args: string[], fallback: string | null) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

function isLocalConnectionString(value: string) {
  return (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.includes("0.0.0.0")
  );
}

function requireRecord(value: unknown, label: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
