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
  importCatalogSourceSample,
  proveCatalogSourceSampleGardenReadback,
  readCatalogSourceSampleTypeaheadProof,
} from "../src/server/catalog-source/sample-import";

const FORBIDDEN_OUTPUT_MARKERS = [
  "decimalLatitude",
  "decimalLongitude",
  "occurrenceCoordinates",
  "journalBody",
  "ownerUserId",
  "exifGps",
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
  const imported = await importCatalogSourceSample(db);
  const typeaheadProof = await readCatalogSourceSampleTypeaheadProof(db);
  const gardenReadbackProof = await proveCatalogSourceSampleGardenReadback(
    db,
    imported.catalogItemId,
  );

  if (
    !typeaheadProof.some((row) => row.catalogItemId === imported.catalogItemId)
  ) {
    throw new Error("Imported catalog item is missing from typeahead proof.");
  }

  if (gardenReadbackProof.catalogItemId !== imported.catalogItemId) {
    throw new Error("Garden readback proof did not preserve the catalog item.");
  }

  const output = {
    imported,
    typeaheadProof,
    gardenReadbackProof,
    leakCheck: "passed",
  };
  assertNoForbiddenOutput(output);

  console.log(JSON.stringify(output, null, 2));
}

function assertNoForbiddenOutput(output: unknown) {
  const text = JSON.stringify(output);
  for (const marker of FORBIDDEN_OUTPUT_MARKERS) {
    if (text.includes(marker)) {
      throw new Error(
        `Unsafe source-only marker reached script output: ${marker}`,
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
