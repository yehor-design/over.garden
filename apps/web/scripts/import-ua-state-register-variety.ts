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
  UA_STATE_REGISTER_FILE_PROOF,
  UA_STATE_REGISTER_FULL_IMPORT_PROOF,
  UA_STATE_REGISTER_SOURCE,
  UA_STATE_REGISTER_VARIETY_SOURCE_ROW,
  buildUaStateRegisterFullImportDefinitions,
  decodeUaStateRegisterCsv,
  findUaStateRegisterVarietySourceRow,
  parseUaStateRegisterCsv,
  uaStateRegisterAllowedProjection,
  type UaStateRegisterVarietyImportDefinition,
} from "../src/lib/catalog/ua-state-register-variety";
import {
  importUaStateRegisterVarieties,
  proveUaStateRegisterGardenReadback,
  readUaStateRegisterSourceProvenanceProof,
  readUaStateRegisterTypeaheadProof,
  type UaStateRegisterImportSummary,
} from "../src/server/catalog-source/ua-state-register-import";

const FORBIDDEN_OUTPUT_MARKERS = [
  "sourceSnapshotId",
  "source_snapshot_id",
  "sourceRecordId",
  "source_record_id",
  "sourceRecordKey",
  "source_record_key",
  "rawPayloadSha256",
  "raw_payload_sha256",
  "sourceFileSha256",
  "source_file_sha256",
  "payloadSha256",
  "payload_sha256",
  "sourceFileRowCount",
  "source_file_row_count",
  "raw_payload",
  "source_only_fields",
  "rawPayload",
  "sourceOnlyFields",
  "allowedProjection",
  "allowed_projection",
  "varietyDescription",
  "varietyDescriptionExternal",
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
  const fileProof = await fetchUaStateRegisterFileProof();
  assertApprovedFileProof(fileProof);

  const rows = parseUaStateRegisterCsv(fileProof.text);
  const fullImport = buildUaStateRegisterFullImportDefinitions(rows, {
    sourceFile: "2025-07-15_registervarietis.csv",
    resourceEncoding: fileProof.encoding,
    byteLength: fileProof.byteLength,
    rowCount: rows.length,
    payloadSha256: fileProof.payloadSha256,
    fetchedAt: fileProof.fetchedAt,
    verifiedAt: fileProof.verifiedAt,
  });
  assertExpectedFullImportAudit(fullImport.audit);

  const proofSourceRow = findUaStateRegisterVarietySourceRow(
    rows,
    UA_STATE_REGISTER_VARIETY_SOURCE_ROW.applicationNumber,
  );

  if (!proofSourceRow) {
    throw new Error("Expected UA State Register variety row was not found.");
  }

  const imported = await importUaStateRegisterVarieties(db, fullImport);
  const rerun = await importUaStateRegisterVarieties(db, fullImport);
  const importedByRecordId = indexImportedByRecordId(imported.varieties);
  const rerunByRecordId = indexImportedByRecordId(rerun.varieties);
  const representativeDefinitions = selectRepresentativeDefinitions(
    fullImport.definitions,
  );
  const primaryDefinition = fullImport.definitions.find(
    (definition) =>
      definition.record.id ===
      `RegisterVarietis:${UA_STATE_REGISTER_VARIETY_SOURCE_ROW.applicationNumber}`,
  );

  if (!primaryDefinition) {
    throw new Error(
      "Expected UA State Register primary proof definition was not built.",
    );
  }

  if (rerun.importedVarieties !== imported.importedVarieties) {
    throw new Error("Re-run import changed the imported variety count.");
  }
  if (rerun.sourceRowsImported !== imported.sourceRowsImported) {
    throw new Error("Re-run import changed the imported source row count.");
  }

  const typeaheadProof = [];
  const provenanceProof = [];
  const gardenReadbackProof = [];

  for (const definition of representativeDefinitions) {
    const summary = requiredImportedSummary(importedByRecordId, definition);
    const rerunSummary = requiredImportedSummary(rerunByRecordId, definition);

    if (rerunSummary.catalogItemId !== summary.catalogItemId) {
      throw new Error(
        `${definition.projection.canonicalName} re-run created a different catalog item.`,
      );
    }

    for (const query of representativeProjectedQueries(definition)) {
      const rows = await readUaStateRegisterTypeaheadProof(db, query);
      const matchingRows = rows.filter(
        (row) => row.catalogItemId === summary.catalogItemId,
      );

      if (matchingRows.length === 0) {
        throw new Error(
          `${definition.projection.canonicalName} is missing from typeahead for query "${query}".`,
        );
      }

      typeaheadProof.push({
        query,
        matchedDisplays: matchingRows.map((row) => row.displayName),
        canonicalName: summary.canonicalName,
        catalogKind: summary.catalogKind,
      });
    }

    const provenance = await readUaStateRegisterSourceProvenanceProof(
      db,
      summary.catalogItemId,
    );
    if (!provenance) {
      throw new Error(
        `${definition.projection.canonicalName} is missing provenance readback.`,
      );
    }
    assertRequiredAttributionProof(provenance);
    provenanceProof.push({
      canonicalName: summary.canonicalName,
      sourceName: provenance.sourceName,
      sourceVersion: provenance.sourceVersion,
      license: provenance.license,
      attributionRequired: provenance.attributionRequired,
      attributionCreditsPresent: Boolean(
        !provenance.attributionRequired ||
        (provenance.licenseUrl && provenance.attributionText),
      ),
      projectionStatus: provenance.projectionStatus,
    });

    const gardenReadback = await proveUaStateRegisterGardenReadback(
      db,
      summary.catalogItemId,
      uaStateRegisterAllowedProjection(definition),
    );

    if (gardenReadback.catalogItemId !== summary.catalogItemId) {
      throw new Error(
        `${definition.projection.canonicalName} garden readback did not preserve catalog identity.`,
      );
    }

    gardenReadbackProof.push({
      canonicalName: gardenReadback.catalogCanonicalName,
      varietyState: gardenReadback.varietyState,
      catalogSource: gardenReadback.catalogSource,
    });
  }

  const primaryImported = requiredImportedSummary(
    importedByRecordId,
    primaryDefinition,
  );
  const primaryRerun = requiredImportedSummary(
    rerunByRecordId,
    primaryDefinition,
  );

  const output = {
    imported: {
      catalogItemId: primaryImported.catalogItemId,
      catalogKind: primaryImported.catalogKind,
      canonicalName: primaryImported.canonicalName,
      publicSlug: primaryImported.publicSlug,
      sourceSlug: primaryImported.sourceSlug,
      sourceVersion: primaryImported.sourceVersion,
      aliasesProjected: primaryImported.aliasesProjected,
      importedVarieties: imported.importedVarieties,
      sourceRowsImported: imported.sourceRowsImported,
      reindexQueued: imported.reindexQueued,
    },
    idempotencyProof: {
      rerunCatalogItemId: primaryRerun.catalogItemId,
      rerunImportedVarieties: rerun.importedVarieties,
      stableProductIdentityOnRerun: true,
      stableImportedVarietyCount: true,
    },
    sourceFileProof: {
      byteLength: fileProof.byteLength,
      rowCount: rows.length,
      encoding: fileProof.encoding,
    },
    auditCounts: imported.audit,
    typeaheadProof,
    provenanceProof,
    gardenReadbackProof,
    leakCheck: "passed",
  };
  assertNoForbiddenOutput(output);

  console.log(JSON.stringify(output, null, 2));
}

