import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import type { Kysely } from "kysely";
import { Client } from "pg";

import type { Database } from "../src/db/schema";
import type {
  approveCatalogAliasSuggestion as approveAliasFn,
  listCatalogAliasSuggestionsForCuration as listAliasesFn,
  rejectCatalogAliasSuggestion as rejectAliasFn,
} from "../src/server/catalog-alias-curation-repository";
import type {
  searchCatalogSuggestions as searchCatalogFn,
  searchCatalogSuggestionsForTypeahead as searchTypeaheadFn,
} from "../src/server/catalog-repository";

type DB = Kysely<Database>;

let db: DB;
let approveCatalogAliasSuggestion: typeof approveAliasFn;
let listCatalogAliasSuggestionsForCuration: typeof listAliasesFn;
let rejectCatalogAliasSuggestion: typeof rejectAliasFn;
let searchCatalogSuggestions: typeof searchCatalogFn;
let searchCatalogSuggestionsForTypeahead: typeof searchTypeaheadFn;
let isolatedSmokeDatabase: { adminUrl: string; databaseName: string } | null =
  null;

const REVIEWER_USER_ID = "16000000-0000-4000-8000-000000000001";
const REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";
const SNAPSHOT_AT = new Date("2026-07-15T12:00:00.000Z");

const UK_ITEM_ID = "16010000-0000-4000-8000-000000000001";
const BG_COLLISION_ITEM_ID = "16020000-0000-4000-8000-000000000001";
const BG_OTHER_ITEM_ID = "16030000-0000-4000-8000-000000000001";
const RU_REJECT_ITEM_ID = "16040000-0000-4000-8000-000000000001";
const BG_APPROVE_ITEM_ID = "16050000-0000-4000-8000-000000000001";
const ITEM_IDS = [
  UK_ITEM_ID,
  BG_COLLISION_ITEM_ID,
  BG_OTHER_ITEM_ID,
  RU_REJECT_ITEM_ID,
  BG_APPROVE_ITEM_ID,
] as const;
const GENERATION_ITEM_IDS = [
  UK_ITEM_ID,
  BG_COLLISION_ITEM_ID,
  RU_REJECT_ITEM_ID,
  BG_APPROVE_ITEM_ID,
] as const;

const NAME_ROWS = [
  catalogName(
    "16010000-0000-4000-8000-000000000101",
    UK_ITEM_ID,
    "Ґрунтовий томат тестовий",
    "uk",
  ),
  catalogName(
    "16020000-0000-4000-8000-000000000101",
    BG_COLLISION_ITEM_ID,
    "Розова градина тестова",
    "bg",
  ),
  catalogName(
    "16030000-0000-4000-8000-000000000101",
    BG_OTHER_ITEM_ID,
    "Rozova gradina testova",
    "bg",
  ),
  catalogName(
    "16040000-0000-4000-8000-000000000101",
    RU_REJECT_ITEM_ID,
    "Ёлка садовая тестовая",
    "ru",
  ),
  catalogName(
    "16050000-0000-4000-8000-000000000101",
    BG_APPROVE_ITEM_ID,
    "Българска роза тестова",
    "bg",
  ),
] as const;

async function main() {
  loadEnv({ path: ".env.local", override: false });

  const mode = process.argv[2];
  const configuredDatabaseUrl =
    process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  const localDatabaseUrl = requireLoopbackPostgresUrl(configuredDatabaseUrl);

  if (!mode) {
    isolatedSmokeDatabase = await createIsolatedSmokeDatabase(localDatabaseUrl);
    const isolatedUrl = databaseUrlForName(
      localDatabaseUrl,
      isolatedSmokeDatabase.databaseName,
    );
    process.env.DATABASE_URL = isolatedUrl;
    process.env.DIRECT_URL = isolatedUrl;
    await bootstrapIsolatedSmokeDatabase(isolatedUrl);
  }

  ({ db } = await import("../src/db"));
  ({
    approveCatalogAliasSuggestion,
    listCatalogAliasSuggestionsForCuration,
    rejectCatalogAliasSuggestion,
  } = await import("../src/server/catalog-alias-curation-repository"));
  ({ searchCatalogSuggestions, searchCatalogSuggestionsForTypeahead } =
    await import("../src/server/catalog-repository"));

  if (mode === "--seed-ui") {
    await seedUiFixtures();
    return;
  }
  if (mode === "--reset-ui") {
    await cleanupFixtureRows();
    printResult({ curationUiFixturesReset: true });
    return;
  }
  if (mode) throw new Error(`Unsupported smoke mode: ${mode}`);

  await cleanupFixtureRows();
  await seedCatalogRows();
  runAliasWorker();
  await proveReviewAndTypeaheadFlow();
}

