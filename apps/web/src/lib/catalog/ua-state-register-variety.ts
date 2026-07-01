import { createHash } from "node:crypto";

import type { JsonValue } from "@/db/schema";

export const UA_STATE_REGISTER_VARIETY_PARSER_VERSION =
  "ove-57.ua-state-register.variety.v1";

export const UA_STATE_REGISTER_SOURCE = {
  slug: "ua-state-register",
  name: "Ukraine State Register of Plant Varieties",
  category: "official_varieties",
  version: "2025-07-15",
  url: "https://data.gov.ua/dataset/eabd0bd2-2dc6-47e2-b748-9bd254da4956/resource/32ea0f72-86e4-490d-9ab9-4d64976187c6/download/2025-07-15_registervarietis.csv",
  license: "Creative Commons Attribution 4.0 International",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attributionRequired: true,
  attributionText:
    "Ukraine State Register of Plant Varieties, Creative Commons Attribution 4.0 International.",
  allowedUsage: ["raw_snapshot", "canonical_product_projection"],
} as const;

export const UA_STATE_REGISTER_VARIETY_SOURCE_ROW = {
  taxonGroupName: "Плодові та ягідні",
  taxonGroupNameEn: "Fruit and Berry",
  taxonName: "Абрикос звичайний",
  taxonNameLat: "Prunus armeniaca L.",
  taxonNameEn: "Apricot",
  applicationNumber: "83070006",
  dateApplication: "1983-01-01",
  varietyName: "Ботсадівський",
  varietyNameLan: "Ботсадівський",
  varietyNameTRL: "Botsadivs`kyi",
  startDateRegistration: "2001",
  numberСertificate: "NULL",
  plantPatent: "NULL",
  creationMethod: "NULL",
  proposedZone: "СЛ",
  directionUse: "ун",
  groupRipeness: "ср",
  quality: "NULL",
  varietyDescription: "NULL",
  varietyDescriptionExternal: "NULL",
  publicDomain: "False",
  сountryCode: "NULL",
  сountryCodeApplicant: "UA",
} as const;

export const UA_STATE_REGISTER_FILE_PROOF = {
  sourceFile: "2025-07-15_registervarietis.csv",
  resourceEncoding: "UTF-16LE",
  byteLength: 65353676,
  rowCount: 15177,
  payloadSha256:
    "7d379da3bc3ad3b1e4b009ba1b9230cb841cce6043ee82be82dff9318a441eeb",
  fetchedAt: "2026-06-29T00:00:00.000Z",
  verifiedAt: "2026-06-29T00:00:00.000Z",
} as const;

export const UA_STATE_REGISTER_FULL_IMPORT_PROOF = {
  sourceRowsRead: 15177,
  rawRowsCaptured: 15177,
  productConceptsProjected: 15177,
  aliasesProjected: 61105,
  reviewNeededRows: 0,
  rejectedRows: 0,
  duplicateCanonicalNameClusters: 759,
  representativeSampleApplicationNumbers: [
    "83070006",
    "15989001",
    "18088018",
    "19039087",
  ],
} as const;

export interface UaStateRegisterSourceFileProof {
  sourceFile: string;
  resourceEncoding: string;
  byteLength: number;
  rowCount: number;
  payloadSha256: string;
  fetchedAt: string;
  verifiedAt: string;
}

export type UaStateRegisterSourceRow = Record<string, string>;

const MAX_PRODUCT_CATALOG_NAME_LENGTH = 120;

export interface UaStateRegisterVarietyProjection {
  canonicalName: string;
  normalizedName: string;
  publicSlug: string;
  status: "seeded";
  source: "ua_state_register";
  sourceId: string;
  catalogKind: "plant_variety";
  locale: "uk";
  aliases: Array<{
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  }>;
}

export interface UaStateRegisterVarietyImportDefinition {
  source: typeof UA_STATE_REGISTER_SOURCE;
  fileProof: UaStateRegisterSourceFileProof;
  record: {
    id: string;
    rawPayload: JsonValue;
    sourceOnlyFields: JsonValue;
  };
  projection: UaStateRegisterVarietyProjection;
}

