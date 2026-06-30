import { createHash } from "node:crypto";

import type { JsonValue } from "@/db/schema";

export const SPECIES_BACKBONE_PARSER_VERSION =
  "ove-58.species-backbone.seed.v1";

export const SPECIES_BACKBONE_SOURCE_IDS = {
  colId: "4Y369",
  colDatasetAlias: "3LR",
  colDatasetKey: 315448,
  wfoId: "wfo-0001029216",
  gbifTaxonKey: 2930137,
  eppoCode: "LYPES",
  wikidataId: "Q23501",
} as const;

const VERIFIED_AT = "2026-06-29T21:35:00.000Z";
const CC_BY_4_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
const CC0_1_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
const EPPO_OPEN_DATA_LICENSE_URL =
  "https://data.eppo.int/documentation/opendata";

export interface SpeciesBackboneSourceDefinition {
  slug: string;
  name: string;
  category: "species_backbone" | "species_alias_support";
  version: string;
  url: string;
  license: string;
  licenseUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  allowedUsage: readonly ["raw_snapshot", "canonical_product_projection"];
  fetchedAt: string;
  verifiedAt: string;
}

export interface SpeciesBackboneSourceRecordDefinition {
  source: SpeciesBackboneSourceDefinition;
  record: {
    id: string;
    rawPayload: JsonValue;
    sourceOnlyFields: JsonValue;
  };
}

export interface SpeciesBackboneProjection {
  canonicalName: string;
  normalizedName: string;
  publicSlug: string;
  status: "seeded";
  source: "species_backbone";
  sourceId: string;
  locale: "la";
  acceptedScientificName: string;
  sourceIds: {
    colId: string;
    colDatasetAlias: string;
    colDatasetKey: number;
    wfoId: string;
    gbifTaxonKey: number;
    eppoCode: string;
    wikidataId: string;
  };
  precedence: readonly string[];
  conflictBehavior: string;
  aliases: Array<{
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
    kind: "accepted_scientific_name" | "synonym" | "vernacular_alias";
    sourceSlugs: string[];
  }>;
}

export interface SpeciesBackboneAliasCandidate {
  displayName: string;
  normalizedName: string;
  locale: string;
  script: "Latin" | "Cyrillic";
  isPrimary: boolean;
  aliasKind:
    | "accepted_scientific_name"
    | "synonym"
    | "vernacular_alias"
    | "generated_variant"
    | "user_provisional";
  status:
    | "accepted"
    | "review_needed"
    | "rejected"
    | "generated"
    | "user_provisional";
  sourceSlug: string;
  sourceRecordKey: string | null;
  sourceMethod:
    | "source_backed"
    | "generated"
    | "manual_seed"
    | "user_provisional"
    | "curator";
  confidence: number;
  license: string;
  attributionRequired: boolean;
  projectionNotes: string;
}

export interface SpeciesBackboneImportDefinition {
  sourceRecords: SpeciesBackboneSourceRecordDefinition[];
  projection: SpeciesBackboneProjection;
  aliasCandidates: SpeciesBackboneAliasCandidate[];
}

export function speciesBackboneSeedDefinition(): SpeciesBackboneImportDefinition {
  const projection = buildSpeciesBackboneProjection();

  return {
    sourceRecords: buildSpeciesBackboneSourceRecords(),
    projection,
    aliasCandidates: buildSpeciesBackboneAliasCandidates(projection),
  };
}