async function proveReviewAndTypeaheadFlow() {
  let aliases = await listCatalogAliasSuggestionsForCuration(100);
  const approvedCandidate = requireAlias(aliases, BG_APPROVE_ITEM_ID, [
    "cyrtranslit_forward",
  ]);
  const rejectedCandidate = requireAlias(aliases, RU_REJECT_ITEM_ID, [
    "ru_yo_fold",
  ]);
  const collisionCandidate = requireAlias(aliases, BG_COLLISION_ITEM_ID, [
    "normalized_collision",
  ]);
  const unapprovedCandidate = requireAlias(aliases, UK_ITEM_ID, [
    "cyrtranslit_forward",
  ]);

  assertEqual(collisionCandidate.status, "review_needed", "collision status");
  await assertCatalogAbsentFromTypeahead(
    approvedCandidate.displayName,
    BG_APPROVE_ITEM_ID,
    "unapproved alias",
  );

  const collision = await approveCatalogAliasSuggestion(
    { userId: REVIEWER_USER_ID, sessionId: "ove-160-smoke-collision" },
    { aliasProjectionId: collisionCandidate.id },
  );
  assertEqual(collision.outcome, "collision", "collision approval outcome");
  assertEqual(
    await countReindexJobs(),
    0,
    "collision must not enqueue typeahead reindex",
  );

  const rejected = await rejectCatalogAliasSuggestion(
    { userId: REVIEWER_USER_ID, sessionId: "ove-160-smoke-reject" },
    {
      aliasProjectionId: rejectedCandidate.id,
      reasonCode: "incorrect_variant",
    },
  );
  assertEqual(rejected.outcome, "rejected", "rejection outcome");
  assertEqual(
    await countReindexJobs(),
    0,
    "rejection must not enqueue typeahead reindex",
  );

  const approved = await approveCatalogAliasSuggestion(
    { userId: REVIEWER_USER_ID, sessionId: "ove-160-smoke-approve" },
    { aliasProjectionId: approvedCandidate.id },
  );
  assertEqual(approved.outcome, "approved", "approval outcome");
  assert(approved.catalogItemNameId, "approval did not project an alias name");

  const approvedAlias = await assertCatalogPresentInTypeahead(
    approvedCandidate.displayName,
    BG_APPROVE_ITEM_ID,
  );
  assertEqual(
    approvedAlias.serveClass,
    "generated",
    "approved alias served class",
  );
  await assertCatalogAbsentFromTypeahead(
    rejectedCandidate.displayName,
    RU_REJECT_ITEM_ID,
    "rejected alias",
  );
  await assertCatalogAbsentFromTypeahead(
    collisionCandidate.displayName,
    BG_COLLISION_ITEM_ID,
    "collision alias",
  );
  await assertCatalogAbsentFromTypeahead(
    unapprovedCandidate.displayName,
    UK_ITEM_ID,
    "unapproved alias",
  );

  const reindexJob = await db
    .selectFrom("job_queue")
    .select(["queue_name as queueName", "payload", "status"])
    .where("idempotency_key", "=", REINDEX_IDEMPOTENCY_KEY)
    .executeTakeFirstOrThrow();
  assertEqual(reindexJob.queueName, "matching", "reindex queue");
  assertEqual(reindexJob.status, "pending", "reindex status");
  assertEqual(
    JSON.stringify(reindexJob.payload),
    JSON.stringify({ kind: "catalog_typeahead_reindex" }),
    "reindex payload",
  );

  await db
    .updateTable("catalog_item_names")
    .set({ is_primary: false })
    .where("catalog_item_id", "=", UK_ITEM_ID)
    .execute();
  const stale = await approveCatalogAliasSuggestion(
    { userId: REVIEWER_USER_ID, sessionId: "ove-160-smoke-stale" },
    { aliasProjectionId: unapprovedCandidate.id },
  );
  assertEqual(stale.outcome, "stale", "ineligible source approval outcome");
  assertEqual(
    await countReindexJobs(),
    1,
    "stale source must not enqueue another typeahead reindex",
  );

  runAliasWorker();
  aliases = await listCatalogAliasSuggestionsForCuration(100);
  assertEqual(
    aliases.find((row) => row.id === approvedCandidate.id)?.status,
    "accepted",
    "approved row after deterministic replay",
  );
  assertEqual(
    aliases.find((row) => row.id === rejectedCandidate.id)?.status,
    "rejected",
    "rejected row after deterministic replay",
  );
  assertEqual(
    aliases.find((row) => row.id === collisionCandidate.id)?.status,
    "review_needed",
    "collision row after deterministic replay",
  );

  printResult({
    workerContractExecuted: true,
    generatedVariantsReviewGated: true,
    collisionApprovalBlocked: true,
    rejectionLeavesTypeaheadUntouched: true,
    approvalProjectsAliasAtomically: true,
    approvedAliasFoundThroughTypeahead: true,
    approvedAliasServeClass: "generated",
    staleSourceApprovalPreservesCanonicalState: true,
    replayPreservesAcceptedAndRejectedDecisions: true,
  });
}

