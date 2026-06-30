import { createHash } from "node:crypto";

import type { JsonValue } from "@/db/schema";
import { stableJsonStringify } from "@/lib/catalog/source-sample";

export const CATALOG_SOURCE_REFRESH_PARSER_VERSION =
  "ove-64.ua-state-register.refresh.v1";

export const CATALOG_SOURCE_REFRESH_DIFF_STATUSES = [
  "new",
  "unchanged",
  "changed",
  "removed_upstream",
  "parser_reject",
  "review_needed",
  "projection_blocked",
] as const;

export type CatalogSourceRefreshDiffStatus =
  (typeof CATALOG_SOURCE_REFRESH_DIFF_STATUSES)[number];

export type CatalogSourceRefreshProjectionAction =
  | "project_new"
  | "link_existing"
  | "project_safe_aliases"
  | "retain_without_upstream"
  | "reject_parser_row"
  | "queue_curator_review"
  | "block_projection";

export interface CatalogSourceRefreshProjection {
  canonicalName: string;
  normalizedName: string;
  publicSlug: string;
  status: "seeded";
  source: "ua_state_register";
  sourceId: string;
  locale: "uk";
  aliases: Array<{
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  }>;
}

export interface CatalogSourceRefreshRecordDefinition {
  id: string;
  rawPayload: JsonValue;
  sourceOnlyFields: JsonValue;
  projection: CatalogSourceRefreshProjection | null;
  parserRejectReason?: string;
  projectionBlockedReason?: string;
}

export interface CatalogSourceRefreshSnapshotDefinition {
  source: {
    slug: "ua-state-register";
    name: string;
    category: "official_varieties";
    version: string;
    url: string;
    license: string;
    licenseUrl: string;
    attributionRequired: true;
    attributionText: string;
    allowedUsage: readonly string[];
  };
  fileProof: {
    sourceFile: string;
    resourceEncoding: "UTF-16LE";
    byteLength: number;
    rowCount: number;
    fetchedAt: string;
    verifiedAt: string;
  };
  records: CatalogSourceRefreshRecordDefinition[];
}

export interface CatalogSourceRefreshPlanRow {
  sourceRecordKey: string;
  diffStatus: CatalogSourceRefreshDiffStatus;
  projectionAction: CatalogSourceRefreshProjectionAction;
  canonicalName: string | null;
  publicSlug: string | null;
  sourceId: string | null;
  changedFields: string[];
  safeDiff: JsonValue;
  reviewReason: string | null;
  reindexRequired: boolean;
}

export const CATALOG_SOURCE_REFRESH_SOURCE = {
  slug: "ua-state-register",
  name: "Ukraine State Register of Plant Varieties",
  category: "official_varieties",
  url: "https://data.gov.ua/dataset/eabd0bd2-2dc6-47e2-b748-9bd254da4956/resource/32ea0f72-86e4-490d-9ab9-4d64976187c6/download/2025-07-15_registervarietis.csv",
  license: "Creative Commons Attribution 4.0 International",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attributionRequired: true,
  attributionText:
    "Ukraine State Register of Plant Varieties, Creative Commons Attribution 4.0 International.",
  allowedUsage: ["raw_snapshot", "canonical_product_projection"],
} as const;

const BASELINE_FILE_PROOF = {
  sourceFile: "2025-07-15_registervarietis-refresh-baseline.csv",
  resourceEncoding: "UTF-16LE",
  byteLength: 4096,
  rowCount: 4,
  fetchedAt: "2026-06-30T00:00:00.000Z",
  verifiedAt: "2026-06-30T00:00:00.000Z",
} as const;

const REFRESH_FILE_PROOF = {
  sourceFile: "2025-08-01_registervarietis-refresh-fixture.csv",
  resourceEncoding: "UTF-16LE",
  byteLength: 6144,
  rowCount: 6,
  fetchedAt: "2026-06-30T01:00:00.000Z",
  verifiedAt: "2026-06-30T01:00:00.000Z",
} as const;