export function buildSpeciesBackboneProjection(): SpeciesBackboneProjection {
  const aliases = dedupeAliases([
    {
      displayName: "Solanum lycopersicum L.",
      locale: "la",
      isPrimary: true,
      kind: "accepted_scientific_name",
      sourceSlugs: [
        "catalogue-of-life-checklistbank",
        "gbif-backbone",
        "eppo-codes",
      ],
    },
    {
      displayName: "Solanum lycopersicum",
      locale: "la",
      isPrimary: false,
      kind: "accepted_scientific_name",
      sourceSlugs: [
        "catalogue-of-life-checklistbank",
        "world-flora-online",
        "gbif-backbone",
        "wikidata",
      ],
    },
    {
      displayName: "Lycopersicon esculentum",
      locale: "la",
      isPrimary: false,
      kind: "synonym",
      sourceSlugs: ["eppo-codes"],
    },
    {
      displayName: "Tomato",
      locale: "en",
      isPrimary: false,
      kind: "vernacular_alias",
      sourceSlugs: ["catalogue-of-life-checklistbank", "wikidata"],
    },
    {
      displayName: "помідор",
      locale: "uk",
      isPrimary: false,
      kind: "vernacular_alias",
      sourceSlugs: ["wikidata"],
    },
    {
      displayName: "томати",
      locale: "uk",
      isPrimary: false,
      kind: "vernacular_alias",
      sourceSlugs: ["wikidata"],
    },
    {
      displayName: "домат",
      locale: "bg",
      isPrimary: false,
      kind: "vernacular_alias",
      sourceSlugs: ["wikidata"],
    },
  ]);

  return {
    canonicalName: "Solanum lycopersicum L.",
    normalizedName: normalizeCatalogName("Solanum lycopersicum L."),
    publicSlug: "solanum-lycopersicum-species-backbone",
    status: "seeded",
    source: "species_backbone",
    sourceId: `species-backbone:col-${SPECIES_BACKBONE_SOURCE_IDS.colDatasetAlias}:${SPECIES_BACKBONE_SOURCE_IDS.colId}`,
    locale: "la",
    acceptedScientificName: "Solanum lycopersicum L.",
    sourceIds: { ...SPECIES_BACKBONE_SOURCE_IDS },
    precedence: [
      "catalogue-of-life-checklistbank",
      "world-flora-online",
      "gbif-backbone",
      "eppo-codes",
      "wikidata",
    ],
    conflictBehavior:
      "CoL accepted species name is the canonical product name; WFO and GBIF must corroborate the same species concept, EPPO supplies an exact code/synonym only, and Wikidata supplies safe vernacular aliases only after identity is corroborated. Conflicting accepted names stay in source records until curation.",
    aliases,
  };
}