export interface UaStateRegisterFullImportBuildResult {
  definitions: UaStateRegisterVarietyImportDefinition[];
  audit: {
    sourceRowsRead: number;
    rawRowsCaptured: number;
    productConceptsProjected: number;
    aliasesProjected: number;
    reviewNeededRows: number;
    rejectedRows: number;
    duplicateCanonicalNameClusters: number;
  };
}

export function uaStateRegisterFixtureDefinition() {
  return buildUaStateRegisterVarietyDefinition(
    UA_STATE_REGISTER_VARIETY_SOURCE_ROW,
    UA_STATE_REGISTER_FILE_PROOF,
  );
}

export function buildUaStateRegisterVarietyDefinition(
  sourceRow: UaStateRegisterSourceRow,
  fileProof: UaStateRegisterSourceFileProof,
): UaStateRegisterVarietyImportDefinition {
  const normalizedRow = normalizeUaStateRegisterSourceRow(sourceRow);
  const sourceRecordId = `RegisterVarietis:${normalizedRow.applicationNumber}`;
  const projection = buildUaStateRegisterProjection(normalizedRow);

  return {
    source: UA_STATE_REGISTER_SOURCE,
    fileProof,
    record: {
      id: sourceRecordId,
      rawPayload: jsonValue({
        sourceFile: fileProof.sourceFile,
        resourceEncoding: fileProof.resourceEncoding,
        sourceFileSha256: fileProof.payloadSha256,
        sourceFileRowCount: fileProof.rowCount,
        sourceFileByteLength: fileProof.byteLength,
        row: sourceRow,
        normalizedRow,
      }),
      sourceOnlyFields: jsonValue({
        nonProjectedRegisterFields: {
          dateApplication: normalizedRow.dateApplication,
          numberCertificate: normalizedRow.numberCertificate,
          plantPatent: normalizedRow.plantPatent,
          creationMethod: normalizedRow.creationMethod,
          proposedZone: normalizedRow.proposedZone,
          directionUse: normalizedRow.directionUse,
          groupRipeness: normalizedRow.groupRipeness,
          quality: normalizedRow.quality,
          varietyDescription: normalizedRow.varietyDescription,
          varietyDescriptionExternal: normalizedRow.varietyDescriptionExternal,
          publicDomain: normalizedRow.publicDomain,
          countryCode: normalizedRow.countryCode,
          countryCodeApplicant: normalizedRow.countryCodeApplicant,
        },
        relatedResources: {
          ownersImported: false,
          maintainersImported: false,
          reason:
            "OVE-57 first official-variety path does not need owner or maintainer projection.",
        },
      }),
    },
    projection,
  };
}

export function buildUaStateRegisterFullImportDefinitions(
  sourceRows: UaStateRegisterSourceRow[],
  fileProof: UaStateRegisterSourceFileProof,
): UaStateRegisterFullImportBuildResult {
  const definitions: UaStateRegisterVarietyImportDefinition[] = [];
  const duplicateCanonicalNames = new Map<string, number>();
  let rejectedRows = 0;

  for (const sourceRow of sourceRows) {
    try {
      const definition = buildUaStateRegisterVarietyDefinition(
        sourceRow,
        fileProof,
      );
      definitions.push(definition);
      const canonicalName = definition.projection.normalizedName;
      duplicateCanonicalNames.set(
        canonicalName,
        (duplicateCanonicalNames.get(canonicalName) ?? 0) + 1,
      );
    } catch {
      rejectedRows += 1;
    }
  }

  return {
    definitions,
    audit: {
      sourceRowsRead: sourceRows.length,
      rawRowsCaptured: definitions.length,
      productConceptsProjected: definitions.length,
      aliasesProjected: definitions.reduce(
        (total, definition) => total + definition.projection.aliases.length,
        0,
      ),
      reviewNeededRows: 0,
      rejectedRows,
      duplicateCanonicalNameClusters: [
        ...duplicateCanonicalNames.values(),
      ].filter((count) => count > 1).length,
    },
  };
}