async function seedUiFixtures() {
  await cleanupFixtureRows();
  await seedCatalogRows();
  runAliasWorker();

  const owner = await db
    .selectFrom("admin_user_roles")
    .select("user_id as userId")
    .where("role", "=", "owner")
    .executeTakeFirst();
  if (!owner) {
    throw new Error(
      "OVE-160 UI fixtures require the signed-in local account to hold the owner role.",
    );
  }

  const aliases = await listCatalogAliasSuggestionsForCuration(100);
  const approvedCandidate = requireAlias(aliases, BG_APPROVE_ITEM_ID, [
    "cyrtranslit_forward",
  ]);
  const rejectedCandidate = requireAlias(aliases, RU_REJECT_ITEM_ID, [
    "ru_yo_fold",
  ]);

  const approvedName = await db
    .insertInto("catalog_item_names")
    .values({
      catalog_item_id: approvedCandidate.catalogItemId,
      display_name: approvedCandidate.displayName,
      normalized_name: approvedCandidate.normalizedName,
      locale: approvedCandidate.locale,
      is_primary: false,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .updateTable("catalog_alias_projections")
    .set({
      catalog_item_name_id: approvedName.id,
      status: "accepted",
      reviewed_at: SNAPSHOT_AT,
      reviewed_by_user_id: owner.userId,
      decision_reason_code: "approved_generated_alias",
      decision_result: "alias_projected",
      updated_at: SNAPSHOT_AT,
    })
    .where("id", "=", approvedCandidate.id)
    .executeTakeFirstOrThrow();

  await db
    .updateTable("catalog_alias_projections")
    .set({
      status: "rejected",
      reviewed_at: SNAPSHOT_AT,
      reviewed_by_user_id: owner.userId,
      decision_reason_code: "incorrect_variant",
      decision_result: "alias_rejected",
      updated_at: SNAPSHOT_AT,
    })
    .where("id", "=", rejectedCandidate.id)
    .executeTakeFirstOrThrow();

  const stateRows = await listCatalogAliasSuggestionsForCuration(100);
  printResult({
    curationUiFixturesSeeded: true,
    states: [...new Set(stateRows.map((row) => row.status))].sort(),
    rows: stateRows.length,
    searchQuery: "OVE160",
  });
}

async function seedCatalogRows() {
  await db
    .insertInto("catalog_items")
    .values([
      catalogItem(UK_ITEM_ID, "OVE160 - Ґрунтовий томат", "uk", "uk-safe"),
      catalogItem(
        BG_COLLISION_ITEM_ID,
        "OVE160 - Розова градина",
        "bg",
        "bg-collision-source",
      ),
      catalogItem(
        BG_OTHER_ITEM_ID,
        "OVE160 - Rozova gradina",
        "bg",
        "bg-collision-target",
      ),
      catalogItem(
        RU_REJECT_ITEM_ID,
        "OVE160 - Ёлка садовая",
        "ru",
        "ru-reject",
      ),
      catalogItem(
        BG_APPROVE_ITEM_ID,
        "OVE160 - Българска роза",
        "bg",
        "bg-approve",
      ),
    ])
    .execute();
  await db
    .insertInto("catalog_item_names")
    .values([...NAME_ROWS])
    .execute();
}

function runAliasWorker() {
  const matchingDirectory = fileURLToPath(
    new URL("../../../services/matching/", import.meta.url),
  );
  const args = [
    "run",
    "--frozen",
    "python",
    "-m",
    "scripts.run_catalog_alias_generation",
    ...GENERATION_ITEM_IDS.flatMap((catalogItemId) => [
      "--catalog-item",
      catalogItemId,
    ]),
  ];
  const output = execFileSync("uv", args, {
    cwd: matchingDirectory,
    env: process.env,
    encoding: "utf8",
  });
  const result = JSON.parse(output) as { ok?: boolean };
  assert(result.ok === true, "alias worker did not return a passing result");
}

async function catalogTypeahead(query: string) {
  return searchCatalogSuggestionsForTypeahead(query, 8, {
    searchWithMeili: async () => [],
    searchWithPostgres: searchCatalogSuggestions,
  });
}

async function assertCatalogPresentInTypeahead(
  query: string,
  catalogItemId: string,
) {
  const results = await catalogTypeahead(query);
  const approved = results.find((result) => result.id === catalogItemId);
  assert(approved, `typeahead did not return approved alias ${query}`);
  return approved;
}

async function assertCatalogAbsentFromTypeahead(
  query: string,
  catalogItemId: string,
  label: string,
) {
  const results = await catalogTypeahead(query);
  assert(
    results.every((result) => result.id !== catalogItemId),
    `${label} unexpectedly returned catalog identity ${catalogItemId}`,
  );
}

function requireAlias(
  aliases: Awaited<ReturnType<typeof listCatalogAliasSuggestionsForCuration>>,
  catalogItemId: string,
  reasonCodes: string[],
) {
  const row = aliases.find(
    (candidate) =>
      candidate.catalogItemId === catalogItemId &&
      reasonCodes.every((reasonCode) =>
        candidate.reasonCodes.includes(reasonCode),
      ),
  );
  if (!row) {
    throw new Error(
      `Missing alias fixture for ${catalogItemId} and ${reasonCodes.join(",")}`,
    );
  }
  return row;
}

async function countReindexJobs() {
  const row = await db
    .selectFrom("job_queue")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("idempotency_key", "=", REINDEX_IDEMPOTENCY_KEY)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

async function cleanupFixtureRows() {
  await db
    .deleteFrom("job_queue")
    .where(
      "idempotency_key",
      "in",
      GENERATION_ITEM_IDS.map(
        (id) => `matching:catalog_alias_suggestions_refresh:${id}`,
      ),
    )
    .execute();
  await db
    .deleteFrom("catalog_items")
    .where("id", "in", [...ITEM_IDS])
    .execute();
}

function catalogItem(
  id: string,
  canonicalName: string,
  locale: string,
  sourceId: string,
) {
  return {
    id,
    canonical_name: canonicalName,
    normalized_name: canonicalName.toLocaleLowerCase(locale),
    public_slug: `ove-160-${sourceId}`,
    catalog_kind: "plant_variety" as const,
    status: "seeded" as const,
    source: "internal_seed",
    source_id: `ove-160-${sourceId}`,
    created_by_user_id: null,
    locale,
    created_at: SNAPSHOT_AT,
    updated_at: SNAPSHOT_AT,
  };
}

function catalogName(
  id: string,
  catalogItemId: string,
  displayName: string,
  locale: string,
) {
  return {
    id,
    catalog_item_id: catalogItemId,
    display_name: displayName,
    normalized_name: displayName.toLocaleLowerCase(locale),
    locale,
    is_primary: true,
    created_at: SNAPSHOT_AT,
  };
}

function printResult(details: Record<string, unknown>) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        issue: "OVE-160",
        ...details,
        productionDataTouched: false,
      },
      null,
      2,
    ),
  );
}