export function buildSpeciesBackboneSourceRecords(): SpeciesBackboneSourceRecordDefinition[] {
  return [
    {
      source: {
        slug: "catalogue-of-life-checklistbank",
        name: "Catalogue of Life / ChecklistBank",
        category: "species_backbone",
        version: "COL26.6 dataset 3LR key 315448",
        url: "https://api.catalogueoflife.org/dataset/3LR/nameusage/search?q=Solanum%20lycopersicum&limit=3",
        license: "Creative Commons Attribution 4.0 International",
        licenseUrl: CC_BY_4_LICENSE_URL,
        attributionRequired: true,
        attributionText:
          "Catalogue of Life / ChecklistBank, Creative Commons Attribution 4.0 International.",
        allowedUsage: ["raw_snapshot", "canonical_product_projection"],
        fetchedAt: VERIFIED_AT,
        verifiedAt: VERIFIED_AT,
      },
      record: {
        id: "CoL:3LR:4Y369",
        rawPayload: jsonValue({
          endpoint:
            "https://api.catalogueoflife.org/dataset/3LR/nameusage/search?q=Solanum%20lycopersicum&limit=3",
          datasetAlias: "3LR",
          datasetKey: 315448,
          id: "4Y369",
          status: "accepted",
          rank: "species",
          scientificName: "Solanum lycopersicum",
          authorship: "L.",
          label: "Solanum lycopersicum L.",
          genus: "Solanum",
          family: "Solanaceae",
          order: "Solanales",
          vernacularNames: ["Tomate (DE); Tomato (EN); Tomatera (ES)"],
        }),
        sourceOnlyFields: jsonValue({
          retainedInRawOnly: {
            fullClassification: true,
            htmlLabels: true,
            verbatimSourceKey: 329364662,
          },
        }),
      },
    },
    {
      source: {
        slug: "world-flora-online",
        name: "World Flora Online Plant List",
        category: "species_backbone",
        version: "2026-06",
        url: "https://list.worldfloraonline.org/matching_rest.php?input_string=Solanum%20lycopersicum",
        license: "CC0 1.0 Universal",
        licenseUrl: CC0_1_LICENSE_URL,
        attributionRequired: false,
        attributionText: null,
        allowedUsage: ["raw_snapshot", "canonical_product_projection"],
        fetchedAt: VERIFIED_AT,
        verifiedAt: VERIFIED_AT,
      },
      record: {
        id: "WFO:2026-06:wfo-0001029216",
        rawPayload: jsonValue({
          endpoint:
            "https://list.worldfloraonline.org/matching_rest.php?input_string=Solanum%20lycopersicum",
          classificationVersion: "2026-06",
          inputString: "Solanum lycopersicum",
          selectedCandidate: {
            wfoId: "wfo-0001029216",
            fullNamePlain: "Solanum lycopersicum L.",
            placement:
              "Code/Plantae/Pteridobiotina/Angiosperms/Solanales/Solanaceae/Solanoideae/Solaneae/Solanum/lycopersicum",
          },
          candidateCount: 2,
        }),
        sourceOnlyFields: jsonValue({
          nonProjectedCandidates: [
            {
              wfoId: "wfo-0001029217",
              fullNamePlain: "Solanum lycopersicum Blanco",
              reason:
                "Authorship conflicts with CoL, GBIF, and EPPO accepted-name evidence.",
            },
          ],
        }),
      },
    },
    {
      source: {
        slug: "gbif-backbone",
        name: "GBIF Backbone Taxonomy",
        category: "species_backbone",
        version: "Backbone pubDate 2023-08-28 modified 2023-11-17",
        url: "https://api.gbif.org/v1/species/match?name=Solanum%20lycopersicum",
        license: "Creative Commons Attribution 4.0 International",
        licenseUrl: CC_BY_4_LICENSE_URL,
        attributionRequired: true,
        attributionText:
          "GBIF Backbone Taxonomy, Creative Commons Attribution 4.0 International.",
        allowedUsage: ["raw_snapshot", "canonical_product_projection"],
        fetchedAt: VERIFIED_AT,
        verifiedAt: VERIFIED_AT,
      },
      record: {
        id: "GBIF:species:2930137",
        rawPayload: jsonValue({
          endpoint:
            "https://api.gbif.org/v1/species/match?name=Solanum%20lycopersicum",
          usageKey: 2930137,
          scientificName: "Solanum lycopersicum L.",
          canonicalName: "Solanum lycopersicum",
          rank: "SPECIES",
          status: "ACCEPTED",
          confidence: 98,
          matchType: "EXACT",
          kingdom: "Plantae",
          family: "Solanaceae",
          genus: "Solanum",
          species: "Solanum lycopersicum",
        }),
        sourceOnlyFields: jsonValue({
          occurrenceData: {
            imported: false,
            reason:
              "OVE-58 consumes GBIF Backbone taxonomy only; occurrence coordinates remain raw/source-only by OVE-55.",
            poisonCoordinateSentinel: {
              decimalLatitude: 50.4501,
              decimalLongitude: 30.5234,
              treatment:
                "must never project to product, public, search, logs, or analytics",
            },
          },
        }),
      },
    },
    {
      source: {
        slug: "eppo-codes",
        name: "EPPO Codes",
        category: "species_alias_support",
        version: "LYPES taxon page verified 2026-06-29",
        url: "https://gd.eppo.int/taxon/LYPES",
        license: "EPPO Codes Open Data Licence",
        licenseUrl: EPPO_OPEN_DATA_LICENSE_URL,
        attributionRequired: true,
        attributionText: "EPPO Codes, EPPO Codes Open Data Licence.",
        allowedUsage: ["raw_snapshot", "canonical_product_projection"],
        fetchedAt: VERIFIED_AT,
        verifiedAt: VERIFIED_AT,
      },
      record: {
        id: "EPPO:LYPES",
        rawPayload: jsonValue({
          endpoint: "https://gd.eppo.int/taxon/LYPES",
          eppoCode: "LYPES",
          codeCreatedIn: "1996-10-28",
          preferredName: "Solanum lycopersicum",
          authority: "Linnaeus",
          otherScientificNames: [
            "Lycopersicon esculentum Miller",
            "Lycopersicon lycopersicum (Linnaeus) Farwell",
          ],
        }),
        sourceOnlyFields: jsonValue({
          nonProjectedDistributionText:
            "Native to South America; cultivated throughout the world. Distribution/native-range text is retained only in source provenance for OVE-58.",
        }),
      },
    },
    {
      source: {
        slug: "wikidata",
        name: "Wikidata EntityData",
        category: "species_alias_support",
        version: "Q23501 live EntityData verified 2026-06-29",
        url: "https://www.wikidata.org/wiki/Special:EntityData/Q23501.json",
        license: "CC0 1.0 Universal",
        licenseUrl: CC0_1_LICENSE_URL,
        attributionRequired: false,
        attributionText: null,
        allowedUsage: ["raw_snapshot", "canonical_product_projection"],
        fetchedAt: VERIFIED_AT,
        verifiedAt: VERIFIED_AT,
      },
      record: {
        id: "Wikidata:Q23501",
        rawPayload: jsonValue({
          endpoint:
            "https://www.wikidata.org/wiki/Special:EntityData/Q23501.json",
          id: "Q23501",
          labels: {
            en: "tomato",
            uk: "помідор",
            bg: "домат",
          },
          aliases: {
            en: [
              "Solanum lycopersicum",
              "garden tomato",
              "love apple",
              "tomato plant",
            ],
            uk: [
              "Solanum lycopersicum",
              "томат (рослина)",
              "помідори",
              "томати",
            ],
            bg: ["Домати", "Solanum lycopersicum"],
          },
        }),
        sourceOnlyFields: jsonValue({
          nonProjectedAliases: {
            en: ["garden tomato", "love apple", "tomato plant"],
            uk: ["томат (рослина)", "помідори"],
            bg: ["Домати"],
            reason:
              "OVE-58 keeps the first gardener-facing alias set deliberately small until local-language coverage is reviewed.",
          },
        }),
      },
    },
  ];
}