export function decodeUaStateRegisterCsv(bytes: Uint8Array) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      text: Buffer.from(bytes)
        .toString("utf16le")
        .replace(/^\uFEFF/, ""),
      encoding: "UTF-16LE",
    };
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return {
      text: Buffer.from(bytes)
        .toString("utf8")
        .replace(/^\uFEFF/, ""),
      encoding: "UTF-8",
    };
  }

  return {
    text: Buffer.from(bytes)
      .toString("utf8")
      .replace(/^\uFEFF/, ""),
    encoding: "UTF-8",
  };
}

export function parseUaStateRegisterCsv(
  text: string,
): UaStateRegisterSourceRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((cell) => cell.replace(/^\uFEFF/, "").trim());

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) =>
      Object.fromEntries(
        header.map((field, index) => [field, row[index]?.trim() ?? ""]),
      ),
    );
}

export function findUaStateRegisterVarietySourceRow(
  rows: UaStateRegisterSourceRow[],
  applicationNumber: string,
) {
  return (
    rows.find((row) => row.applicationNumber === applicationNumber) ?? null
  );
}

export function uaStateRegisterSnapshotChecksum(
  definition = uaStateRegisterFixtureDefinition(),
) {
  return definition.fileProof.payloadSha256;
}

export function uaStateRegisterPayloadChecksum(
  definition = uaStateRegisterFixtureDefinition(),
) {
  return sha256Hex(stableJsonStringify(definition.record.rawPayload));
}

export function uaStateRegisterAllowedProjection(
  definition = uaStateRegisterFixtureDefinition(),
): UaStateRegisterVarietyProjection {
  return JSON.parse(
    stableJsonStringify(jsonValue(definition.projection)),
  ) as UaStateRegisterVarietyProjection;
}

export function uaStateRegisterAllowedProjectionJson(
  definition = uaStateRegisterFixtureDefinition(),
): JsonValue {
  return jsonValue(uaStateRegisterAllowedProjection(definition));
}

export function uaStateRegisterAllowedUsage(
  definition = uaStateRegisterFixtureDefinition(),
): JsonValue {
  return jsonValue(definition.source.allowedUsage);
}

export function uaStateRegisterRawPayload(
  definition = uaStateRegisterFixtureDefinition(),
): JsonValue {
  return definition.record.rawPayload;
}

export function uaStateRegisterSourceOnlyFields(
  definition = uaStateRegisterFixtureDefinition(),
): JsonValue {
  return definition.record.sourceOnlyFields;
}

export function stableJsonStringify(value: JsonValue): string {
  return JSON.stringify(sortJsonValue(value));
}

function buildUaStateRegisterProjection(
  row: ReturnType<typeof normalizeUaStateRegisterSourceRow>,
): UaStateRegisterVarietyProjection {
  const aliases = dedupeAliases([
    {
      displayName: row.varietyName,
      normalizedName: normalizeCatalogName(row.varietyName),
      locale: "uk",
      isPrimary: true,
    },
    row.varietyNameLan
      ? {
          displayName: row.varietyNameLan,
          normalizedName: normalizeCatalogName(row.varietyNameLan),
          locale: "uk",
          isPrimary: false,
        }
      : null,
    row.varietyNameTRL
      ? {
          displayName: row.varietyNameTRL,
          normalizedName: normalizeCatalogName(row.varietyNameTRL),
          locale: "uk",
          isPrimary: false,
        }
      : null,
    row.taxonName
      ? {
          displayName: `${row.taxonName} ${row.varietyName}`,
          normalizedName: normalizeCatalogName(
            `${row.taxonName} ${row.varietyName}`,
          ),
          locale: "uk",
          isPrimary: false,
        }
      : null,
    row.taxonNameLat && row.varietyNameTRL
      ? {
          displayName: `${row.taxonNameLat} ${row.varietyNameTRL}`,
          normalizedName: normalizeCatalogName(
            `${row.taxonNameLat} ${row.varietyNameTRL}`,
          ),
          locale: "la",
          isPrimary: false,
        }
      : null,
  ]);

  return {
    canonicalName: row.varietyName,
    normalizedName: normalizeCatalogName(row.varietyName),
    publicSlug: buildUaStateRegisterPublicSlug(row),
    status: "seeded",
    source: "ua_state_register",
    sourceId: `ua-state-register:${UA_STATE_REGISTER_SOURCE.version}:RegisterVarietis:${row.applicationNumber}`,
    catalogKind: "plant_variety",
    locale: "uk",
    aliases,
  };
}

