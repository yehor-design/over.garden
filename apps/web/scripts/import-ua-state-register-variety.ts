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
  UA_STATE_REGISTER_SOURCE,
  UA_STATE_REGISTER_VARIETY_SOURCE_ROW,
  buildUaStateRegisterVarietyDefinition,
  decodeUaStateRegisterCsv,
  findUaStateRegisterVarietySourceRow,
  parseUaStateRegisterCsv,
} from "../src/lib/catalog/ua-state-register-variety";
import {
  importUaStateRegisterVariety,
  proveUaStateRegisterGardenReadback,
  readUaStateRegisterSourceProvenanceProof,
  readUaStateRegisterTypeaheadProof,
} from "../src/server/catalog-source/ua-state-register-import";

const FORBIDDEN_OUTPUT_MARKERS = [
  "raw_payload",
  "source_only_fields",
  "sourceOnlyFields",
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
  const rows = parseUaStateRegisterCsv(fileProof.text);
  const sourceRow = findUaStateRegisterVarietySourceRow(
    rows,
    UA_STATE_REGISTER_VARIETY_SOURCE_ROW.applicationNumber,
  );

  if (!sourceRow) {
    throw new Error("Expected UA State Register variety row was not found.");
  }

  const definition = buildUaStateRegisterVarietyDefinition(sourceRow, {
    sourceFile: "2025-07-15_registervarietis.csv",
    resourceEncoding: fileProof.encoding,
    byteLength: fileProof.byteLength,
    rowCount: rows.length,
    payloadSha256: fileProof.payloadSha256,
    fetchedAt: fileProof.fetchedAt,
    verifiedAt: fileProof.verifiedAt,
  });

  const imported = await importUaStateRegisterVariety(db, definition);
  const rerun = await importUaStateRegisterVariety(db, definition);
  const ukrainianTypeaheadProof = await readUaStateRegisterTypeaheadProof(
    db,
    imported.canonicalName,
  );
  const transliterationTypeaheadProof = imported.transliterationName
    ? await readUaStateRegisterTypeaheadProof(db, imported.transliterationName)
    : [];
  const provenanceProof = await readUaStateRegisterSourceProvenanceProof(
    db,
    imported.catalogItemId,
  );
  const gardenReadbackProof = await proveUaStateRegisterGardenReadback(
    db,
    imported.catalogItemId,
  );

  if (rerun.catalogItemId !== imported.catalogItemId) {
    throw new Error("Re-run import created a different catalog item.");
  }
  if (rerun.sourceRecordId !== imported.sourceRecordId) {
    throw new Error("Re-run import created a different source record.");
  }
  if (
    !ukrainianTypeaheadProof.some(
      (row) => row.catalogItemId === imported.catalogItemId,
    )
  ) {
    throw new Error("Imported official variety is missing by Ukrainian name.");
  }
  if (
    imported.transliterationName &&
    !transliterationTypeaheadProof.some(
      (row) => row.catalogItemId === imported.catalogItemId,
    )
  ) {
    throw new Error(
      "Imported official variety is missing by official transliteration.",
    );
  }
  if (!provenanceProof) {
    throw new Error(
      "Imported official variety is missing provenance readback.",
    );
  }
  if (provenanceProof.sourceRecordKey !== imported.sourceRecordKey) {
    throw new Error("Provenance readback source row key mismatch.");
  }
  assertRequiredAttributionProof(provenanceProof);
  if (gardenReadbackProof.catalogItemId !== imported.catalogItemId) {
    throw new Error("Garden readback proof did not preserve catalog identity.");
  }

  const output = {
    imported,
    idempotencyProof: {
      rerunCatalogItemId: rerun.catalogItemId,
      rerunSourceSnapshotId: rerun.sourceSnapshotId,
      rerunSourceRecordId: rerun.sourceRecordId,
    },
    sourceFileProof: {
      byteLength: fileProof.byteLength,
      rowCount: rows.length,
      payloadSha256: fileProof.payloadSha256,
      encoding: fileProof.encoding,
    },
    ukrainianTypeaheadProof,
    transliterationTypeaheadProof,
    provenanceProof,
    gardenReadbackProof,
    leakCheck: "passed",
  };
  assertNoForbiddenOutput(output);

  console.log(JSON.stringify(output, null, 2));
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