export function catalogSourceRefreshBaselineSnapshotDefinition(): CatalogSourceRefreshSnapshotDefinition {
  return {
    source: {
      ...CATALOG_SOURCE_REFRESH_SOURCE,
      version: "2025-07-15-refresh-baseline",
    },
    fileProof: BASELINE_FILE_PROOF,
    records: [
      buildAcceptedRecord({
        applicationNumber: "24256002",
        varietyName: "Bergeron 1",
        aliases: [
          { displayName: "Bergeron 1", locale: "uk", isPrimary: true },
          {
            displayName: "Prunus armeniaca Bergeron 1",
            locale: "la",
            isPrimary: false,
          },
        ],
      }),
      buildAcceptedRecord({
        applicationNumber: "24256010",
        varietyName: "Refresh Pearl 64",
        aliases: [
          {
            displayName: "Refresh Pearl 64",
            locale: "uk",
            isPrimary: true,
          },
        ],
      }),
      buildAcceptedRecord({
        applicationNumber: "24256011",
        varietyName: "Refresh Old 64",
        aliases: [
          { displayName: "Refresh Old 64", locale: "uk", isPrimary: true },
        ],
      }),
      buildAcceptedRecord({
        applicationNumber: "24256012",
        varietyName: "Refresh Removed 64",
        aliases: [
          {
            displayName: "Refresh Removed 64",
            locale: "uk",
            isPrimary: true,
          },
        ],
      }),
    ],
  };
}

export function catalogSourceRefreshIncomingSnapshotDefinition(): CatalogSourceRefreshSnapshotDefinition {
  return {
    source: {
      ...CATALOG_SOURCE_REFRESH_SOURCE,
      version: "2025-08-01-refresh-fixture",
    },
    fileProof: REFRESH_FILE_PROOF,
    records: [
      buildAcceptedRecord({
        applicationNumber: "24256002",
        varietyName: "Bergeron 1",
        aliases: [
          { displayName: "Bergeron 1", locale: "uk", isPrimary: true },
          {
            displayName: "Prunus armeniaca Bergeron 1",
            locale: "la",
            isPrimary: false,
          },
        ],
      }),
      buildAcceptedRecord({
        applicationNumber: "24256010",
        varietyName: "Refresh Pearl 64",
        aliases: [
          {
            displayName: "Refresh Pearl 64",
            locale: "uk",
            isPrimary: true,
          },
          {
            displayName: "Apricot Refresh Pearl 64",
            locale: "uk",
            isPrimary: false,
          },
        ],
      }),
      buildAcceptedRecord({
        applicationNumber: "24256011",
        varietyName: "Refresh Renamed 64",
        aliases: [
          {
            displayName: "Refresh Renamed 64",
            locale: "uk",
            isPrimary: true,
          },
        ],
      }),
      buildAcceptedRecord({
        applicationNumber: "24256013",
        varietyName: "Refresh New 64",
        aliases: [
          { displayName: "Refresh New 64", locale: "uk", isPrimary: true },
          {
            displayName: "Apricot Refresh New 64",
            locale: "uk",
            isPrimary: false,
          },
        ],
      }),
      buildParserRejectRecord({
        applicationNumber: "24256014",
        reason: "Missing required varietyName field in source row.",
      }),
      buildProjectionBlockedRecord({
        applicationNumber: "24256015",
        varietyName: "Refresh Blocked 64",
        reason:
          "Source row license/status changed to conditional; OVE-55 live verification gate is required before projection.",
      }),
    ],
  };
}

