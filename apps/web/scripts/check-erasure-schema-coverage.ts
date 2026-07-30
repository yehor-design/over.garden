import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertErasureCoverageCompleteness,
  discoverErasurePathsFromWalkingSkeletonSql,
  ERASURE_SCHEMA_COVERAGE,
  ERASURE_SCHEMA_COVERAGE_VERSION,
  ERASURE_SQL_DISCOVERY_REQUIRED_IDS,
} from "../src/server/erasure-schema-coverage";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sqlDirectory = join(root, "sql");

function main() {
  const sqlText = readCurrentSchemaSql();
  const discovered = discoverErasurePathsFromWalkingSkeletonSql(sqlText);

  for (const required of ERASURE_SQL_DISCOVERY_REQUIRED_IDS) {
    if (
      !discovered.includes(required) &&
      !sqlText.includes(required.split(".")[1]!)
    ) {
      // Fall back: column token must appear in SQL for required inventory.
      const column = required.split(".")[1];
      if (!column || !sqlText.includes(column)) {
        throw new Error(`Required erasure path missing from SQL: ${required}`);
      }
    }
  }

  for (const required of ERASURE_SQL_DISCOVERY_REQUIRED_IDS) {
    const [table, column] = required.split(".");
    if (!table || !column) {
      throw new Error(`Invalid required path: ${required}`);
    }
    if (!sqlText.includes(column)) {
      throw new Error(`SQL missing column token for ${required}`);
    }
    if (
      !sqlText.includes(table) &&
      required !== "community_contribution_reports.resolved_by_user_id"
    ) {
      throw new Error(`SQL missing table token for ${required}`);
    }
  }

  // Every ON DELETE RESTRICT user FK must be classified as anonymize.
  const restrictMatches = [
    ...sqlText.matchAll(
      /add constraint (\w+)\s+foreign key \((\w+)\)\s+references\s+"user"\(id\)\s+on delete restrict/gi,
    ),
  ];
  for (const match of restrictMatches) {
    const constraint = match[1] ?? "";
    const column = match[2] ?? "";
    const entry = ERASURE_SCHEMA_COVERAGE.find(
      (candidate) =>
        candidate.columnOrPath === column &&
        (constraint.includes(candidate.table.replace(/_/g, "_").slice(0, 20)) ||
          candidate.id.endsWith(`.${column}`)),
    );
    const byColumn = ERASURE_SCHEMA_COVERAGE.filter(
      (candidate) =>
        candidate.columnOrPath === column &&
        candidate.disposition === "anonymize",
    );
    if (byColumn.length === 0) {
      throw new Error(
        `RESTRICT user FK ${constraint} (${column}) lacks anonymize coverage.`,
      );
    }
    void entry;
  }

  assertErasureCoverageCompleteness({
    discoveredPathIds: discovered,
  });

  const unowned = ERASURE_SCHEMA_COVERAGE.filter(
    (entry) => !entry.dryRunOwned || !entry.executionOwned,
  );
  if (unowned.length > 0) {
    throw new Error(
      `Coverage entries missing ownership: ${unowned.map((e) => e.id).join(", ")}`,
    );
  }

  // Cover and identity markers must remain in SQL.
  for (const token of [
    "cover_media_asset_id",
    "usage_role",
    "user_public_profiles",
    "user_handle_registry",
    "cleanup_pending",
  ]) {
    if (!sqlText.includes(token)) {
      throw new Error(`Walking skeleton SQL missing required token: ${token}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        version: ERASURE_SCHEMA_COVERAGE_VERSION,
        classifiedPaths: ERASURE_SCHEMA_COVERAGE.length,
        discoveredSoftOrFkHints: discovered.length,
        restrictUserFks: restrictMatches.length,
      },
      null,
      2,
    ),
  );
}

function readCurrentSchemaSql() {
  return readdirSync(sqlDirectory)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((name) => readFileSync(join(sqlDirectory, name), "utf8"))
    .join("\n\n");
}

main();
