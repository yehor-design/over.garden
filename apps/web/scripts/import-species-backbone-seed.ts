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
import { speciesBackboneSeedDefinition } from "../src/lib/catalog/species-backbone-seed";
import {
  importSpeciesBackboneSeed,
  proveSpeciesBackboneGardenReadback,
  readSpeciesBackboneSourceProvenanceProof,
  readSpeciesBackboneTypeaheadProof,
} from "../src/server/catalog-source/species-backbone-import";

const REQUIRED_SOURCE_SLUGS = [
  "catalogue-of-life-checklistbank",
  "world-flora-online",
  "gbif-backbone",
  "eppo-codes",
  "wikidata",
] as const;

const FORBIDDEN_OUTPUT_MARKERS = [
  '"raw_payload":',
  '"source_only_fields":',
  '"sourceOnlyFields":',
  '"rawPayload":',
  '"allowedProjection":',
  '"allowed_projection":',
  "decimalLatitude",
  "decimalLongitude",
  "poisonCoordinateSentinel",
  "nonProjectedDistributionText",
  "journalBody",
  "ownerUserId",
  "exifGps",
  "sourceFileRowCount",
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
  const definition = speciesBackboneSeedDefinition();
  const imported = await importSpeciesBackboneSeed(db, definition);
  const rerun = await importSpeciesBackboneSeed(db, definition);

  const scientificTypeaheadProof = await readSpeciesBackboneTypeaheadProof(
    db,
    imported.acceptedScientificName,
  );
  const englishAliasTypeaheadProof = await readSpeciesBackboneTypeaheadProof(
    db,
    "Tomato",
  );
  const ukrainianAliasTypeaheadProof = await readSpeciesBackboneTypeaheadProof(
    db,
    "помідор",
  );
  const synonymTypeaheadProof = await readSpeciesBackboneTypeaheadProof(
    db,
    "Lycopersicon esculentum",
  );
  const provenanceProof = await readSpeciesBackboneSourceProvenanceProof(
    db,
    imported.catalogItemId,
  );
  const gardenReadbackProof = await proveSpeciesBackboneGardenReadback(
    db,
    imported.catalogItemId,
  );

  if (rerun.catalogItemId !== imported.catalogItemId) {
    throw new Error("Re-run import created a different catalog item.");
  }

  for (const slug of REQUIRED_SOURCE_SLUGS) {
    if (rerun.sourceRecordIds[slug] !== imported.sourceRecordIds[slug]) {
      throw new Error(`Re-run import created a different ${slug} source row.`);
    }
    if (!provenanceProof.some((row) => row.sourceSlug === slug)) {
      throw new Error(`Missing provenance row for ${slug}.`);
    }
  }

  if (
    !scientificTypeaheadProof.some(
      (row) => row.catalogItemId === imported.catalogItemId,
    )
  ) {
    throw new Error("Imported species is missing by accepted scientific name.");
  }
  if (
    !englishAliasTypeaheadProof.some(
      (row) => row.catalogItemId === imported.catalogItemId,
    )
  ) {
    throw new Error("Imported species is missing by English common name.");
  }
  if (
    !ukrainianAliasTypeaheadProof.some(
      (row) => row.catalogItemId === imported.catalogItemId,
    )
  ) {
    throw new Error("Imported species is missing by Ukrainian common name.");
  }
  if (
    !synonymTypeaheadProof.some(
      (row) => row.catalogItemId === imported.catalogItemId,
    )
  ) {
    throw new Error("Imported species is missing by source-backed synonym.");
  }
  if (gardenReadbackProof.catalogItemId !== imported.catalogItemId) {
    throw new Error("Garden readback proof did not preserve catalog identity.");
  }
  if (gardenReadbackProof.catalogSource !== "species_backbone") {
    throw new Error("Garden readback proof did not preserve species source.");
  }

  const output = {
    imported,
    idempotencyProof: {
      rerunCatalogItemId: rerun.catalogItemId,
      rerunSourceRecordIds: rerun.sourceRecordIds,
    },
    scientificTypeaheadProof,
    englishAliasTypeaheadProof,
    ukrainianAliasTypeaheadProof,
    synonymTypeaheadProof,
    provenanceProof,
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
      throw new Error(`Unsafe source-only marker reached output: ${marker}`);
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