export function planCatalogSourceRefreshDiff(
  previousRecords: CatalogSourceRefreshRecordDefinition[],
  incomingRecords: CatalogSourceRefreshRecordDefinition[],
): CatalogSourceRefreshPlanRow[] {
  const previousByKey = new Map(
    previousRecords.map((record) => [record.id, record]),
  );
  const incomingByKey = new Map(
    incomingRecords.map((record) => [record.id, record]),
  );
  const rows: CatalogSourceRefreshPlanRow[] = [];

  for (const incoming of incomingRecords) {
    const previous = previousByKey.get(incoming.id) ?? null;

    if (incoming.parserRejectReason) {
      rows.push(
        buildPlanRow({
          record: incoming,
          diffStatus: "parser_reject",
          projectionAction: "reject_parser_row",
          safeDiff: { parserRejectReason: incoming.parserRejectReason },
          reviewReason: incoming.parserRejectReason,
          reindexRequired: false,
        }),
      );
      continue;
    }

    if (incoming.projectionBlockedReason) {
      rows.push(
        buildPlanRow({
          record: incoming,
          diffStatus: "projection_blocked",
          projectionAction: "block_projection",
          safeDiff: {
            projectionBlockedReason: incoming.projectionBlockedReason,
          },
          reviewReason: incoming.projectionBlockedReason,
          reindexRequired: false,
        }),
      );
      continue;
    }

    if (!incoming.projection) {
      rows.push(
        buildPlanRow({
          record: incoming,
          diffStatus: "parser_reject",
          projectionAction: "reject_parser_row",
          safeDiff: {
            parserRejectReason: "Missing allowed projection.",
          },
          reviewReason: "Missing allowed projection.",
          reindexRequired: false,
        }),
      );
      continue;
    }

    if (!previous) {
      rows.push(
        buildPlanRow({
          record: incoming,
          diffStatus: "new",
          projectionAction: "project_new",
          safeDiff: {
            canonicalName: incoming.projection.canonicalName,
            publicSlug: incoming.projection.publicSlug,
          },
          reviewReason: null,
          reindexRequired: true,
        }),
      );
      continue;
    }

    const previousProjection = previous.projection;
    if (!previousProjection) {
      rows.push(
        buildPlanRow({
          record: incoming,
          diffStatus: "review_needed",
          projectionAction: "queue_curator_review",
          safeDiff: {
            previousProjectionMissing: true,
            incomingCanonicalName: incoming.projection.canonicalName,
          },
          reviewReason:
            "Previous source row had no product projection; curator review required.",
          reindexRequired: false,
        }),
      );
      continue;
    }

    const projectionDiff = buildSafeProjectionDiff(
      previousProjection,
      incoming.projection,
    );

    if (projectionDiff.changedFields.length === 0) {
      rows.push(
        buildPlanRow({
          record: incoming,
          diffStatus: "unchanged",
          projectionAction: "link_existing",
          safeDiff: {},
          reviewReason: null,
          reindexRequired: false,
        }),
      );
      continue;
    }

    if (
      projectionDiff.changedFields.every((field) => field === "aliases") &&
      previousProjection.sourceId === incoming.projection.sourceId &&
      previousProjection.canonicalName === incoming.projection.canonicalName
    ) {
      rows.push(
        buildPlanRow({
          record: incoming,
          diffStatus: "changed",
          projectionAction: "project_safe_aliases",
          safeDiff: projectionDiff.safeDiff,
          reviewReason: null,
          reindexRequired: true,
        }),
      );
      continue;
    }

    rows.push(
      buildPlanRow({
        record: incoming,
        diffStatus: "review_needed",
        projectionAction: "queue_curator_review",
        safeDiff: projectionDiff.safeDiff,
        reviewReason:
          "Canonical source projection changed; preserve existing catalog identity until curator review.",
        reindexRequired: false,
      }),
    );
  }

  for (const previous of previousRecords) {
    if (incomingByKey.has(previous.id)) continue;

    rows.push(
      buildPlanRow({
        record: previous,
        diffStatus: "removed_upstream",
        projectionAction: "retain_without_upstream",
        safeDiff: {
          previousCanonicalName: previous.projection?.canonicalName ?? null,
        },
        reviewReason:
          "Source row disappeared from the refreshed snapshot; retain canonical catalog item without destructive deletion.",
        reindexRequired: false,
      }),
    );
  }

  return rows.sort(
    (left, right) =>
      CATALOG_SOURCE_REFRESH_DIFF_STATUSES.indexOf(left.diffStatus) -
        CATALOG_SOURCE_REFRESH_DIFF_STATUSES.indexOf(right.diffStatus) ||
      left.sourceRecordKey.localeCompare(right.sourceRecordKey),
  );
}

export function summarizeCatalogSourceRefreshPlan(
  rows: CatalogSourceRefreshPlanRow[],
): Record<CatalogSourceRefreshDiffStatus, number> {
  return Object.fromEntries(
    CATALOG_SOURCE_REFRESH_DIFF_STATUSES.map((status) => [
      status,
      rows.filter((row) => row.diffStatus === status).length,
    ]),
  ) as Record<CatalogSourceRefreshDiffStatus, number>;
}

