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
import { bgOfficialVarietyDefinition } from "../src/lib/catalog/bg-official-variety";
import {
  importBgOfficialVariety,
  proveBgOfficialVarietyGardenReadback,
  readBgOfficialVarietyBlockedRecordProof,
  readBgOfficialVarietySourceProvenanceProof,
  readBgOfficialVarietyTypeaheadProof,
} from "../src/server/catalog-source/bg-official-variety-import";

const FORBIDDEN_OUTPUT_MARKERS = [
  "raw_payload",
  "source_only_fields",
  "sourceOnlyFields",
  "liveProof",
  "nationalId",
  "registerSubType",
  "journalBody",
  "ownerUserId",
  "exifGps",
  "decimalLatitude",
  "decimalLongitude",
  "occurrenceCoordinates",
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
  const definition = bgOfficialVarietyDefinition();
  const imported = await importBgOfficialVariety(db, definition);
  const rerun = await importBgOfficialVariety(db, definition);
  const bulgarianTypeaheadProof = await readBgOfficialVarietyTypeaheadProof(
    db,
    imported.canonicalName,
  );
  const latinTypeaheadProof = await readBgOfficialVarietyTypeaheadProof(
    db,
    "Sadovo 1",
  );
  const blockedTypeaheadProof = await readBgOfficialVarietyTypeaheadProof(
    db,
    "Kurtovska",
  );
  const provenanceProof = await readBgOfficialVarietySourceProvenanceProof(
    db,
    imported.catalogItemId,
  );
  const blockedRecordProof = await readBgOfficialVarietyBlockedRecordProof(
    db,
    imported.blockedRecordKey,
  );
  const gardenReadbackProof = await proveBgOfficialVarietyGardenReadback(
    db,
    imported.catalogItemId,
  );

  if (rerun.catalogItemId !== imported.catalogItemId) {
    throw new Error("Re-run import created a different catalog item.");
  }
  if (rerun.sourceRecordId !== imported.sourceRecordId) {
    throw new Error(
      "Re-run import created a different projected source record.",
    );
  }
  if (rerun.blockedSourceRecordId !== imported.blockedSourceRecordId) {
    throw new Error("Re-run import created a different blocked source record.");
  }
  if (
    !bulgarianTypeaheadProof.some(
      (row) => row.catalogItemId === imported.catalogItemId,
    )
  ) {
    throw new Error(
      "Imported BG official variety is missing by Bulgarian name.",
    );
  }
  if (
    !latinTypeaheadProof.some(
      (row) => row.catalogItemId === imported.catalogItemId,
    )
  ) {
    throw new Error("Imported BG official variety is missing by Latin alias.");
  }
  if (blockedTypeaheadProof.length > 0) {
    throw new Error("Review-only BG official variety row reached typeahead.");
  }
  if (!provenanceProof) {
    throw new Error(
      "Imported BG official variety is missing provenance readback.",
    );
  }
  if (provenanceProof.sourceRecordKey !== imported.sourceRecordKey) {
    throw new Error("Provenance readback source row key mismatch.");
  }
  assertRequiredAttributionProof(provenanceProof);
  assertAllowedProjectionProof(provenanceProof.allowedProjection);
  if (!blockedRecordProof) {
    throw new Error("Blocked BG official variety source row proof is missing.");
  }
  if (blockedRecordProof.projectionStatus !== "quarantined") {
    throw new Error("Low-confidence BG source row was not quarantined.");
  }
  if (gardenReadbackProof.catalogItemId !== imported.catalogItemId) {
    throw new Error("Garden readback proof did not preserve catalog identity.");
  }
  if (gardenReadbackProof.objectKind !== "plant") {
    throw new Error(
      "BG official variety readback did not preserve plant object kind.",
    );
  }

  const output = {
    imported,
    idempotencyProof: {
      rerunCatalogItemId: rerun.catalogItemId,
      rerunSourceSnapshotId: rerun.sourceSnapshotId,
      rerunSourceRecordId: rerun.sourceRecordId,
      rerunBlockedSourceRecordId: rerun.blockedSourceRecordId,
    },
    bulgarianTypeaheadProof,
    latinTypeaheadProof,
    blockedTypeaheadProof,
    provenanceProof,
    blockedRecordProof,
    gardenReadbackProof,
    leakCheck: "passed",
  };
  assertNoForbiddenOutput(output);

  console.log(JSON.stringify(output, null, 2));
}

function assertRequiredAttributionProof(row: {
  attributionRequired: boolean;
  licenseUrl: string | null;
  attributionText: string | null;
}) {
  if (!row.attributionRequired) return;
  if (!row.licenseUrl || !row.attributionText) {
    throw new Error(
      "Attribution-required source provenance is missing license URL or attribution text.",
    );
  }
}

function assertAllowedProjectionProof(value: unknown) {
  const text = JSON.stringify(value);
  for (const marker of [
    "sourceDocument",
    "sourcePageReference",
    "sourceRowReference",
    "parserConfidence",
    "legalStatus",
    "attributionRequirement",
  ]) {
    if (!text.includes(marker)) {
      throw new Error(`BG official variety provenance is missing ${marker}.`);
    }
  }
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