export function buildSpeciesBackboneAliasCandidates(
  projection = buildSpeciesBackboneProjection(),
): SpeciesBackboneAliasCandidate[] {
  const acceptedAliases: SpeciesBackboneAliasCandidate[] = [
    {
      displayName: "Solanum lycopersicum L.",
      normalizedName: normalizeCatalogName("Solanum lycopersicum L."),
      locale: "la",
      script: "Latin",
      isPrimary: true,
      aliasKind: "accepted_scientific_name",
      status: "accepted",
      sourceSlug: "catalogue-of-life-checklistbank",
      sourceRecordKey: "CoL:3LR:4Y369",
      sourceMethod: "source_backed",
      confidence: 1,
      license: "Creative Commons Attribution 4.0 International",
      attributionRequired: true,
      projectionNotes:
        "Canonical accepted scientific name from CoL, corroborated by GBIF and EPPO.",
    },
    {
      displayName: "Solanum lycopersicum",
      normalizedName: normalizeCatalogName("Solanum lycopersicum"),
      locale: "la",
      script: "Latin",
      isPrimary: false,
      aliasKind: "accepted_scientific_name",
      status: "accepted",
      sourceSlug: "world-flora-online",
      sourceRecordKey: "WFO:2026-06:wfo-0001029216",
      sourceMethod: "source_backed",
      confidence: 0.99,
      license: "CC0 1.0 Universal",
      attributionRequired: false,
      projectionNotes:
        "Authorship-free scientific alias accepted for search only; canonical display remains CoL-backed.",
    },
    {
      displayName: "Lycopersicon esculentum",
      normalizedName: normalizeCatalogName("Lycopersicon esculentum"),
      locale: "la",
      script: "Latin",
      isPrimary: false,
      aliasKind: "synonym",
      status: "accepted",
      sourceSlug: "eppo-codes",
      sourceRecordKey: "EPPO:LYPES",
      sourceMethod: "source_backed",
      confidence: 0.94,
      license: "EPPO Codes Open Data Licence",
      attributionRequired: true,
      projectionNotes:
        "EPPO-backed synonym that resolves to the canonical species without changing canonical truth.",
    },
    {
      displayName: "Tomato",
      normalizedName: normalizeCatalogName("Tomato"),
      locale: "en",
      script: "Latin",
      isPrimary: false,
      aliasKind: "vernacular_alias",
      status: "accepted",
      sourceSlug: "wikidata",
      sourceRecordKey: "Wikidata:Q23501",
      sourceMethod: "source_backed",
      confidence: 0.98,
      license: "CC0 1.0 Universal",
      attributionRequired: false,
      projectionNotes:
        "Common English gardener-facing alias from Wikidata EntityData.",
    },
    {
      displayName: "помідор",
      normalizedName: normalizeCatalogName("помідор"),
      locale: "uk",
      script: "Cyrillic",
      isPrimary: false,
      aliasKind: "vernacular_alias",
      status: "accepted",
      sourceSlug: "wikidata",
      sourceRecordKey: "Wikidata:Q23501",
      sourceMethod: "source_backed",
      confidence: 0.98,
      license: "CC0 1.0 Universal",
      attributionRequired: false,
      projectionNotes:
        "Ukrainian local gardener-facing alias from Wikidata EntityData.",
    },
    {
      displayName: "томати",
      normalizedName: normalizeCatalogName("томати"),
      locale: "uk",
      script: "Cyrillic",
      isPrimary: false,
      aliasKind: "vernacular_alias",
      status: "accepted",
      sourceSlug: "wikidata",
      sourceRecordKey: "Wikidata:Q23501",
      sourceMethod: "source_backed",
      confidence: 0.92,
      license: "CC0 1.0 Universal",
      attributionRequired: false,
      projectionNotes:
        "Ukrainian plural alias accepted because it is source-backed and common in gardener search.",
    },
    {
      displayName: "домат",
      normalizedName: normalizeCatalogName("домат"),
      locale: "bg",
      script: "Cyrillic",
      isPrimary: false,
      aliasKind: "vernacular_alias",
      status: "accepted",
      sourceSlug: "wikidata",
      sourceRecordKey: "Wikidata:Q23501",
      sourceMethod: "source_backed",
      confidence: 0.98,
      license: "CC0 1.0 Universal",
      attributionRequired: false,
      projectionNotes:
        "Bulgarian local gardener-facing alias from Wikidata EntityData.",
    },
  ];

  assertAcceptedAliasesMatchProjection(acceptedAliases, projection);

  return [
    ...acceptedAliases,
    {
      displayName: "garden tomato",
      normalizedName: normalizeCatalogName("garden tomato"),
      locale: "en",
      script: "Latin",
      isPrimary: false,
      aliasKind: "vernacular_alias",
      status: "review_needed",
      sourceSlug: "wikidata",
      sourceRecordKey: "Wikidata:Q23501",
      sourceMethod: "source_backed",
      confidence: 0.62,
      license: "CC0 1.0 Universal",
      attributionRequired: false,
      projectionNotes:
        "Source-backed but held for review because it is redundant and less likely to be a UA/BG gardener query.",
    },
    {
      displayName: "love apple",
      normalizedName: normalizeCatalogName("love apple"),
      locale: "en",
      script: "Latin",
      isPrimary: false,
      aliasKind: "vernacular_alias",
      status: "rejected",
      sourceSlug: "wikidata",
      sourceRecordKey: "Wikidata:Q23501",
      sourceMethod: "source_backed",
      confidence: 0.2,
      license: "CC0 1.0 Universal",
      attributionRequired: false,
      projectionNotes:
        "Historical/ambiguous alias rejected from product typeahead for the first catalog seed.",
    },
    {
      displayName: "помидор",
      normalizedName: normalizeCatalogName("помидор"),
      locale: "uk",
      script: "Cyrillic",
      isPrimary: false,
      aliasKind: "generated_variant",
      status: "generated",
      sourceSlug: "overgarden-generated",
      sourceRecordKey: null,
      sourceMethod: "generated",
      confidence: 0.55,
      license: "OverGarden generated candidate",
      attributionRequired: false,
      projectionNotes:
        "Generated spelling variant kept visible to curators, not source-backed and not projected to typeahead.",
    },
  ];
}