function requireLoopbackPostgresUrl(value: string | undefined) {
  if (!value?.trim()) {
    throw new Error(
      "DATABASE_URL or DIRECT_URL is required for OVE-160 smoke.",
    );
  }
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("OVE-160 smoke requires the Postgres protocol.");
  }
  if (
    !new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]).has(
      url.hostname.toLowerCase(),
    )
  ) {
    throw new Error(
      "OVE-160 smoke refuses non-loopback databases before writes.",
    );
  }
  if (!decodeURIComponent(url.pathname.replace(/^\//, ""))) {
    throw new Error("OVE-160 smoke requires a named local database.");
  }
  return url.toString();
}

async function createIsolatedSmokeDatabase(adminUrl: string) {
  const databaseName = `overgarden_ove160_${process.pid}_${Date.now()}`;
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`create database "${databaseName}"`);
  } finally {
    await client.end();
  }
  return { adminUrl, databaseName };
}

async function bootstrapIsolatedSmokeDatabase(databaseUrl: string) {
  const schema = await readFile(
    new URL("../sql/0001_walking_skeleton.sql", import.meta.url),
    "utf8",
  );
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(schema);
  } finally {
    await client.end();
  }
}

function databaseUrlForName(databaseUrl: string, databaseName: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function dropIsolatedSmokeDatabase(
  isolated: { adminUrl: string; databaseName: string } | null,
) {
  if (!isolated) return;
  const client = new Client({ connectionString: isolated.adminUrl });
  await client.connect();
  try {
    await client.query(
      `select pg_terminate_backend(pid)
       from pg_stat_activity
       where datname = $1 and pid <> pg_backend_pid()`,
      [isolated.databaseName],
    );
    await client.query(`drop database if exists "${isolated.databaseName}"`);
  } finally {
    await client.end();
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

main()
  .finally(async () => {
    await db?.destroy();
    await dropIsolatedSmokeDatabase(isolatedSmokeDatabase);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
