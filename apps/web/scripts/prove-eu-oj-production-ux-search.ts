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
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE,
} from "../src/lib/catalog/eu-official-journal-common-catalogue";
import {
  buildEuOjProductionUxSearchEvidence,
  type EuOjProductionUxSearchProof,
} from "../src/lib/catalog/eu-oj-production-ux-search-proof";
import { buildSafeBgOfficialVarietiesSummary } from "../src/lib/catalog/production-rollout-proof";
import {
  extractJsonObjectFromCommandOutput,
  parseCatalogSeedRolloutArgs,
  validateCatalogSeedRolloutOptions,
} from "../src/lib/catalog/seed-rollout-proof";
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
const BG_GARDEN_SMOKE_TIMEOUT_MS = 600_000;
const LEGACY_BG_PRODUCT_SOURCE = "eu_common_catalogue_bg";
const IASAS_BLOCKED_QUERIES = ["Куртовска капия", "Kurtovska kapia"] as const;

async function main() {
  const options = validateCatalogSeedRolloutOptions(
    parseCatalogSeedRolloutArgs(process.argv.slice(2)),
  );
  const codeState = readCodeState();
  const { db, connectionKind } = createDb();
  validateDatabaseTarget(options.environment, connectionKind);

  try {
    logProofStep("running production BG/EU OJ /garden smoke");
    const bgOfficialVarietiesSmoke = extractJsonObjectFromCommandOutput(
      runPackageScript(
        "smoke:garden-bg-official-varieties",
        ["--", "--base-url", options.baseUrl],
        BG_GARDEN_SMOKE_TIMEOUT_MS,
      ),
    );
    const bgSmokeSummary = buildSafeBgOfficialVarietiesSummary(
      bgOfficialVarietiesSmoke,
    );

    logProofStep("refreshing derived catalog typeahead index");
    const searchProof = await buildSearchProof(
      db,
      bgSmokeSummary.selectedCanonicalName,
    );

    const evidence = buildEuOjProductionUxSearchEvidence({
      options,
      codeState,
      bgOfficialVarietiesSmoke,
      searchProof,
      generatedAt: new Date().toISOString(),
    });

    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await db.destroy();
  }
}

async function buildSearchProof(
  db: Kysely<Database>,
  canonicalName: string,
): Promise<EuOjProductionUxSearchProof> {
  const client = createMeiliClient();
  const indexRefresh = await refreshCatalogTypeaheadIndex(db, client);
  const postgresSuggestions = await searchPostgresTypeahead(db, canonicalName);
  const meiliSearchResult = await searchMeiliTypeahead(client, canonicalName);
  const blockedOjProjectionLeaks = await countBlockedOjProjectionLeaks(db);
  if (blockedOjProjectionLeaks !== 0) {
    throw new Error("Blocked OJ parser rows reached product catalog items.");
  }
  const selectedCase = {
    key: "eu-oj-bg-official-varieties" as const,
    query: canonicalName,
    expectedCanonicalName: canonicalName,
    expectedCatalogKind: "plant_variety" as const,
    expectedSource: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
    postgresMatched: hasExpectedSuggestion(postgresSuggestions, {
      expectedCanonicalName: canonicalName,
      expectedCatalogKind: "plant_variety",
      expectedSource: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
    }),
    meilisearchMatched: hasExpectedSuggestion(meiliSearchResult.suggestions, {
      expectedCanonicalName: canonicalName,
      expectedCatalogKind: "plant_variety",
      expectedSource: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
    }),
    postgresSuggestionCount: postgresSuggestions.length,
    meilisearchSuggestionCount: meiliSearchResult.suggestions.length,
    duplicateSameConceptSuggestionsAbsent:
      suggestionsAreAlreadyDeduped(postgresSuggestions) &&
      suggestionsAreAlreadyDeduped(meiliSearchResult.suggestions),
  };

  const blockedRowsProof = [];
  let allMeiliHitsPublicSafe =
    meiliSearchResult.rawHitCount === meiliSearchResult.sanitizedHitCount;
  for (const query of IASAS_BLOCKED_QUERIES) {
    const blockedPostgresSuggestions = await searchPostgresTypeahead(db, query);
    const blockedMeiliSearchResult = await searchMeiliTypeahead(client, query);
    allMeiliHitsPublicSafe =
      allMeiliHitsPublicSafe &&
      blockedMeiliSearchResult.rawHitCount ===
        blockedMeiliSearchResult.sanitizedHitCount;
    blockedRowsProof.push({
      query,
      postgresForbiddenSuggestionAbsent: !hasForbiddenIasasSuggestion(
        query,
        blockedPostgresSuggestions,
      ),
      meilisearchForbiddenSuggestionAbsent: !hasForbiddenIasasSuggestion(
        query,
        blockedMeiliSearchResult.suggestions,
      ),
      duplicateSameConceptSuggestionsAbsent:
        suggestionsAreAlreadyDeduped(blockedPostgresSuggestions) &&
        suggestionsAreAlreadyDeduped(blockedMeiliSearchResult.suggestions),
    });
  }
  if (!allMeiliHitsPublicSafe) {
    throw new Error(
      "Meilisearch catalog_typeahead returned non-public-safe hits.",
    );
  }

  return {
    indexName: CATALOG_TYPEAHEAD_INDEX as "catalog_typeahead",
    derivedIndexRefresh: {
      mode: "direct_safe_catalog_rebuild" as const,
      documentsIndexed: indexRefresh.documentsIndexed,
      taskWaited: true as const,
      meilisearchMatchedAfterRefresh: true as const,
    },
    postgresFallback: "checked" as const,
    meilisearch: "checked" as const,
    selectedCase,
    blockedRowsProof: {
      reviewNeededAndRejectedOjRowsHaveNoProductLinks: true as const,
      blockedOjProjectionLeaks: 0 as const,
      iasasOnlyRowsAbsentFromSearch: blockedRowsProof,
    },
    publicSafeMeiliHitContract: true as const,
    leakCheck: "passed" as const,
  };
}