function assertApprovedFileProof(fileProof: {
  byteLength: number;
  rowCount?: number;
  payloadSha256: string;
  encoding: string;
}) {
  if (fileProof.byteLength !== UA_STATE_REGISTER_FILE_PROOF.byteLength) {
    throw new Error(
      "UA State Register source byte length drifted from the approved file proof.",
    );
  }
  if (fileProof.rowCount !== UA_STATE_REGISTER_FILE_PROOF.rowCount) {
    throw new Error(
      "UA State Register source row count drifted from the approved file proof.",
    );
  }
  if (fileProof.payloadSha256 !== UA_STATE_REGISTER_FILE_PROOF.payloadSha256) {
    throw new Error(
      "UA State Register source checksum drifted from the approved file proof.",
    );
  }
  if (fileProof.encoding !== UA_STATE_REGISTER_FILE_PROOF.resourceEncoding) {
    throw new Error(
      "UA State Register source encoding drifted from the approved file proof.",
    );
  }
}

function assertExpectedFullImportAudit(
  audit: ReturnType<typeof buildUaStateRegisterFullImportDefinitions>["audit"],
) {
  const expected = UA_STATE_REGISTER_FULL_IMPORT_PROOF;
  if (audit.sourceRowsRead !== expected.sourceRowsRead) {
    throw new Error(
      `UA State Register row count mismatch: ${audit.sourceRowsRead}.`,
    );
  }
  if (audit.productConceptsProjected !== expected.productConceptsProjected) {
    throw new Error(
      `UA State Register projected concept count mismatch: ${audit.productConceptsProjected}.`,
    );
  }
  if (audit.aliasesProjected !== expected.aliasesProjected) {
    throw new Error(
      `UA State Register projected alias count mismatch: ${audit.aliasesProjected}.`,
    );
  }
  if (audit.rejectedRows !== expected.rejectedRows) {
    throw new Error(
      `UA State Register parser reject count mismatch: ${audit.rejectedRows}.`,
    );
  }
}

