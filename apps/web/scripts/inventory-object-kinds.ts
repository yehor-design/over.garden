import { readFileSync } from "node:fs";
import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import {
  assertObjectKindInventorySqlIsSelectOnly,
  buildObjectKindInventoryReport,
  formatObjectKindInventoryReport,
  OBJECT_KIND_INVENTORY_SQL,
  type ObjectKindCountRow,
  type ObjectKindDependentsSummary,
  type UnexpectedKindRow,
} from "../src/server/catalog/object-kind-inventory";

const envFile = argValue("--env-file") ?? ".env.local";
loadEnv({ path: envFile, override: false, quiet: true });

const caFile = argValue("--ca-file");
if (caFile) {
  process.env.DATABASE_SSL_CA = readFileSync(caFile, "utf8");
}

assertObjectKindInventorySqlIsSelectOnly();

const resolution = resolveDatabaseConnection(process.env);
const connectionString = resolvePgConnectionString(process.env, resolution);

if (!connectionString) {
  throw new Error("Missing supported database connection env (DATABASE_URL)");
}

const pool = new Pool({
  connectionString,
  max: 1,
  ssl: resolveDatabaseSslConfig(process.env, resolution),
});

async function main() {
  const kindCountsResult = await pool.query<{
    objectKind: string;
    count: string;
  }>(OBJECT_KIND_INVENTORY_SQL.kindCounts);

  const unexpectedResult = await pool.query<{
    id: string;
    objectKind: string;
    catalogItemId: string | null;
    varietyState: string;
    catalogKind: string | null;
    catalogSource: string | null;
  }>(OBJECT_KIND_INVENTORY_SQL.unexpectedRows);

  const dependentsResult = await pool.query<{
    journalEntries: string;
    journalEntryObjectMentions: string;
    lineageSubjectEdges: string;
    lineageSourceEdges: string;
    mediaAssetsViaJournal: string;
    publicSlugJournalEntries: string;
  }>(OBJECT_KIND_INVENTORY_SQL.dependents);

  const kindCounts: ObjectKindCountRow[] = kindCountsResult.rows.map((row) => ({
    objectKind: row.objectKind,
    count: Number(row.count),
  }));

  const unexpectedRows: UnexpectedKindRow[] = unexpectedResult.rows.map(
    (row) => ({
      id: row.id,
      objectKind: row.objectKind,
      catalogItemId: row.catalogItemId,
      varietyState: row.varietyState,
      catalogKind: row.catalogKind,
      catalogSource: row.catalogSource,
    }),
  );

  const dependentsRow = dependentsResult.rows[0];
  const dependents: ObjectKindDependentsSummary = {
    journalEntries: Number(dependentsRow?.journalEntries ?? 0),
    journalEntryObjectMentions: Number(
      dependentsRow?.journalEntryObjectMentions ?? 0,
    ),
    lineageSubjectEdges: Number(dependentsRow?.lineageSubjectEdges ?? 0),
    lineageSourceEdges: Number(dependentsRow?.lineageSourceEdges ?? 0),
    mediaAssetsViaJournal: Number(dependentsRow?.mediaAssetsViaJournal ?? 0),
    publicSlugJournalEntries: Number(
      dependentsRow?.publicSlugJournalEntries ?? 0,
    ),
  };

  const report = buildObjectKindInventoryReport({
    kindCounts,
    unexpectedRows,
    dependents,
  });

  process.stdout.write(formatObjectKindInventoryReport(report));
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
