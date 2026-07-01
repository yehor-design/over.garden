import { createHash } from "node:crypto";
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
  buildCatalogFullImportDryRunReportWithLiveInventory,
  validateCatalogFullImportDryRunOptions,
  type CatalogFullImportDryRunSourceInventory,
} from "../src/lib/catalog/full-import-dry-run";
import {
  extractFormexXmlFilesFromZip,
  parseEuCommonCatalogueFormex,
  type EuCommonCatalogueParserResult,
} from "../src/lib/catalog/eu-common-catalogue-parser";
import {
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_LEGAL_VALUE_CAVEAT,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_NORMALIZATION_CAVEAT,
  euOfficialJournalCommonCatalogueDefinitionFromParserResults,
} from "../src/lib/catalog/eu-official-journal-common-catalogue";
import {
  importEuOfficialJournalCommonCatalogue,
  readEuOfficialJournalCommonCatalogueBlockedRecordProof,
  readEuOfficialJournalCommonCatalogueSourceProvenanceProof,
  readEuOfficialJournalCommonCatalogueTypeaheadProof,
} from "../src/server/catalog-source/eu-official-journal-common-catalogue-import";

const EU_OJ_COMMON_CATALOGUE_TARGET =
  "eu-official-journal-common-catalogue" as const;

const FORBIDDEN_OUTPUT_MARKERS = [
  "raw_payload",
  "rawPayload",
  "source_only_fields",
  "sourceOnlyFields",
  "sourceRecordKey",
  "source_record_key",
  "sourceRecordId",
  "source_record_id",
  "notifierCode",
  "notifier_code",
  "admissionAction",
  "admission_action",
  "artifactChecksumSha256",
  "artifact_checksum_sha256",
  "statusReasons",
  "status_reasons",
  "journalBody",
  "ownerUserId",
  "exifGps",
  "decimalLatitude",
  "decimalLongitude",
  "occurrenceCoordinates",
  "email",
  "token",
  "secret",
] as const;

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
  const generatedAt = new Date().toISOString();
  const options = validateCatalogFullImportDryRunOptions({
    environment: "local",
    confirmEnvironment: "local",
    targets: [EU_OJ_COMMON_CATALOGUE_TARGET],
  });
  const dryRunReport =
    await buildCatalogFullImportDryRunReportWithLiveInventory({
      options,
      generatedAt,
    });
  const target = dryRunReport.targets.find(
    (item) => item.key === EU_OJ_COMMON_CATALOGUE_TARGET,
  );
  const sourceInventory = target?.sourceInventory;
  if (!target || !sourceInventory?.parserQa) {
    throw new Error(
      "EU OJ Common Catalogue live parser QA did not pass far enough to import.",
    );
  }

  const parserResults = await buildLiveParserResults(sourceInventory);
  const definition =
    euOfficialJournalCommonCatalogueDefinitionFromParserResults({
      parserResults,
      fetchedAt: generatedAt,
      verifiedAt: generatedAt,
    });
  const imported = await importEuOfficialJournalCommonCatalogue(db, definition);
  const rerun = await importEuOfficialJournalCommonCatalogue(db, definition);

  if (
    rerun.projectedConcepts !== imported.projectedConcepts ||
    rerun.sourceRecordsImported !== imported.sourceRecordsImported ||
    rerun.sourceSnapshotsImported !== imported.sourceSnapshotsImported
  ) {
    throw new Error("Re-run import changed EU OJ import counts.");
  }
  if (
    rerun.sampleProjectedCatalogItemId !== imported.sampleProjectedCatalogItemId
  ) {
    throw new Error("Re-run import changed the sample projected catalog item.");
  }
  if (
    !imported.sampleProjectedCatalogItemId ||
    !imported.sampleProjectedCanonicalName
  ) {
    throw new Error("EU OJ import projected no accepted catalog concepts.");
  }

  const typeaheadProof =
    await readEuOfficialJournalCommonCatalogueTypeaheadProof(
      db,
      imported.sampleProjectedCanonicalName,
    );
  if (
    !typeaheadProof.some(
      (row) => row.catalogItemId === imported.sampleProjectedCatalogItemId,
    )
  ) {
    throw new Error("EU OJ sample accepted row is missing from typeahead.");
  }

  const provenanceProof =
    await readEuOfficialJournalCommonCatalogueSourceProvenanceProof(
      db,
      imported.sampleProjectedCatalogItemId,
    );
  if (!provenanceProof) {
    throw new Error("EU OJ sample accepted row is missing source provenance.");
  }
  assertRequiredAttributionProof(provenanceProof);
  assertAllowedProjectionProof(provenanceProof.allowedProjection);

  const blockedRecord = definition.snapshots
    .flatMap((snapshot) => snapshot.records)
    .find((record) => record.projectionStatus !== "projected");
  const blockedRecordProof = blockedRecord
    ? await readEuOfficialJournalCommonCatalogueBlockedRecordProof(
        db,
        blockedRecord.id,
      )
    : null;
  if (blockedRecord && blockedRecordProof?.projectionStatus === "projected") {
    throw new Error("EU OJ blocked parser row reached product projection.");
  }

  const output = {
    imported,
    idempotencyProof: {
      rerunProjectedConcepts: rerun.projectedConcepts,
      rerunSourceRecordsImported: rerun.sourceRecordsImported,
      rerunSampleProjectedCatalogItemId: rerun.sampleProjectedCatalogItemId,
    },
    dryRunCounts: target.counts,
    typeaheadProof,
    provenanceProof: {
      catalogItemId: provenanceProof.catalogItemId,
      canonicalName: provenanceProof.canonicalName,
      sourceName: provenanceProof.sourceName,
      sourceVersion: provenanceProof.sourceVersion,
      sourceUrl: provenanceProof.sourceUrl,
      license: provenanceProof.license,
      licenseUrl: provenanceProof.licenseUrl,
      attributionRequired: provenanceProof.attributionRequired,
      parserVersion: provenanceProof.parserVersion,
      projectionStatus: provenanceProof.projectionStatus,
      hasRequiredCaveats: true,
    },
    blockedRecordProof: blockedRecordProof
      ? {
          projectionStatus: blockedRecordProof.projectionStatus,
        }
      : null,
    leakCheck: "passed",
  };
  assertNoForbiddenOutput(output);

  console.log(JSON.stringify(output, null, 2));
}