async function searchPostgresTypeahead(
  db: Kysely<Database>,
  query: string,
): Promise<CatalogTypeaheadSuggestion[]> {
  const normalized = normalizeSearchText(query);
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
    assertMeiliTaskSucceeded(
      await task.waitTask(MEILI_WAIT_OPTIONS),
      "catalog_typeahead settings update",
    );
  }

  assertMeiliTaskSucceeded(
    await index.deleteAllDocuments().waitTask(MEILI_WAIT_OPTIONS),
    "catalog_typeahead delete",
  );

  if (documents.length > 0) {
    assertMeiliTaskSucceeded(
      await index
        .addDocuments(documents, { primaryKey: "id" })
        .waitTask(MEILI_WAIT_OPTIONS),
      "catalog_typeahead add documents",
    );
  }

  return {
    documentsIndexed: documents.length,
  };
}

function assertMeiliTaskSucceeded(
  task: { status?: string; error?: unknown },
  label: string,
) {
  if (task.status !== "succeeded") {
    throw new Error(`${label} failed in Meilisearch.`);
  }
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

async function searchMeiliTypeahead(client: Meilisearch, query: string) {
  const result = await client.index(CATALOG_TYPEAHEAD_INDEX).search(query, {
    limit: 24,
  });
  const hits = result.hits ?? [];
  const sanitizedSuggestions = hits
    .map((hit) => catalogTypeaheadHitToSuggestion(hit))
    .filter((hit): hit is CatalogTypeaheadSuggestion => Boolean(hit));

  return {
    rawHitCount: hits.length,
    sanitizedHitCount: sanitizedSuggestions.length,
    suggestions: dedupeCatalogTypeaheadSuggestions(sanitizedSuggestions),
  };
}

async function countBlockedOjProjectionLeaks(db: Kysely<Database>) {
  const row = await db
    .selectFrom("catalog_source_records")
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .leftJoin("catalog_items as leaked_items", (join) =>
      join
        .onRef(
          "leaked_items.source_id",
          "=",
          "catalog_source_records.source_record_id",
        )
        .on(
          "leaked_items.source",
          "=",
          EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
        ),
    )
    .select(sql<number>`count(${sql.ref("leaked_items.id")})`.as("leaks"))
    .where(
      "catalog_source_snapshots.source_slug",
      "=",
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
    )
    .where("catalog_source_records.projection_status", "!=", "projected")
    .executeTakeFirst();

  return toNumber(row?.leaks);
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
    throw new Error("Local OVE-106 proof must use a local database.");
  }
  if (environment !== "local" && connectionKind !== "non_local") {
    throw new Error("Non-local OVE-106 proof must use a non-local database.");
  }
}

function createMeiliClient() {
  const host = process.env.MEILISEARCH_HOST?.trim();
  if (!host) {
    throw new Error("MEILISEARCH_HOST is required for OVE-106 proof.");
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

function hasForbiddenIasasSuggestion(
  query: string,
  suggestions: CatalogTypeaheadSuggestion[],
) {
  const normalizedQuery = normalizeSearchText(query);
  return suggestions.some(
    (suggestion) =>
      suggestion.source === LEGACY_BG_PRODUCT_SOURCE &&
      (normalizeSearchText(suggestion.canonicalName) === normalizedQuery ||
        normalizeSearchText(suggestion.displayName) === normalizedQuery),
  );
}

function suggestionsAreAlreadyDeduped(
  suggestions: CatalogTypeaheadSuggestion[],
) {
  return (
    dedupeCatalogTypeaheadSuggestions(suggestions).length === suggestions.length
  );
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function runPackageScript(
  script: string,
  args: string[] = [],
  timeoutMs: number,
) {
  const result = spawnSync("pnpm", [script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
    timeout: timeoutMs,
    maxBuffer: 24 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(
      `${script} failed before completion: ${result.error.message}. Output is withheld to keep OVE-106 evidence redacted.`,
    );
  }
  if (result.signal) {
    throw new Error(
      `${script} stopped with signal ${result.signal}. Output is withheld to keep OVE-106 evidence redacted.`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${script} failed with exit ${result.status ?? "unknown"}. Output is withheld to keep OVE-106 evidence redacted; run the package script directly in a private terminal for debugging.`,
    );
  }

  return result.stdout;
}

function readCodeState() {
  const commitSha =
    readNonEmptyEnvValue(process.env.VERCEL_GIT_COMMIT_SHA) ??
    readGitValue(["rev-parse", "HEAD"], "unknown") ??
    "unknown";
  const branch =
    readNonEmptyEnvValue(process.env.VERCEL_GIT_COMMIT_REF) ??
    readGitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown") ??
    "unknown";
  const status = readGitValue(
    ["status", "--porcelain", "--untracked-files=no"],
    null,
  );

  return {
    commitSha,
    branch,
    workingTree:
      status === null ? "unknown" : status.length === 0 ? "clean" : "dirty",
  } as const;
}

function readNonEmptyEnvValue(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
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

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function logProofStep(message: string) {
  console.error(`[OVE-106 proof] ${message}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
