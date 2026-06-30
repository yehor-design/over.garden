import { createHash } from "node:crypto";

import type { JsonValue } from "@/db/schema";

export const BREED_SEED_PARSER_VERSION = "ove-60.ua-official-bee-breed.seed.v1";

const VERIFIED_AT = "2026-06-30T00:00:00.000Z";

export const UA_OFFICIAL_BEE_BREED_SOURCE = {
  slug: "ua-official-bee-breeds",
  name: "Ukraine Law on Beekeeping official bee breed seed",
  category: "official_breeds",
  version: "law-1492-iii-manual-seed-2026-06-30",
  url: "https://zakon.rada.gov.ua/go/1492-14",
  license: "Official Ukrainian legal text",
  licenseUrl: "https://zakon.rada.gov.ua/go/1492-14",
  attributionRequired: true,
  attributionText:
    "Law of Ukraine On Beekeeping No. 1492-III, official Verkhovna Rada portal.",
  allowedUsage: ["raw_snapshot", "canonical_product_projection", "manual_seed"],
  fetchedAt: VERIFIED_AT,
  verifiedAt: VERIFIED_AT,
} as const;

export interface BreedSeedProjection {
  canonicalName: string;
  normalizedName: string;
  publicSlug: string;
  catalogKind: "breed";
  status: "seeded";
  source: "ua_official_bee_breed";
  sourceId: string;
  locale: "uk";
  sourceIds: {
    officialBeeRef: string;
    vboId: null;
    dadIsRef: null;
    efabisRef: null;
  };
  aliases: Array<{
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  }>;
}

export interface BreedSeedAliasCandidate {
  displayName: string;
  normalizedName: string;
  locale: string;
  script: "Latin" | "Cyrillic";
  isPrimary: boolean;
  aliasKind: "vernacular_alias" | "accepted_scientific_name";
  status: "accepted" | "review_needed";
  sourceSlug: string;
  sourceRecordKey: string | null;
  sourceMethod: "manual_seed";
  confidence: number;
  license: string;
  attributionRequired: boolean;
  projectionNotes: string;
}

export interface BreedSeedImportDefinition {
  source: typeof UA_OFFICIAL_BEE_BREED_SOURCE;
  record: {
    id: string;
    rawPayload: JsonValue;
    sourceOnlyFields: JsonValue;
  };
  projection: BreedSeedProjection;
  aliasCandidates: BreedSeedAliasCandidate[];
}

export function breedSeedDefinition(): BreedSeedImportDefinition {
  const projection = buildBreedSeedProjection();

  return {
    source: UA_OFFICIAL_BEE_BREED_SOURCE,
    record: {
      id: "ua-law-1492-iii:bee-breed:carpathian",
      rawPayload: jsonValue({
        lawCitation:
          "Про бджільництво : Закон України від 22.02.2000 № 1492-III",
        lawUrl: UA_OFFICIAL_BEE_BREED_SOURCE.url,
        accessDate: "2026-06-30",
        manualSeedBasis:
          "OVE-60 uses a small official/manual bee breed seed; the live law URL was verified for citation, while the breed list remains a maintained seed rather than a bulk external import.",
        officialManualBreedSet: [
          "Карпатська бджола",
          "Українська степова бджола",
          "Поліська бджола",
        ],
        selectedBreed: {
          officialName: "Карпатська бджола",
          shorthandName: "Карпатська",
          englishDisplayName: "Carpathian honey bee",
        },
      }),
      sourceOnlyFields: jsonValue({
        vbo: {
          usedForProjection: false,
          reason:
            "Vertebrate Breed Ontology is a vertebrate backbone and does not cover Apis mellifera bee breeds.",
        },
        dadIsEfabisInternalValidation: {
          usedForProjection: false,
          productIngestionAllowed: false,
          reason:
            "DAD-IS/EFABIS remains internal-validation-only until a specific source-use clearance promotes any field.",
        },
        latinNameDispute: {
          projectedToTypeahead: false,
          candidatesHeldForCuration: [
            "Apis mellifera carpatica",
            "Apis mellifera carnica",
          ],
          reason:
            "Latin/subspecies mapping is contested enough for curator review; accepted product projection stays on official/common breed labels.",
        },
        restrictedFields: {
          distributionCoordinatesStored: false,
          occurrenceCoordinatesStored: false,
          sourceOnlyPayloadLeavesRawTablesOnly: true,
        },
      }),
    },
    projection,
    aliasCandidates: buildBreedSeedAliasCandidates(projection),
  };
}

export function buildBreedSeedProjection(): BreedSeedProjection {
  const aliases = dedupeAliases([
    {
      displayName: "Карпатська бджола",
      locale: "uk",
      isPrimary: true,
    },
    {
      displayName: "Карпатська",
      locale: "uk",
      isPrimary: false,
    },
    {
      displayName: "Carpathian honey bee",
      locale: "en",
      isPrimary: false,
    },
  ]);

  return {
    canonicalName: "Карпатська бджола",
    normalizedName: normalizeCatalogName("Карпатська бджола"),
    publicSlug: "karpatska-bdzhola-ua-official-breed",
    catalogKind: "breed",
    status: "seeded",
    source: "ua_official_bee_breed",
    sourceId: "ua-official-bee-breeds:carpathian",
    locale: "uk",
    sourceIds: {
      officialBeeRef: "ua-law-1492-iii:bee-breed:carpathian",
      vboId: null,
      dadIsRef: null,
      efabisRef: null,
    },
    aliases,
  };
}

