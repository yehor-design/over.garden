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
  genebankLongTailDefinition,
  genebankLongTailProjectionForRecord,
} from "../src/lib/catalog/genebank-long-tail";
import {
  buildGenebankProofHarnessIsolation,
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
  "germplasmDistributionPolicy",
  "distributionPolicyCaveat",
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
const requireCleanState = process.argv.includes("--require-clean-state");

async function main() {
  const definition = genebankLongTailDefinition();
  const imported = await importGenebankLongTailCandidates(db, definition);
  const candidateQueueBeforePromotion = await readGenebankCandidateQueue(db);
  const typeaheadBeforePromotion = await readGenebankTypeaheadProof(
    db,
    "Red Cherry",
  );
  const proofHarnessIsolation = buildGenebankProofHarnessIsolation({
    imported,
    candidateQueueBeforePromotion,
    typeaheadBeforePromotion,
    requireCleanState,
  });

  const promotedCandidates = [];
  const promotedAgainCandidates = [];
  for (const sourceRecordKey of definition.promotableRecordKeys) {
    promotedCandidates.push(
      await promoteGenebankLongTailCandidate(db, sourceRecordKey, definition),
    );
    promotedAgainCandidates.push(
      await promoteGenebankLongTailCandidate(db, sourceRecordKey, definition),
    );
  }
  const promoted = promotedCandidates[0];
  const promotedAgain = promotedAgainCandidates[0];
  if (!promoted || !promotedAgain) {
    throw new Error("No promoted genebank candidates were produced.");
  }

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
  const promotedTypeaheadProof =
    await readPromotedTypeaheadProof(promotedCandidates);
  const nonPromotedAbsenceProof = await readNonPromotedAbsenceProof();
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
  for (const promotedCandidate of promotedCandidates) {
    const promotedAgainCandidate = promotedAgainCandidates.find(
      (candidate) =>
        candidate.sourceRecordKey === promotedCandidate.sourceRecordKey,
    );
    if (
      promotedAgainCandidate?.catalogItemId !== promotedCandidate.catalogItemId
    ) {
      throw new Error(
        `Re-running promotion created a new catalog item for ${promotedCandidate.sourceRecordKey}.`,
      );
    }
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
  for (const record of rerunImport.promotableRecords) {
    if (record.projectionStatus !== "projected") {
      throw new Error(
        `Re-running import demoted promoted source record ${record.sourceRecordKey}.`,
      );
    }
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
  for (const proof of nonPromotedAbsenceProof) {
    if (proof.suggestionCount > 0) {
      throw new Error(
        `Non-promoted genebank candidate ${proof.query} reached typeahead.`,
      );
    }
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
    candidateQueueAfterPromotion.some((row) =>
      definition.promotableRecordKeys.includes(row.sourceRecordKey),
    )
  ) {
    throw new Error("Promoted genebank candidates stayed in review queue.");
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
    imported: {
      sourceSnapshotId: imported.sourceSnapshotId,
      sourceRowsImported: imported.sourceRowsImported,
      rawRowsCaptured: imported.rawRowsCaptured,
      promotableRecordKeys: imported.promotableRecords.map(
        (record) => record.sourceRecordKey,
      ),
      heldRecordKeys: imported.heldRecords.map(
        (record) => record.sourceRecordKey,
      ),
      reviewNeededRecordKeys: imported.reviewNeededRecordKeys,
      rejectedRecordKeys: imported.rejectedRecordKeys,
      blockedRecordKeys: imported.blockedRecordKeys,
      sourceSlug: imported.sourceSlug,
      sourceVersion: imported.sourceVersion,
      parserVersion: imported.parserVersion,
    },
    proofHarnessIsolation: summarizeProofHarnessIsolation(
      proofHarnessIsolation,
    ),
    promoted: promotedCandidates,
    idempotencyProof: {
      promotedAgainCatalogItemId: promotedAgain.catalogItemId,
      promotedAgainCatalogItemIds: promotedAgainCandidates.map((candidate) => ({
        sourceRecordKey: candidate.sourceRecordKey,
        catalogItemId: candidate.catalogItemId,
      })),
      rerunSourceSnapshotId: rerunImport.sourceSnapshotId,
      rerunPromotableSourceRecordId: rerunImport.promotableSourceRecordId,
      rerunHeldSourceRecordId: rerunImport.heldSourceRecordId,
      rerunPromotableProjectionStatus: rerunImport.promotableProjectionStatus,
      rerunPromotableProjectionStatuses: rerunImport.promotableRecords.map(
        (record) => ({
          sourceRecordKey: record.sourceRecordKey,
          projectionStatus: record.projectionStatus,
        }),
      ),
    },
    promotionVisibilityProof: {
      typeaheadByCandidateName,
      typeaheadBySpeciesAlias,
      heldTypeaheadProof,
      promotedTypeaheadProof,
      nonPromotedAbsenceProof,
    },
    candidateQueueAfterPromotion: summarizeCandidateQueue(
      candidateQueueAfterPromotion,
    ),
    provenanceProof: {
      catalogItemId: provenanceProof.catalogItemId,
      canonicalName: provenanceProof.canonicalName,
      catalogKind: provenanceProof.catalogKind,
      status: provenanceProof.status,
      source: provenanceProof.source,
      sourceSlug: provenanceProof.sourceSlug,
      sourceVersion: provenanceProof.sourceVersion,
      sourceRecordKey: provenanceProof.sourceRecordKey,
      parserVersion: provenanceProof.parserVersion,
      projectionStatus: provenanceProof.projectionStatus,
    },
    gardenReadbackProof,
    leakCheck: "passed",
  };
  assertNoForbiddenOutput(output);

  console.log(JSON.stringify(output, null, 2));
}

async function readPromotedTypeaheadProof(
  promotedCandidates: Array<{ sourceRecordKey: string; catalogItemId: string }>,
) {
  const proof = [];
  for (const candidate of promotedCandidates) {
    const projection = genebankLongTailProjectionForRecord(
      candidate.sourceRecordKey,
    );
    const query =
      projection.aliases[0]?.displayName ?? projection.canonicalName;
    const typeahead = await readGenebankTypeaheadProof(db, query);
    const matchingRows = typeahead.filter(
      (row) => row.catalogItemId === candidate.catalogItemId,
    );
    if (matchingRows.length === 0) {
      throw new Error(
        `Promoted genebank candidate ${candidate.sourceRecordKey} is missing from typeahead.`,
      );
    }

    proof.push({
      sourceRecordKey: candidate.sourceRecordKey,
      query,
      catalogItemId: candidate.catalogItemId,
      canonicalName: projection.canonicalName,
      suggestionCount: typeahead.length,
      matchingDisplayNames: matchingRows.map((row) => row.displayName),
    });
  }
  return proof;
}

async function readNonPromotedAbsenceProof() {
  const queries = [
    { query: "Unreviewed NPGS landrace proof row", reason: "held" },
    { query: "Balkan dry bean proof row", reason: "held" },
    { query: "Kyiv Long cucumber proof row", reason: "review_needed" },
    { query: "Chernozem melon proof row", reason: "review_needed" },
    { query: "Red Cherry duplicate proof row", reason: "rejected" },
    { query: "Ambiguous Capsicum proof row", reason: "rejected" },
    { query: "Restricted-field proof row", reason: "blocked" },
    { query: "Policy-caveat proof row", reason: "blocked" },
    { query: "External-terms proof row", reason: "blocked" },
  ];

  const proof = [];
  for (const item of queries) {
    const typeahead = await readGenebankTypeaheadProof(db, item.query);
    proof.push({
      ...item,
      suggestionCount: typeahead.length,
    });
  }
  return proof;
}

function summarizeCandidateQueue(
  queue: Awaited<ReturnType<typeof readGenebankCandidateQueue>>,
) {
  return {
    rows: queue.length,
    sourceRecordKeys: queue.map((row) => row.sourceRecordKey),
  };
}

function summarizeProofHarnessIsolation(
  proof: ReturnType<typeof buildGenebankProofHarnessIsolation>,
) {
  if (proof.cleanStateProof.status === "passed") {
    return {
      cleanStateProof: {
        status: "passed",
        candidateQueueBeforePromotionRows:
          proof.cleanStateProof.candidateQueueBeforePromotion.length,
        cleanStateTypeaheadBeforePromotionRows:
          proof.cleanStateProof.cleanStateTypeaheadBeforePromotion.length,
      },
      rerunExistingProjection: null,
    };
  }

  return {
    cleanStateProof: proof.cleanStateProof,
    rerunExistingProjection: proof.rerunExistingProjection
      ? {
          status: proof.rerunExistingProjection.status,
          promotableProjectionStatus:
            proof.rerunExistingProjection.promotableProjectionStatus,
          existingTypeaheadBeforeThisRunRows:
            proof.rerunExistingProjection.existingTypeaheadBeforeThisRun.length,
        }
      : null,
  };
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