export function speciesBackbonePayloadChecksum(
  sourceRecord: SpeciesBackboneSourceRecordDefinition,
) {
  return sha256Hex(stableJsonStringify(sourceRecord.record.rawPayload));
}

export function speciesBackboneSnapshotChecksum(
  sourceRecord: SpeciesBackboneSourceRecordDefinition,
) {
  return sha256Hex(
    stableJsonStringify(
      jsonValue({
        source: sourceRecord.source,
        recordId: sourceRecord.record.id,
        rawPayloadSha256: speciesBackbonePayloadChecksum(sourceRecord),
        parserVersion: SPECIES_BACKBONE_PARSER_VERSION,
      }),
    ),
  );
}

export function speciesBackboneAllowedProjection(
  definition = speciesBackboneSeedDefinition(),
): SpeciesBackboneProjection {
  return JSON.parse(
    stableJsonStringify(jsonValue(definition.projection)),
  ) as SpeciesBackboneProjection;
}

export function speciesBackboneAllowedProjectionJson(
  definition = speciesBackboneSeedDefinition(),
): JsonValue {
  return jsonValue(speciesBackboneAllowedProjection(definition));
}

export function speciesBackboneAllowedUsage(
  sourceRecord: SpeciesBackboneSourceRecordDefinition,
): JsonValue {
  return jsonValue(sourceRecord.source.allowedUsage);
}

