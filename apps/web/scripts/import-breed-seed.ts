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
import { breedSeedDefinition } from "../src/lib/catalog/breed-seed";
import {
  importBreedSeed,
  proveBreedSeedGardenReadback,
  readBreedSeedAliasCurationProof,
  readBreedSeedSourceProvenanceProof,
  readBreedSeedTypeaheadProof,
} from "../src/server/catalog-source/breed-seed-import";

const FORBIDDEN_OUTPUT_MARKERS = [
  '"raw_payload":',
  '"source_only_fields":',
  '"rawPayload":',
  '"sourceOnlyFields":',
  '"allowedProjection":',
  '"allowed_projection":',
  "dadIsEfabisInternalValidation",
  "vboId",
  "dadIsRef",
  "efabisRef",
  "latinNameDispute",
  "restrictedFields",
  "coordinates",
  "latitude",
  "longitude",
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
  const definition = breedSeedDefinition();
  const imported = await importBreedSeed(db, definition);
  const rerun = await importBreedSeed(db, definition);

  const ukrainianTypeaheadProof = await readBreedSeedTypeaheadProof(
    db,
    "Карпатська",
  );
  const englishTypeaheadProof = await readBreedSeedTypeaheadProof(
    db,
    "Carpathian honey bee",
  );
  const blockedLatinTypeaheadProof = await readBreedSeedTypeaheadProof(
    db,
    "Apis mellifera carpatica",
  );
  const provenanceProof = await readBreedSeedSourceProvenanceProof(
    db,
    imported.catalogItemId,
  );
  const aliasCurationProof = await readBreedSeedAliasCurationProof(
    db,
    imported.catalogItemId,
  );
  const gardenReadbackProof = await proveBreedSeedGardenReadback(
    db,
    imported.catalogItemId,
  );

  if (rerun.catalogItemId !== imported.catalogItemId) {
    throw new Error("Re-run import created a different breed catalog item.");
  }
  if (rerun.sourceRecordId !== imported.sourceRecordId) {
    throw new Error("Re-run import created a different breed source row.");
  }
  if (!provenanceProof) {
    throw new Error("Breed provenance proof is missing.");
  }
  if (provenanceProof.catalogKind !== "breed") {
    throw new Error("Breed provenance proof did not preserve catalog kind.");
  }
  if (!Array.isArray(provenanceProof.allowedUsage)) {
    throw new Error("Breed provenance proof did not expose allowed usage.");
  }
  if (
    !provenanceProof.allowedUsage.includes("canonical_product_projection") ||
    !provenanceProof.allowedUsage.includes("manual_seed")
  ) {
    throw new Error("Breed provenance proof is missing allowed usage flags.");
  }

  assertCatalogItemMatch(
    ukrainianTypeaheadProof,
    imported.catalogItemId,
    "Imported breed is missing by Ukrainian official/common name.",
  );
  assertCatalogItemMatch(
    englishTypeaheadProof,
    imported.catalogItemId,
    "Imported breed is missing by English display alias.",
  );
  assertNoCatalogItemMatch(
    blockedLatinTypeaheadProof,
    imported.catalogItemId,
    "Review-needed Latin breed mapping reached typeahead.",
  );
  if (gardenReadbackProof.catalogItemId !== imported.catalogItemId) {
    throw new Error("Garden readback proof did not preserve breed identity.");
  }
  if (gardenReadbackProof.objectKind !== "bee_colony") {
    throw new Error("Garden readback proof did not preserve bee colony kind.");
  }
  if (gardenReadbackProof.catalogKind !== "breed") {
    throw new Error("Garden readback proof did not preserve breed kind.");
  }
  assertAliasCurationProof(aliasCurationProof, imported.catalogItemId);

  const output = {
    imported: redactSourceIds(imported),
    idempotencyProof: {
      rerunCatalogItemId: rerun.catalogItemId,
      rerunSourceRecordId: rerun.sourceRecordId,
    },
    ukrainianTypeaheadProof,
    englishTypeaheadProof,
    blockedLatinTypeaheadProof,
    provenanceProof,
    aliasCurationProof,
    gardenReadbackProof,
    leakCheck: "passed",
  };
  assertNoForbiddenOutput(output);

  console.log(JSON.stringify(output, null, 2));
}

function assertCatalogItemMatch(
  rows: Array<{ catalogItemId: string; catalogKind: string }>,
  catalogItemId: string,
  message: string,
) {
  if (
    !rows.some(
      (row) =>
        row.catalogItemId === catalogItemId && row.catalogKind === "breed",
    )
  ) {
    throw new Error(message);
  }
}

function assertNoCatalogItemMatch(
  rows: Array<{ catalogItemId: string }>,
  catalogItemId: string,
  message: string,
) {
  if (rows.some((row) => row.catalogItemId === catalogItemId)) {
    throw new Error(message);
  }
}

function assertAliasCurationProof(
  rows: Array<{
    catalogItemId: string;
    displayName: string;
    status: string;
    projectedToTypeahead: boolean;
  }>,
  catalogItemId: string,
) {
  const accepted = rows.filter((row) => row.status === "accepted");
  const reviewNeeded = rows.filter((row) => row.status === "review_needed");

  if (accepted.length < 3) {
    throw new Error("Breed alias proof is missing accepted aliases.");
  }
  if (
    !reviewNeeded.some((row) => row.displayName === "Apis mellifera carpatica")
  ) {
    throw new Error("Breed alias proof is missing held Latin review alias.");
  }
  if (reviewNeeded.some((row) => row.projectedToTypeahead)) {
    throw new Error("Review-needed breed aliases reached typeahead.");
  }
  if (!rows.every((row) => row.catalogItemId === catalogItemId)) {
    throw new Error(
      "Breed alias proof contains rows from another catalog item.",
    );
  }
}

function redactSourceIds<T extends { sourceIds?: unknown }>(value: T) {
  const redacted = { ...value };
  delete redacted.sourceIds;
  return redacted;
}

function assertNoForbiddenOutput(output: unknown) {
  const text = JSON.stringify(output);
  for (const marker of FORBIDDEN_OUTPUT_MARKERS) {
    if (text.includes(marker)) {
      throw new Error(`Unsafe source-only marker reached output: ${marker}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