function selectRepresentativeDefinitions(
  definitions: UaStateRegisterVarietyImportDefinition[],
) {
  const byApplicationNumber = new Map(
    definitions.map((definition) => [
      definition.record.id.replace("RegisterVarietis:", ""),
      definition,
    ]),
  );

  return UA_STATE_REGISTER_FULL_IMPORT_PROOF.representativeSampleApplicationNumbers.map(
    (applicationNumber) => {
      const definition = byApplicationNumber.get(applicationNumber);
      if (!definition) {
        throw new Error(
          `Missing representative UA State Register sample ${applicationNumber}.`,
        );
      }
      return definition;
    },
  );
}

function representativeProjectedQueries(
  definition: UaStateRegisterVarietyImportDefinition,
) {
  const transliteration = definition.projection.aliases.find(
    (alias) =>
      alias.displayName !== definition.projection.canonicalName &&
      /^[A-Za-z0-9`' -]+$/.test(alias.displayName),
  )?.displayName;
  const primaryQueries = [
    definition.projection.canonicalName,
    transliteration,
  ].filter((query): query is string => Boolean(query));

  return [...new Set(primaryQueries)];
}

function indexImportedByRecordId(summaries: UaStateRegisterImportSummary[]) {
  return new Map(
    summaries.map((summary) => [summary.sourceRecordKey, summary]),
  );
}

function requiredImportedSummary(
  summaries: ReadonlyMap<string, UaStateRegisterImportSummary>,
  definition: UaStateRegisterVarietyImportDefinition,
) {
  const summary = summaries.get(definition.record.id);
  if (!summary) {
    throw new Error(
      `${definition.projection.canonicalName} is missing from import summary.`,
    );
  }
  return summary;
}

async function fetchUaStateRegisterFileProof() {
  const fetchedAt = new Date().toISOString();
  const response = await fetch(UA_STATE_REGISTER_SOURCE.url, {
    headers: {
      "user-agent": "Mozilla/5.0 OverGarden source verification",
    },
  });

  if (!response.ok) {
    throw new Error(
      `UA State Register file download failed with HTTP ${response.status}.`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const decoded = decodeUaStateRegisterCsv(buffer);

  return {
    text: decoded.text,
    encoding: decoded.encoding,
    byteLength: buffer.byteLength,
    rowCount: parseUaStateRegisterCsv(decoded.text).length,
    payloadSha256: sha256Hex(buffer),
    fetchedAt,
    verifiedAt: new Date().toISOString(),
  };
}

function assertNoForbiddenOutput(output: unknown) {
  const text = JSON.stringify(output);
  for (const marker of FORBIDDEN_OUTPUT_MARKERS) {
    if (text.includes(marker)) {
      throw new Error(`Unsafe source-only marker reached output: ${marker}`);
    }
  }
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

function sha256Hex(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

main()
  .finally(async () => {
    await db.destroy();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