export function speciesBackboneRawPayload(
  sourceRecord: SpeciesBackboneSourceRecordDefinition,
): JsonValue {
  return sourceRecord.record.rawPayload;
}

export function speciesBackboneSourceOnlyFields(
  sourceRecord: SpeciesBackboneSourceRecordDefinition,
): JsonValue {
  return sourceRecord.record.sourceOnlyFields;
}

export function stableJsonStringify(value: JsonValue): string {
  return JSON.stringify(sortJsonValue(value));
}

function dedupeAliases(
  aliases: Array<{
    displayName: string;
    locale: string;
    isPrimary: boolean;
    kind: "accepted_scientific_name" | "synonym" | "vernacular_alias";
    sourceSlugs: string[];
  }>,
): SpeciesBackboneProjection["aliases"] {
  const deduped = new Map<
    string,
    SpeciesBackboneProjection["aliases"][number]
  >();

  for (const alias of aliases) {
    const normalizedName = normalizeCatalogName(alias.displayName);
    if (!normalizedName) continue;

    const key = `${alias.locale}:${normalizedName}`;
    const existing = deduped.get(key);
    if (existing?.isPrimary) continue;

    deduped.set(key, {
      ...alias,
      normalizedName,
    });
  }

  return [...deduped.values()];
}

function normalizeCatalogName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function assertAcceptedAliasesMatchProjection(
  acceptedAliases: SpeciesBackboneAliasCandidate[],
  projection: SpeciesBackboneProjection,
) {
  const acceptedKeys = acceptedAliases.map(
    (alias) => `${alias.locale}:${alias.normalizedName}`,
  );
  const projectionKeys = projection.aliases.map(
    (alias) => `${alias.locale}:${alias.normalizedName}`,
  );

  if (acceptedKeys.join("|") !== projectionKeys.join("|")) {
    throw new Error("Accepted alias metadata must match projected aliases.");
  }
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
