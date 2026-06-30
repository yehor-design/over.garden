import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import {
  proveCatalogSourceRefreshStableUserReadback,
  readCatalogSourceRefreshTypeaheadProof,
  refreshCatalogSourceSample,
} from "../src/server/catalog-source/sample-refresh";

const REQUIRED_DIFF_STATUSES = [
  "new",
  "unchanged",
  "changed",
  "removed_upstream",
  "parser_reject",
  "review_needed",
  "projection_blocked",
] as const;

const FORBIDDEN_OUTPUT_MARKERS = [
  "raw_payload",
  "rawPayload",
  "source_only_fields",
  "sourceOnlyFields",
  "allowed_projection",
  "allowedProjection",
  "decimalLatitude",
  "decimalLongitude",
  "occurrenceCoordinates",
  "journalBody",
  "ownerUserId",
  "exifGps",
  "licenseStatus",
];

loadEnv({ path: ".env.local" });

const resolution = resolveDatabaseConnection(process.env);
const connectionString = resolvePgConnectionString(process.env, resolution);

if (!connectionString) {
  throw new Error("Missing supported database connection env");
}

const pool = new Pool({
  connectionString,
  max: 1,
  ssl: resolveDatabaseSslConfig(process.env, resolution),
});
const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

async function main() {
  const refreshed = await refreshCatalogSourceSample(db);
  const rerun = await refreshCatalogSourceSample(db);
  const newTypeaheadProof = await readCatalogSourceRefreshTypeaheadProof(
    db,
    "Refresh New 64",
  );
  const changedAliasTypeaheadProof =
    await readCatalogSourceRefreshTypeaheadProof(
      db,
      "Apricot Refresh Pearl 64",
    );
  const stableReadbackProof =
    await proveCatalogSourceRefreshStableUserReadback(db);

  assertRequiredDiffStatuses(refreshed.statusCounts);
  assertIdempotentRefresh(refreshed, rerun);

  if (
    !newTypeaheadProof.some(
      (row) => row.catalogItemId === refreshed.newCatalogItemId,
    )
  ) {
    throw new Error(
      "New accepted refresh row is missing from typeahead proof.",
    );
  }

  if (
    !changedAliasTypeaheadProof.some(
      (row) => row.catalogItemId === refreshed.changedCatalogItemId,
    )
  ) {
    throw new Error("Changed safe alias row is missing from typeahead proof.");
  }

  if (
    stableReadbackProof.catalogItemIdBeforeRefresh !==
    stableReadbackProof.catalogItemIdAfterRefresh
  ) {
    throw new Error(
      "User-linked object catalog identity changed during refresh.",
    );
  }

  const output = {
    refreshed,
    idempotencyProof: {
      rerunRefreshEventId: rerun.refreshEventId,
      rerunRefreshedSnapshotId: rerun.refreshedSnapshotId,
      rerunStatusCounts: rerun.statusCounts,
    },
    newTypeaheadProof,
    changedAliasTypeaheadProof,
    stableReadbackProof,
    leakCheck: "passed",
  };
  assertNoForbiddenOutput(output);

  console.log(JSON.stringify(output, null, 2));
}

function assertRequiredDiffStatuses(
  counts: Record<(typeof REQUIRED_DIFF_STATUSES)[number], number>,
) {
  for (const status of REQUIRED_DIFF_STATUSES) {
    if (counts[status] !== 1) {
      throw new Error(
        `Expected exactly one ${status} refresh diff row, got ${counts[status]}.`,
      );
    }
  }
}

function assertIdempotentRefresh(
  first: Awaited<ReturnType<typeof refreshCatalogSourceSample>>,
  second: Awaited<ReturnType<typeof refreshCatalogSourceSample>>,
) {
  if (first.refreshEventId !== second.refreshEventId) {
    throw new Error("Refresh rerun created a different audit event.");
  }
  if (first.refreshedSnapshotId !== second.refreshedSnapshotId) {
    throw new Error("Refresh rerun created a different refreshed snapshot.");
  }
  if (first.newCatalogItemId !== second.newCatalogItemId) {
    throw new Error("Refresh rerun duplicated the new accepted catalog item.");
  }
  if (first.changedCatalogItemId !== second.changedCatalogItemId) {
    throw new Error(
      "Refresh rerun changed the stable changed-row catalog item.",
    );
  }
  if (
    JSON.stringify(first.statusCounts) !== JSON.stringify(second.statusCounts)
  ) {
    throw new Error("Refresh rerun produced different diff counts.");
  }
}

function assertNoForbiddenOutput(output: unknown) {
  const text = JSON.stringify(output);
  for (const marker of FORBIDDEN_OUTPUT_MARKERS) {
    if (text.includes(marker)) {
      throw new Error(
        `Unsafe source-only marker reached refresh output: ${marker}`,
      );
    }
  }
}

main()
  .finally(async () => {
    await db.destroy();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