export function catalogSourceRefreshSnapshotChecksum(
  definition: CatalogSourceRefreshSnapshotDefinition,
) {
  return sha256Hex(
    stableJsonStringify(
      jsonValue({
        source: definition.source,
        fileProof: definition.fileProof,
        parserVersion: CATALOG_SOURCE_REFRESH_PARSER_VERSION,
        records: definition.records.map((record) => ({
          id: record.id,
          rawPayloadSha256: catalogSourceRefreshPayloadChecksum(record),
          allowedProjectionSha256: catalogSourceRefreshProjectionChecksum(
            record.projection,
          ),
          parserRejectReason: record.parserRejectReason ?? null,
          projectionBlockedReason: record.projectionBlockedReason ?? null,
        })),
      }),
    ),
  );
}

export function catalogSourceRefreshPayloadChecksum(
  record: CatalogSourceRefreshRecordDefinition,
) {
  return sha256Hex(stableJsonStringify(record.rawPayload));
}

export function catalogSourceRefreshProjectionChecksum(
  projection: CatalogSourceRefreshProjection | null,
) {
  return sha256Hex(stableJsonStringify(jsonValue(projection ?? {})));
}

export function catalogSourceRefreshAllowedUsage(
  definition: CatalogSourceRefreshSnapshotDefinition,
): JsonValue {
  return jsonValue(definition.source.allowedUsage);
}

export function catalogSourceRefreshAllowedProjectionJson(
  record: CatalogSourceRefreshRecordDefinition,
): JsonValue {
  return jsonValue(record.projection ?? {});
}

function buildAcceptedRecord(input: {
  applicationNumber: string;
  varietyName: string;
  aliases: Array<{
    displayName: string;
    locale: string;
    isPrimary: boolean;
  }>;
}): CatalogSourceRefreshRecordDefinition {
  const sourceRecordId = `RegisterVarietis:${input.applicationNumber}`;
  const row = {
    applicationNumber: input.applicationNumber,
    cropGroup: "Fruit and Berry",
    taxonNameLat: "Prunus armeniaca L.",
    speciesNameEn: "Apricot",
    varietyName: input.varietyName,
  };

  return {
    id: sourceRecordId,
    rawPayload: jsonValue({
      sourceFile: "registervarietis-refresh-fixture.csv",
      resourceEncoding: "UTF-16LE",
      row,
    }),
    sourceOnlyFields: jsonValue({
      nonProjectedRegisterFields: {
        cropGroup: row.cropGroup,
        taxonNameLat: row.taxonNameLat,
      },
      refreshFixture: "OVE-64 deterministic source refresh diff proof.",
    }),
    projection: buildProjection({
      sourceRecordId,
      applicationNumber: input.applicationNumber,
      canonicalName: input.varietyName,
      aliases: input.aliases,
    }),
  };
}

function buildParserRejectRecord(input: {
  applicationNumber: string;
  reason: string;
}): CatalogSourceRefreshRecordDefinition {
  const sourceRecordId = `RegisterVarietis:${input.applicationNumber}`;

  return {
    id: sourceRecordId,
    rawPayload: jsonValue({
      sourceFile: "registervarietis-refresh-fixture.csv",
      resourceEncoding: "UTF-16LE",
      row: {
        applicationNumber: input.applicationNumber,
        cropGroup: "Fruit and Berry",
        taxonNameLat: "Prunus armeniaca L.",
        varietyName: "",
      },
    }),
    sourceOnlyFields: jsonValue({
      parserRejectReason: input.reason,
      refreshFixture: "OVE-64 deterministic parser reject proof.",
    }),
    projection: null,
    parserRejectReason: input.reason,
  };
}

function buildProjectionBlockedRecord(input: {
  applicationNumber: string;
  varietyName: string;
  reason: string;
}): CatalogSourceRefreshRecordDefinition {
  const accepted = buildAcceptedRecord({
    applicationNumber: input.applicationNumber,
    varietyName: input.varietyName,
    aliases: [
      {
        displayName: input.varietyName,
        locale: "uk",
        isPrimary: true,
      },
    ],
  });

  return {
    ...accepted,
    sourceOnlyFields: jsonValue({
      licenseStatus: "conditional_without_live_gate",
      projectionBlockedReason: input.reason,
      refreshFixture: "OVE-64 deterministic projection block proof.",
    }),
    projection: null,
    projectionBlockedReason: input.reason,
  };
}

