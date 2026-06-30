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
import { genebankLongTailDefinition } from "../src/lib/catalog/genebank-long-tail";
import {
  importGenebankLongTailCandidates,
  promoteGenebankLongTailCandidate,
  proveGenebankGardenReadback,
  readGenebankCandidateQueue,
  readGenebankSourceProvenanceProof,
  readGenebankTypeaheadProof,
} from "../src/server/catalog-source/genebank-long-tail-import";

const FORBIDDEN_OUTPUT_MARKERS = [
  "raw_payload",
  "source_only_fields",
  "sourceOnlyFields",
  "liveProof",
  "accessionIdentifier",
  "accessionRecordUrl",
  "genesysEuriscoBlocker",
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
  const definition = genebankLongTailDefinition();
  const imported = await importGenebankLongTailCandidates(db, definition);
  const candidateQueueBeforePromotion = await readGenebankCandidateQueue(db);
  const typeaheadBeforePromotion = await readGenebankTypeaheadProof(
    db,
    "Red Cherry",
  );

  if (
    !candidateQueueBeforePromotion.some(
      (row) => row.sourceRecordKey === imported.promotableRecordKey,
    ) &&
    imported.promotableProjectionStatus !== "projected"
  ) {
    throw new Error(
      "Promotable genebank candidate is missing from review queue.",
    );
  }
  if (
    typeaheadBeforePromotion.some(
      (row) => row.source === "grin_genebank_candidate",
    ) &&
    imported.promotableProjectionStatus !== "projected"
  ) {
    throw new Error("Genebank candidate reached typeahead before promotion.");
  }

  const promoted = await promoteGenebankLongTailCandidate(
    db,
    imported.promotableRecordKey,
    definition,
  );
  const promotedAgain = await promoteGenebankLongTailCandidate(
    db,
    imported.promotableRecordKey,
    definition,
  );
  const rerunImport = await importGenebankLongTailCandidates(db, definition);
  const typeaheadByCandidateName = await readGenebankTypeaheadProof(
    db,
    "Red Cherry",
  );
  const typeaheadBySpeciesAlias = await readGenebankTypeaheadProof(
    db,
    "Solanum lycopersicum Red Cherry",
  );
  const heldTypeaheadProof = await readGenebankTypeaheadProof(
    db,
    "Unreviewed NPGS landrace",
  );
  const provenanceProof = await readGenebankSourceProvenanceProof(
    db,
    promoted.catalogItemId,
  );
  const candidateQueueAfterPromotion = await readGenebankCandidateQueue(db);
  const gardenReadbackProof = await proveGenebankGardenReadback(
    db,
    promoted.catalogItemId,
  );

  if (promotedAgain.catalogItemId !== promoted.catalogItemId) {
    throw new Error(
      "Re-running candidate promotion created a new catalog item.",
    );
  }
  if (
    rerunImport.promotableSourceRecordId !== imported.promotableSourceRecordId
  ) {
    throw new Error(
      "Re-running import created a new promotable source record.",
    );
  }
  if (rerunImport.heldSourceRecordId !== imported.heldSourceRecordId) {
    throw new Error("Re-running import created a new held source record.");
  }
  if (rerunImport.promotableProjectionStatus !== "projected") {
    throw new Error("Re-running import demoted the promoted source record.");
  }
  if (
    !typeaheadByCandidateName.some(
      (row) => row.catalogItemId === promoted.catalogItemId,
    )
  ) {
    throw new Error(
      "Promoted genebank candidate is missing by candidate name.",
    );
  }
  if (
    !typeaheadBySpeciesAlias.some(
      (row) => row.catalogItemId === promoted.catalogItemId,
    )
  ) {
    throw new Error("Promoted genebank candidate is missing by species alias.");
  }
  if (heldTypeaheadProof.length > 0) {
    throw new Error("Held genebank candidate reached typeahead.");
  }
  if (!provenanceProof) {
    throw new Error(
      "Promoted genebank candidate is missing provenance readback.",
    );
  }
  if (provenanceProof.sourceRecordKey !== promoted.sourceRecordKey) {
    throw new Error("Provenance readback source row key mismatch.");
  }
  assertAllowedUsage(provenanceProof.allowedUsage);
  assertAllowedProjectionProof(provenanceProof.allowedProjection);
  if (
    candidateQueueAfterPromotion.some(
      (row) => row.sourceRecordKey === imported.promotableRecordKey,
    )
  ) {
    throw new Error("Promoted genebank candidate stayed in review queue.");
  }
  if (
    !candidateQueueAfterPromotion.some(
      (row) => row.sourceRecordKey === imported.heldRecordKey,
    )
  ) {
    throw new Error("Held genebank candidate disappeared from review queue.");
  }
  if (gardenReadbackProof.catalogItemId !== promoted.catalogItemId) {
    throw new Error(
      "Garden readback did not preserve promoted catalog identity.",
    );
  }
  if (gardenReadbackProof.objectKind !== "plant") {
    throw new Error("Genebank readback did not preserve plant object kind.");
  }
  if (gardenReadbackProof.catalogSource !== "grin_genebank_candidate") {
    throw new Error("Genebank readback did not preserve catalog source.");
  }

  const output = {
    imported,
    promoted,
    idempotencyProof: {
      promotedAgainCatalogItemId: promotedAgain.catalogItemId,
      rerunSourceSnapshotId: rerunImport.sourceSnapshotId,
      rerunPromotableSourceRecordId: rerunImport.promotableSourceRecordId,
      rerunHeldSourceRecordId: rerunImport.heldSourceRecordId,
      rerunPromotableProjectionStatus: rerunImport.promotableProjectionStatus,
    },
    candidateQueueBeforePromotion,
    typeaheadBeforePromotion,
    typeaheadByCandidateName,
    typeaheadBySpeciesAlias,
    heldTypeaheadProof,
    candidateQueueAfterPromotion,
    provenanceProof,
    gardenReadbackProof,
    leakCheck: "passed",
  };
  assertNoForbiddenOutput(output);

  console.log(JSON.stringify(output, null, 2));
}

function assertAllowedUsage(value: unknown) {
  const text = JSON.stringify(value);
  for (const marker of ["review_queue", "curator_promotion"]) {
    if (!text.includes(marker)) {
      throw new Error(`GRIN source allowed usage is missing ${marker}.`);
    }
  }
}

function assertAllowedProjectionProof(value: unknown) {
  const text = JSON.stringify(value);
  for (const marker of [
    "candidateKind",
    "reviewStatus",
    "legalStatus",
    "curatorDecision",
    "germplasmDistributionPolicy",
    "sourceRowReference",
  ]) {
    if (!text.includes(marker)) {
      throw new Error(`Genebank provenance is missing ${marker}.`);
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