async function buildLiveParserResults(
  sourceInventory: CatalogFullImportDryRunSourceInventory,
): Promise<EuCommonCatalogueParserResult[]> {
  const parserResults: EuCommonCatalogueParserResult[] = [];

  for (const candidate of sourceInventory.candidates) {
    if (candidate.reviewStatus !== "parser_qa_reported") continue;

    const formexArtifact = candidate.artifacts.find(
      (artifact) =>
        artifact.format === "formex_zip" &&
        artifact.fetchStatus === "fetched" &&
        artifact.url,
    );
    if (!formexArtifact?.url) continue;

    const formexZip = await fetchBufferArtifact(formexArtifact.url);
    if (
      formexArtifact.checksumSha256 &&
      formexArtifact.checksumSha256 !== formexZip.checksumSha256
    ) {
      throw new Error(
        `${candidate.label} Formex ZIP checksum changed between dry-run inventory and import.`,
      );
    }

    const formexXmlFiles = extractFormexXmlFilesFromZip(formexZip.buffer);
    const parserResult = parseEuCommonCatalogueFormex({
      supplementType: candidate.supplementType,
      supplementLabel: candidate.label,
      formexXmlFiles,
      sourceUrl: candidate.eurLexUrl,
      ojCitation: candidate.ojCitation,
      publicationDate: candidate.publicationDate,
      artifactChecksumSha256: formexZip.checksumSha256,
    });
    if (parserResult.totals.parsedRows > 0) {
      parserResults.push(parserResult);
    }
  }

  if (parserResults.length === 0) {
    throw new Error("No EU OJ Formex parser results were available to import.");
  }
  return parserResults;
}

async function fetchBufferArtifact(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    checksumSha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function assertRequiredAttributionProof(row: {
  attributionRequired: boolean;
  licenseUrl: string | null;
  attributionText: string | null;
}) {
  if (!row.attributionRequired) return;
  if (!row.licenseUrl || !row.attributionText) {
    throw new Error(
      "Attribution-required EU OJ provenance is missing license URL or attribution text.",
    );
  }
}

function assertAllowedProjectionProof(value: unknown) {
  const text = JSON.stringify(value);
  for (const marker of [
    EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION,
    EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_LEGAL_VALUE_CAVEAT,
    EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_NORMALIZATION_CAVEAT,
    "source-backed",
    "Official Journal",
  ]) {
    if (!text.includes(marker)) {
      throw new Error(`EU OJ provenance is missing ${marker}.`);
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