function buildUaStateRegisterPublicSlug(
  row: ReturnType<typeof normalizeUaStateRegisterSourceRow>,
) {
  const slugBase = slugifyAscii(row.varietyNameTRL ?? row.varietyName);
  return `${slugBase}-ua-register-${row.applicationNumber.toLowerCase()}`;
}

function slugifyAscii(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[`'’ʼ]+/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "ua-variety";
}

function normalizeUaStateRegisterSourceRow(
  sourceRow: UaStateRegisterSourceRow,
) {
  return {
    taxonGroupName: sourceValue(sourceRow.taxonGroupName),
    taxonGroupNameEn: sourceValue(sourceRow.taxonGroupNameEn),
    taxonName: requiredSourceValue(sourceRow.taxonName, "taxonName"),
    taxonNameLat: requiredSourceValue(sourceRow.taxonNameLat, "taxonNameLat"),
    taxonNameEn: sourceValue(sourceRow.taxonNameEn),
    applicationNumber: requiredSourceValue(
      sourceRow.applicationNumber,
      "applicationNumber",
    ),
    dateApplication: sourceValue(sourceRow.dateApplication),
    varietyName: requiredSourceValue(sourceRow.varietyName, "varietyName"),
    varietyNameLan: sourceValue(sourceRow.varietyNameLan),
    varietyNameTRL: sourceValue(sourceRow.varietyNameTRL),
    startDateRegistration: sourceValue(sourceRow.startDateRegistration),
    numberCertificate: sourceValue(sourceRow.numberСertificate),
    plantPatent: sourceValue(sourceRow.plantPatent),
    creationMethod: sourceValue(sourceRow.creationMethod),
    proposedZone: sourceValue(sourceRow.proposedZone),
    directionUse: sourceValue(sourceRow.directionUse),
    groupRipeness: sourceValue(sourceRow.groupRipeness),
    quality: sourceValue(sourceRow.quality),
    varietyDescription: sourceValue(sourceRow.varietyDescription),
    varietyDescriptionExternal: sourceValue(
      sourceRow.varietyDescriptionExternal,
    ),
    publicDomain: sourceValue(sourceRow.publicDomain),
    countryCode: sourceValue(sourceRow.сountryCode),
    countryCodeApplicant: sourceValue(sourceRow.сountryCodeApplicant),
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" || char === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r" && next === "\n") index += 1;
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function dedupeAliases(
  aliases: Array<{
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  } | null>,
) {
  const deduped = new Map<
    string,
    {
      displayName: string;
      normalizedName: string;
      locale: string;
      isPrimary: boolean;
    }
  >();

  for (const alias of aliases) {
    if (!alias) continue;
    if (!isProductCatalogAlias(alias)) continue;
    const key = `${alias.normalizedName}:${alias.locale}`;
    const existing = deduped.get(key);
    deduped.set(key, {
      ...alias,
      isPrimary: alias.isPrimary || Boolean(existing?.isPrimary),
    });
  }

  return [...deduped.values()];
}

function isProductCatalogAlias(alias: {
  displayName: string;
  normalizedName: string;
}) {
  return (
    alias.displayName.length <= MAX_PRODUCT_CATALOG_NAME_LENGTH &&
    alias.normalizedName.length <= MAX_PRODUCT_CATALOG_NAME_LENGTH
  );
}

function sourceValue(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized.toUpperCase() === "NULL") return null;
  return normalized;
}

function requiredSourceValue(value: string | undefined, field: string) {
  const normalized = sourceValue(value);
  if (!normalized) {
    throw new Error(`Missing required UA State Register field: ${field}`);
  }
  return normalized;
}

function normalizeCatalogName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJsonValue(item as JsonValue)]),
    );
  }

  return value;
}

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