function buildProjection(input: {
  sourceRecordId: string;
  applicationNumber: string;
  canonicalName: string;
  aliases: Array<{
    displayName: string;
    locale: string;
    isPrimary: boolean;
  }>;
}): CatalogSourceRefreshProjection {
  const aliases = dedupeAliases(
    input.aliases.map((alias) => ({
      displayName: alias.displayName,
      normalizedName: normalizeCatalogName(alias.displayName),
      locale: alias.locale,
      isPrimary: alias.isPrimary,
    })),
  );

  return {
    canonicalName: input.canonicalName,
    normalizedName: normalizeCatalogName(input.canonicalName),
    publicSlug: `ove-64-${slugify(input.canonicalName)}-ua-register-${input.applicationNumber}`,
    status: "seeded",
    source: "ua_state_register",
    sourceId: `ua-state-register:${input.sourceRecordId}`,
    locale: "uk",
    aliases,
  };
}

function buildPlanRow(input: {
  record: CatalogSourceRefreshRecordDefinition;
  diffStatus: CatalogSourceRefreshDiffStatus;
  projectionAction: CatalogSourceRefreshProjectionAction;
  safeDiff: JsonValue;
  reviewReason: string | null;
  reindexRequired: boolean;
}): CatalogSourceRefreshPlanRow {
  return {
    sourceRecordKey: input.record.id,
    diffStatus: input.diffStatus,
    projectionAction: input.projectionAction,
    canonicalName: input.record.projection?.canonicalName ?? null,
    publicSlug: input.record.projection?.publicSlug ?? null,
    sourceId: input.record.projection?.sourceId ?? null,
    changedFields: Object.keys(input.safeDiff ?? {}).sort(),
    safeDiff: jsonValue(input.safeDiff),
    reviewReason: input.reviewReason,
    reindexRequired: input.reindexRequired,
  };
}

function buildSafeProjectionDiff(
  previous: CatalogSourceRefreshProjection,
  incoming: CatalogSourceRefreshProjection,
) {
  const safeDiff: Record<string, JsonValue> = {};

  if (previous.canonicalName !== incoming.canonicalName) {
    safeDiff.canonicalName = {
      previous: previous.canonicalName,
      incoming: incoming.canonicalName,
    };
  }
  if (previous.normalizedName !== incoming.normalizedName) {
    safeDiff.normalizedName = {
      previous: previous.normalizedName,
      incoming: incoming.normalizedName,
    };
  }
  if (previous.publicSlug !== incoming.publicSlug) {
    safeDiff.publicSlug = {
      previous: previous.publicSlug,
      incoming: incoming.publicSlug,
    };
  }
  if (previous.sourceId !== incoming.sourceId) {
    safeDiff.sourceId = {
      previous: previous.sourceId,
      incoming: incoming.sourceId,
    };
  }

  const previousAliases = projectionAliasKeys(previous);
  const incomingAliases = projectionAliasKeys(incoming);
  const addedAliases = incomingAliases.filter(
    (alias) => !previousAliases.includes(alias),
  );
  const removedAliases = previousAliases.filter(
    (alias) => !incomingAliases.includes(alias),
  );

  if (addedAliases.length > 0 || removedAliases.length > 0) {
    safeDiff.aliases = {
      added: addedAliases,
      removed: removedAliases,
    };
  }

  return {
    changedFields: Object.keys(safeDiff).sort(),
    safeDiff: jsonValue(safeDiff),
  };
}

function projectionAliasKeys(projection: CatalogSourceRefreshProjection) {
  return projection.aliases
    .map(
      (alias) =>
        `${alias.locale}:${alias.normalizedName}:${alias.displayName}:${alias.isPrimary}`,
    )
    .sort();
}

function dedupeAliases(
  aliases: CatalogSourceRefreshProjection["aliases"],
): CatalogSourceRefreshProjection["aliases"] {
  const seen = new Set<string>();
  const deduped: CatalogSourceRefreshProjection["aliases"] = [];

  for (const alias of aliases) {
    const key = `${alias.locale}:${alias.normalizedName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(alias);
  }

  return deduped;
}

function normalizeCatalogName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function slugify(value: string) {
  return normalizeCatalogName(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
