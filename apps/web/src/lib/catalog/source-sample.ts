import { createHash } from "node:crypto";

import type { JsonValue } from "@/db/schema";

export const CATALOG_SOURCE_SAMPLE_PARSER_VERSION =
  "ove-56.ua-state-register.sample.v1";

export const CATALOG_SOURCE_SAMPLE = {
  source: {
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
    fetchedAt: "2026-06-29T00:00:00.000Z",
    verifiedAt: "2026-06-29T00:00:00.000Z",
  },
  record: {
    id: "RegisterVarietis:24256002",
    rawPayload: {
      sourceFile: "2025-07-15_registervarietis.csv",
      resourceEncoding: "UTF-16LE",
      row: {
        applicationNumber: "24256002",
        cropGroup: "Fruit and Berry",
        taxonNameLat: "Prunus armeniaca L.",
        speciesNameEn: "Apricot",
        varietyName: "Bergeron 1",
        varietyNameLan: "Bergeron 1",
        sourceProof: "OVE-55 byte-range proof observed this public row.",
      },
      sourceOnly: {
        observedByteRangeOnly: true,
        sourcePortalNote:
          "Fetch exact resource URLs only; do not crawl the portal.",
        occurrenceCoordinates: {
          decimalLatitude: 50.4501,
          decimalLongitude: 30.5234,
          treatment: "source snapshot quarantine only",
        },
        exifGps: "source-only poison field proving projection filtering",
        journalBody: "source-only poison field proving journal isolation",
        ownerUserId: "source-only poison field proving owner isolation",
      },
    },
    sourceOnlyFields: {
      observedByteRangeOnly: true,
      sourcePortalNote:
        "Fetch exact resource URLs only; do not crawl the portal.",
      occurrenceCoordinates: {
        decimalLatitude: 50.4501,
        decimalLongitude: 30.5234,
        treatment: "source snapshot quarantine only",
      },
      exifGps: "source-only poison field proving projection filtering",
      journalBody: "source-only poison field proving journal isolation",
      ownerUserId: "source-only poison field proving owner isolation",
    },
  },
  projection: {
    canonicalName: "Bergeron 1",
    normalizedName: "bergeron 1",
    publicSlug: "bergeron-1-ua-register-24256002",
    status: "seeded",
    source: "ua_state_register",
    sourceId: "ua-state-register:2025-07-15:RegisterVarietis:24256002",
    locale: "uk",
    aliases: [
      {
        displayName: "Bergeron 1",
        normalizedName: "bergeron 1",
        locale: "uk",
        isPrimary: true,
      },
      {
        displayName: "Абрикос Bergeron 1",
        normalizedName: "абрикос bergeron 1",
        locale: "uk",
        isPrimary: false,
      },
      {
        displayName: "Prunus armeniaca Bergeron 1",
        normalizedName: "prunus armeniaca bergeron 1",
        locale: "la",
        isPrimary: false,
      },
    ],
  },
} as const;

export interface CatalogSourceSampleProjection {
  canonicalName: string;
  normalizedName: string;
  publicSlug: string;
  status: "seeded";
  source: string;
  sourceId: string;
  locale: string;
  aliases: Array<{
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  }>;
}

export function catalogSourceSamplePayloadChecksum() {
  return sha256Hex(stableJsonStringify(catalogSourceSampleRawPayload()));
}

export function catalogSourceSampleSnapshotChecksum() {
  return sha256Hex(
    stableJsonStringify(
      jsonValue({
        source: CATALOG_SOURCE_SAMPLE.source,
        recordId: CATALOG_SOURCE_SAMPLE.record.id,
        rawPayloadSha256: catalogSourceSamplePayloadChecksum(),
        parserVersion: CATALOG_SOURCE_SAMPLE_PARSER_VERSION,
      }),
    ),
  );
}

export function catalogSourceSampleAllowedProjection(): CatalogSourceSampleProjection {
  return JSON.parse(
    stableJsonStringify(jsonValue(CATALOG_SOURCE_SAMPLE.projection)),
  ) as CatalogSourceSampleProjection;
}

export function catalogSourceSampleAllowedProjectionJson(): JsonValue {
  return jsonValue(catalogSourceSampleAllowedProjection());
}

export function catalogSourceSampleAllowedUsage(): JsonValue {
  return jsonValue(CATALOG_SOURCE_SAMPLE.source.allowedUsage);
}

export function catalogSourceSampleRawPayload(): JsonValue {
  return jsonValue(CATALOG_SOURCE_SAMPLE.record.rawPayload);
}

export function catalogSourceSampleSourceOnlyFields(): JsonValue {
  return jsonValue(CATALOG_SOURCE_SAMPLE.record.sourceOnlyFields);
}

export function stableJsonStringify(value: JsonValue): string {
  return JSON.stringify(sortJsonValue(value));
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