export function buildBreedSeedAliasCandidates(
  projection = buildBreedSeedProjection(),
): BreedSeedAliasCandidate[] {
  const accepted = projection.aliases.map((alias) => ({
    displayName: alias.displayName,
    normalizedName: alias.normalizedName,
    locale: alias.locale,
    script: alias.locale === "uk" ? ("Cyrillic" as const) : ("Latin" as const),
    isPrimary: alias.isPrimary,
    aliasKind: "vernacular_alias" as const,
    status: "accepted" as const,
    sourceSlug: UA_OFFICIAL_BEE_BREED_SOURCE.slug,
    sourceRecordKey: "ua-law-1492-iii:bee-breed:carpathian",
    sourceMethod: "manual_seed" as const,
    confidence: alias.isPrimary ? 1 : 0.94,
    license: UA_OFFICIAL_BEE_BREED_SOURCE.license,
    attributionRequired: UA_OFFICIAL_BEE_BREED_SOURCE.attributionRequired,
    projectionNotes:
      "Manual official bee breed seed; safe display alias projected to typeahead.",
  }));

  return [
    ...accepted,
    {
      displayName: "Apis mellifera carpatica",
      normalizedName: normalizeCatalogName("Apis mellifera carpatica"),
      locale: "la",
      script: "Latin",
      isPrimary: false,
      aliasKind: "accepted_scientific_name",
      status: "review_needed",
      sourceSlug: UA_OFFICIAL_BEE_BREED_SOURCE.slug,
      sourceRecordKey: "ua-law-1492-iii:bee-breed:carpathian",
      sourceMethod: "manual_seed",
      confidence: 0.5,
      license: UA_OFFICIAL_BEE_BREED_SOURCE.license,
      attributionRequired: UA_OFFICIAL_BEE_BREED_SOURCE.attributionRequired,
      projectionNotes:
        "Held for curator review because Latin/subspecies mapping is disputed.",
    },
    {
      displayName: "Apis mellifera carnica",
      normalizedName: normalizeCatalogName("Apis mellifera carnica"),
      locale: "la",
      script: "Latin",
      isPrimary: false,
      aliasKind: "accepted_scientific_name",
      status: "review_needed",
      sourceSlug: UA_OFFICIAL_BEE_BREED_SOURCE.slug,
      sourceRecordKey: "ua-law-1492-iii:bee-breed:carpathian",
      sourceMethod: "manual_seed",
      confidence: 0.4,
      license: UA_OFFICIAL_BEE_BREED_SOURCE.license,
      attributionRequired: UA_OFFICIAL_BEE_BREED_SOURCE.attributionRequired,
      projectionNotes:
        "Held for curator review; not projected to user typeahead as a breed identity.",
    },
  ];
}

export function breedSeedSnapshotChecksum(definition = breedSeedDefinition()) {
  return sha256Hex(
    stableJsonStringify(
      jsonValue({
        source: definition.source,
        recordIds: [definition.record.id],
        projection: definition.projection,
      }),
    ),
  );
}

export function breedSeedPayloadChecksum(definition = breedSeedDefinition()) {
  return sha256Hex(stableJsonStringify(definition.record.rawPayload));
}

export function breedSeedAllowedProjection(
  definition = breedSeedDefinition(),
): BreedSeedProjection {
  return JSON.parse(
    stableJsonStringify(jsonValue(definition.projection)),
  ) as BreedSeedProjection;
}

export function breedSeedAllowedProjectionJson(
  definition = breedSeedDefinition(),
): JsonValue {
  return jsonValue(breedSeedAllowedProjection(definition));
}

export function breedSeedAllowedUsage(
  definition = breedSeedDefinition(),
): JsonValue {
  return jsonValue(definition.source.allowedUsage);
}

export function breedSeedRawPayload(
  definition = breedSeedDefinition(),
): JsonValue {
  return definition.record.rawPayload;
}

export function breedSeedSourceOnlyFields(
  definition = breedSeedDefinition(),
): JsonValue {
  return definition.record.sourceOnlyFields;
}

function normalizeCatalogName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function dedupeAliases(
  aliases: Array<{
    displayName: string;
    locale: string;
    isPrimary: boolean;
  }>,
) {
  const seen = new Set<string>();
  return aliases.flatMap((alias) => {
    const normalizedName = normalizeCatalogName(alias.displayName);
    const key = `${alias.locale}:${normalizedName}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        ...alias,
        normalizedName,
      },
    ];
  });
}

function stableJsonStringify(value: JsonValue): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJsonValue);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested ?? null)]),
    );
  }

  return value;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
