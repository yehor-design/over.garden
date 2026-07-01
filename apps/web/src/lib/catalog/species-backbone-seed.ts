import { createHash } from "node:crypto";

import type { JsonValue } from "@/db/schema";

export const SPECIES_BACKBONE_PARSER_VERSION =
  "ove-82.species-backbone.planned-import.v1";

export interface SpeciesBackboneSourceIds {
  colId: string;
  colDatasetAlias: string;
  colDatasetKey: number;
  wfoId: string;
  gbifTaxonKey: number;
  eppoCode: string;
  wikidataId: string;
}

export const SPECIES_BACKBONE_SOURCE_IDS: SpeciesBackboneSourceIds = {
  colId: "4Y369",
  colDatasetAlias: "3LR",
  colDatasetKey: 315448,
  wfoId: "wfo-0001029216",
  gbifTaxonKey: 2930137,
  eppoCode: "LYPES",
  wikidataId: "Q23501",
} as const;

const VERIFIED_AT = "2026-07-01T09:00:00.000Z";
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
  catalogKind: "species";
  locale: "la";
  acceptedScientificName: string;
  sourceIds: SpeciesBackboneSourceIds;
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
  concepts: SpeciesBackboneConceptDefinition[];
  sourceRecords: SpeciesBackboneSourceRecordDefinition[];
  projection: SpeciesBackboneProjection;
  aliasCandidates: SpeciesBackboneAliasCandidate[];
}

export interface SpeciesBackboneConceptDefinition {
  key: string;
  sourceRecords: SpeciesBackboneSourceRecordDefinition[];
  projection: SpeciesBackboneProjection;
  aliasCandidates: SpeciesBackboneAliasCandidate[];
}

type SpeciesBackboneProjectionInput =
  | SpeciesBackboneImportDefinition
  | SpeciesBackboneConceptDefinition
  | SpeciesBackboneProjection;

export function speciesBackboneSeedDefinition(): SpeciesBackboneImportDefinition {
  const concepts = buildSpeciesBackboneConcepts();
  const primaryConcept = concepts[0];

  return {
    concepts,
    sourceRecords: primaryConcept.sourceRecords,
    projection: primaryConcept.projection,
    aliasCandidates: primaryConcept.aliasCandidates,
  };
}

export function speciesBackboneConcepts(
  definition = speciesBackboneSeedDefinition(),
): SpeciesBackboneConceptDefinition[] {
  return definition.concepts;
}

export function buildSpeciesBackboneConcepts(): SpeciesBackboneConceptDefinition[] {
  const tomatoProjection = buildSpeciesBackboneProjection();

  return [
    {
      key: "solanum-lycopersicum",
      sourceRecords: buildSpeciesBackboneSourceRecords(),
      projection: tomatoProjection,
      aliasCandidates: buildSpeciesBackboneAliasCandidates(tomatoProjection),
    },
    buildPlannedSpeciesBackboneConcept({
      key: "cucumis-sativus",
      scientificName: "Cucumis sativus",
      canonicalName: "Cucumis sativus L.",
      sourceIds: {
        colId: "6BPNL",
        colDatasetAlias: "3LR",
        colDatasetKey: 315448,
        wfoId: "wfo-0000628992",
        gbifTaxonKey: 2874569,
        eppoCode: "CUMSA",
        wikidataId: "Q23425",
      },
      family: "Cucurbitaceae",
      genus: "Cucumis",
      order: "Cucurbitales",
      wikidataLabels: {
        en: "Cucumis sativus",
        uk: "огірок звичайний",
        bg: "Краставица",
      },
      acceptedVernacularAliases: [
        { displayName: "Cucumber", locale: "en", script: "Latin" },
        { displayName: "огірок", locale: "uk", script: "Cyrillic" },
        { displayName: "краставица", locale: "bg", script: "Cyrillic" },
      ],
      reviewAliases: [
        {
          displayName: "gherkin",
          locale: "en",
          script: "Latin",
          sourceSlug: "wikidata",
          sourceRecordKey: "Wikidata:Q23425",
          confidence: 0.61,
          projectionNotes:
            "Source-backed but held for review because it can describe a pickling use, cultivar class, or processed product rather than the species concept.",
        },
      ],
      rejectedAliases: [
        {
          displayName: "pickle",
          locale: "en",
          script: "Latin",
          projectionNotes:
            "Rejected because the term primarily names a prepared food and would create a misleading species suggestion.",
        },
      ],
      generatedAliases: [
        {
          displayName: "огурец",
          locale: "uk",
          script: "Cyrillic",
          confidence: 0.42,
          projectionNotes:
            "Generated cross-language spelling candidate; not source-backed for Ukrainian product search.",
        },
      ],
    }),
    buildPlannedSpeciesBackboneConcept({
      key: "helianthus-annuus",
      scientificName: "Helianthus annuus",
      canonicalName: "Helianthus annuus L.",
      sourceIds: {
        colId: "3K5TS",
        colDatasetAlias: "3LR",
        colDatasetKey: 315448,
        wfoId: "wfo-0000088131",
        gbifTaxonKey: 9206251,
        eppoCode: "HELAN",
        wikidataId: "Q171497",
      },
      family: "Asteraceae",
      genus: "Helianthus",
      order: "Asterales",
      wikidataLabels: {
        en: "common sunflower",
        uk: "соняшник",
        bg: "слънчоглед",
      },
      acceptedVernacularAliases: [
        { displayName: "Sunflower", locale: "en", script: "Latin" },
        { displayName: "соняшник", locale: "uk", script: "Cyrillic" },
        { displayName: "слънчоглед", locale: "bg", script: "Cyrillic" },
      ],
      reviewAliases: [
        {
          displayName: "common sunflower",
          locale: "en",
          script: "Latin",
          sourceSlug: "wikidata",
          sourceRecordKey: "Wikidata:Q171497",
          confidence: 0.72,
          projectionNotes:
            "Source-backed label held for review because product search should first prefer the simpler gardener-facing alias.",
        },
        {
          displayName: "сонях",
          locale: "uk",
          script: "Cyrillic",
          sourceSlug: "wikidata",
          sourceRecordKey: "Wikidata:Q171497",
          confidence: 0.58,
          projectionNotes:
            "Source-backed local variant held until Ukrainian alias coverage is reviewed.",
        },
      ],
      rejectedAliases: [
        {
          displayName: "обикновен слънчоглед",
          locale: "bg",
          script: "Cyrillic",
          projectionNotes:
            "Rejected from the first projection as a verbose duplicate that can crowd Bulgarian typeahead before OVE-83 alias QA.",
        },
      ],
      generatedAliases: [
        {
          displayName: "соняхи",
          locale: "uk",
          script: "Cyrillic",
          confidence: 0.5,
          projectionNotes:
            "Generated plural candidate kept for curator review only.",
        },
      ],
    }),
    buildPlannedSpeciesBackboneConcept({
      key: "ocimum-basilicum",
      scientificName: "Ocimum basilicum",
      canonicalName: "Ocimum basilicum L.",
      sourceIds: {
        colId: "48GBK",
        colDatasetAlias: "3LR",
        colDatasetKey: 315448,
        wfoId: "wfo-0000253230",
        gbifTaxonKey: 2927096,
        eppoCode: "OCIBA",
        wikidataId: "Q38859",
      },
      family: "Lamiaceae",
      genus: "Ocimum",
      order: "Lamiales",
      wikidataLabels: {
        en: "basil",
        uk: "базилік духмяний",
        bg: "обикновен босилек",
      },
      acceptedVernacularAliases: [
        { displayName: "Basil", locale: "en", script: "Latin" },
        { displayName: "базилік", locale: "uk", script: "Cyrillic" },
        { displayName: "босилек", locale: "bg", script: "Cyrillic" },
      ],
      reviewAliases: [
        {
          displayName: "sweet basil",
          locale: "en",
          script: "Latin",
          sourceSlug: "eppo-codes",
          sourceRecordKey: "EPPO:OCIBA",
          confidence: 0.67,
          projectionNotes:
            "Source-backed common-name candidate held because it can compete with cultivar/common herb naming in the first projection.",
        },
        {
          displayName: "базилік духмяний",
          locale: "uk",
          script: "Cyrillic",
          sourceSlug: "wikidata",
          sourceRecordKey: "Wikidata:Q38859",
          confidence: 0.68,
          projectionNotes:
            "Source-backed Ukrainian label held until local-language alias review confirms it should be searchable.",
        },
      ],
      rejectedAliases: [
        {
          displayName: "holy basil",
          locale: "en",
          script: "Latin",
          projectionNotes:
            "Rejected because it names a different commonly grown Ocimum species group and would misroute gardener search.",
        },
      ],
      generatedAliases: [
        {
          displayName: "базилик",
          locale: "uk",
          script: "Cyrillic",
          confidence: 0.44,
          projectionNotes:
            "Generated cross-language spelling candidate; not source-backed for Ukrainian product search.",
        },
      ],
    }),
  ];
}

interface PlannedSpeciesBackboneConceptInput {
  key: string;
  scientificName: string;
  canonicalName: string;
  sourceIds: SpeciesBackboneSourceIds;
  family: string;
  genus: string;
  order: string;
  wikidataLabels: {
    en: string;
    uk: string;
    bg: string;
  };
  acceptedVernacularAliases: Array<{
    displayName: string;
    locale: "en" | "uk" | "bg";
    script: "Latin" | "Cyrillic";
  }>;
  reviewAliases: Array<{
    displayName: string;
    locale: string;
    script: "Latin" | "Cyrillic";
    sourceSlug: string;
    sourceRecordKey: string | null;
    confidence: number;
    projectionNotes: string;
  }>;
  rejectedAliases: Array<{
    displayName: string;
    locale: string;
    script: "Latin" | "Cyrillic";
    projectionNotes: string;
  }>;
  generatedAliases: Array<{
    displayName: string;
    locale: string;
    script: "Latin" | "Cyrillic";
    confidence: number;
    projectionNotes: string;
  }>;
}

function buildPlannedSpeciesBackboneConcept(
  input: PlannedSpeciesBackboneConceptInput,
): SpeciesBackboneConceptDefinition {
  const sourceRecords = buildPlannedSpeciesBackboneSourceRecords(input);
  const projection = buildPlannedSpeciesBackboneProjection(input);

  return {
    key: input.key,
    sourceRecords,
    projection,
    aliasCandidates: buildPlannedSpeciesBackboneAliasCandidates(
      input,
      projection,
    ),
  };
}

function buildPlannedSpeciesBackboneProjection(
  input: PlannedSpeciesBackboneConceptInput,
): SpeciesBackboneProjection {
  const aliases = dedupeAliases([
    {
      displayName: input.canonicalName,
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
      displayName: input.scientificName,
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
    ...input.acceptedVernacularAliases.map((alias) => ({
      displayName: alias.displayName,
      locale: alias.locale,
      isPrimary: false,
      kind: "vernacular_alias" as const,
      sourceSlugs: ["wikidata"],
    })),
  ]);

  return {
    canonicalName: input.canonicalName,
    normalizedName: normalizeCatalogName(input.canonicalName),
    publicSlug: `${input.key}-species-backbone`,
    status: "seeded",
    source: "species_backbone",
    sourceId: `species-backbone:col-${input.sourceIds.colDatasetAlias}:${input.sourceIds.colId}`,
    catalogKind: "species",
    locale: "la",
    acceptedScientificName: input.canonicalName,
    sourceIds: { ...input.sourceIds },
    precedence: [
      "catalogue-of-life-checklistbank",
      "world-flora-online",
      "gbif-backbone",
      "eppo-codes",
      "wikidata",
    ],
    conflictBehavior:
      "CoL accepted species name remains canonical; WFO and GBIF corroborate the species concept, EPPO supplies exact code/name support, and Wikidata contributes only reviewed gardener-facing aliases. Ambiguous vernaculars and unsupported mappings are retained in alias curation, not product typeahead.",
    aliases,
  };
}

function buildPlannedSpeciesBackboneSourceRecords(
  input: PlannedSpeciesBackboneConceptInput,
): SpeciesBackboneSourceRecordDefinition[] {
  const query = encodeURIComponent(input.scientificName);

  return [
    {
      source: {
        slug: "catalogue-of-life-checklistbank",
        name: "Catalogue of Life / ChecklistBank",
        category: "species_backbone",
        version: `COL26.6 dataset ${input.sourceIds.colDatasetAlias} key ${input.sourceIds.colDatasetKey}`,
        url: `https://api.catalogueoflife.org/dataset/${input.sourceIds.colDatasetAlias}/nameusage/search?q=${query}&limit=3`,
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
        id: `CoL:${input.sourceIds.colDatasetAlias}:${input.sourceIds.colId}`,
        rawPayload: jsonValue({
          endpoint: `https://api.catalogueoflife.org/dataset/${input.sourceIds.colDatasetAlias}/nameusage/search?q=${query}&limit=3`,
          datasetAlias: input.sourceIds.colDatasetAlias,
          datasetKey: input.sourceIds.colDatasetKey,
          id: input.sourceIds.colId,
          status: "accepted",
          rank: "species",
          scientificName: input.scientificName,
          authorship: "L.",
          label: input.canonicalName,
          genus: input.genus,
          family: input.family,
          order: input.order,
        }),
        sourceOnlyFields: jsonValue({
          retainedInRawOnly: {
            fullClassification: true,
            htmlLabels: true,
            nonSelectedNameUsages: true,
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
        url: `http://list.worldfloraonline.org/matching_rest.php?input_string=${query}`,
        license: "CC0 1.0 Universal",
        licenseUrl: CC0_1_LICENSE_URL,
        attributionRequired: false,
        attributionText: null,
        allowedUsage: ["raw_snapshot", "canonical_product_projection"],
        fetchedAt: VERIFIED_AT,
        verifiedAt: VERIFIED_AT,
      },
      record: {
        id: `WFO:2026-06:${input.sourceIds.wfoId}`,
        rawPayload: jsonValue({
          endpoint: `http://list.worldfloraonline.org/matching_rest.php?input_string=${query}`,
          classificationVersion: "2026-06",
          inputString: input.scientificName,
          selectedCandidate: {
            wfoId: input.sourceIds.wfoId,
            fullNamePlain: input.canonicalName,
            placement: `Code/Plantae/Pteridobiotina/Angiosperms/${input.order}/${input.family}/${input.genus}/${input.scientificName.split(" ")[1]}`,
          },
          candidateCount: 0,
        }),
        sourceOnlyFields: jsonValue({
          nonProjectedCandidates: [],
        }),
      },
    },
    {
      source: {
        slug: "gbif-backbone",
        name: "GBIF Backbone Taxonomy",
        category: "species_backbone",
        version: "Backbone pubDate 2023-08-28 modified 2023-11-17",
        url: `https://api.gbif.org/v1/species/match?name=${query}`,
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
        id: `GBIF:species:${input.sourceIds.gbifTaxonKey}`,
        rawPayload: jsonValue({
          endpoint: `https://api.gbif.org/v1/species/match?name=${query}`,
          usageKey: input.sourceIds.gbifTaxonKey,
          scientificName: input.canonicalName,
          canonicalName: input.scientificName,
          rank: "SPECIES",
          status: "ACCEPTED",
          confidence: 99,
          matchType: "EXACT",
          kingdom: "Plantae",
          family: input.family,
          genus: input.genus,
          species: input.scientificName,
        }),
        sourceOnlyFields: jsonValue({
          occurrenceData: {
            imported: false,
            reason:
              "OVE-82 consumes GBIF Backbone taxonomy only; occurrence coordinates remain raw/source-only by OVE-55.",
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
        version: `${input.sourceIds.eppoCode} taxon page verified 2026-07-01`,
        url: `https://gd.eppo.int/taxon/${input.sourceIds.eppoCode}`,
        license: "EPPO Codes Open Data Licence",
        licenseUrl: EPPO_OPEN_DATA_LICENSE_URL,
        attributionRequired: true,
        attributionText: "EPPO Codes, EPPO Codes Open Data Licence.",
        allowedUsage: ["raw_snapshot", "canonical_product_projection"],
        fetchedAt: VERIFIED_AT,
        verifiedAt: VERIFIED_AT,
      },
      record: {
        id: `EPPO:${input.sourceIds.eppoCode}`,
        rawPayload: jsonValue({
          endpoint: `https://gd.eppo.int/taxon/${input.sourceIds.eppoCode}`,
          eppoCode: input.sourceIds.eppoCode,
          preferredName: input.scientificName,
          authority: "Linnaeus",
        }),
        sourceOnlyFields: jsonValue({
          nonProjectedDistributionText:
            "Distribution/native-range text is retained only in source provenance for OVE-82.",
          nonProjectedCommonNames: input.reviewAliases
            .filter((alias) => alias.sourceSlug === "eppo-codes")
            .map((alias) => alias.displayName),
        }),
      },
    },
    {
      source: {
        slug: "wikidata",
        name: "Wikidata EntityData",
        category: "species_alias_support",
        version: `${input.sourceIds.wikidataId} live EntityData verified 2026-07-01`,
        url: `https://www.wikidata.org/wiki/Special:EntityData/${input.sourceIds.wikidataId}.json`,
        license: "CC0 1.0 Universal",
        licenseUrl: CC0_1_LICENSE_URL,
        attributionRequired: false,
        attributionText: null,
        allowedUsage: ["raw_snapshot", "canonical_product_projection"],
        fetchedAt: VERIFIED_AT,
        verifiedAt: VERIFIED_AT,
      },
      record: {
        id: `Wikidata:${input.sourceIds.wikidataId}`,
        rawPayload: jsonValue({
          endpoint: `https://www.wikidata.org/wiki/Special:EntityData/${input.sourceIds.wikidataId}.json`,
          id: input.sourceIds.wikidataId,
          labels: input.wikidataLabels,
          aliases: {
            en: [
              input.scientificName,
              ...input.acceptedVernacularAliases
                .filter((alias) => alias.locale === "en")
                .map((alias) => alias.displayName),
              ...input.reviewAliases
                .filter((alias) => alias.locale === "en")
                .map((alias) => alias.displayName),
            ],
            uk: [
              input.scientificName,
              ...input.acceptedVernacularAliases
                .filter((alias) => alias.locale === "uk")
                .map((alias) => alias.displayName),
              ...input.reviewAliases
                .filter((alias) => alias.locale === "uk")
                .map((alias) => alias.displayName),
            ],
            bg: [
              input.scientificName,
              ...input.acceptedVernacularAliases
                .filter((alias) => alias.locale === "bg")
                .map((alias) => alias.displayName),
              ...input.reviewAliases
                .filter((alias) => alias.locale === "bg")
                .map((alias) => alias.displayName),
            ],
          },
        }),
        sourceOnlyFields: jsonValue({
          nonProjectedAliases: {
            reviewNeeded: input.reviewAliases.map((alias) => ({
              displayName: alias.displayName,
              locale: alias.locale,
            })),
            rejected: input.rejectedAliases.map((alias) => ({
              displayName: alias.displayName,
              locale: alias.locale,
            })),
            reason:
              "OVE-82 projects only reviewed gardener-facing aliases; ambiguous and unsupported mappings stay in curation.",
          },
        }),
      },
    },
  ];
}

function buildPlannedSpeciesBackboneAliasCandidates(
  input: PlannedSpeciesBackboneConceptInput,
  projection: SpeciesBackboneProjection,
): SpeciesBackboneAliasCandidate[] {
  const acceptedAliases: SpeciesBackboneAliasCandidate[] = [
    {
      displayName: input.canonicalName,
      normalizedName: normalizeCatalogName(input.canonicalName),
      locale: "la",
      script: "Latin",
      isPrimary: true,
      aliasKind: "accepted_scientific_name",
      status: "accepted",
      sourceSlug: "catalogue-of-life-checklistbank",
      sourceRecordKey: `CoL:${input.sourceIds.colDatasetAlias}:${input.sourceIds.colId}`,
      sourceMethod: "source_backed",
      confidence: 1,
      license: "Creative Commons Attribution 4.0 International",
      attributionRequired: true,
      projectionNotes:
        "Canonical accepted scientific name from CoL, corroborated by GBIF and EPPO.",
    },
    {
      displayName: input.scientificName,
      normalizedName: normalizeCatalogName(input.scientificName),
      locale: "la",
      script: "Latin",
      isPrimary: false,
      aliasKind: "accepted_scientific_name",
      status: "accepted",
      sourceSlug: "world-flora-online",
      sourceRecordKey: `WFO:2026-06:${input.sourceIds.wfoId}`,
      sourceMethod: "source_backed",
      confidence: 0.99,
      license: "CC0 1.0 Universal",
      attributionRequired: false,
      projectionNotes:
        "Authorship-free scientific alias accepted for search only; canonical display remains CoL-backed.",
    },
    ...input.acceptedVernacularAliases.map((alias) => ({
      displayName: alias.displayName,
      normalizedName: normalizeCatalogName(alias.displayName),
      locale: alias.locale,
      script: alias.script,
      isPrimary: false,
      aliasKind: "vernacular_alias" as const,
      status: "accepted" as const,
      sourceSlug: "wikidata",
      sourceRecordKey: `Wikidata:${input.sourceIds.wikidataId}`,
      sourceMethod: "source_backed" as const,
      confidence: 0.96,
      license: "CC0 1.0 Universal",
      attributionRequired: false,
      projectionNotes:
        "Reviewed gardener-facing local alias from Wikidata EntityData.",
    })),
  ];

  assertAcceptedAliasesMatchProjection(acceptedAliases, projection);

  return [
    ...acceptedAliases,
    ...input.reviewAliases.map((alias) => ({
      displayName: alias.displayName,
      normalizedName: normalizeCatalogName(alias.displayName),
      locale: alias.locale,
      script: alias.script,
      isPrimary: false,
      aliasKind: "vernacular_alias" as const,
      status: "review_needed" as const,
      sourceSlug: alias.sourceSlug,
      sourceRecordKey: alias.sourceRecordKey,
      sourceMethod: "source_backed" as const,
      confidence: alias.confidence,
      license:
        alias.sourceSlug === "eppo-codes"
          ? "EPPO Codes Open Data Licence"
          : "CC0 1.0 Universal",
      attributionRequired: alias.sourceSlug === "eppo-codes",
      projectionNotes: alias.projectionNotes,
    })),
    ...input.rejectedAliases.map((alias) => ({
      displayName: alias.displayName,
      normalizedName: normalizeCatalogName(alias.displayName),
      locale: alias.locale,
      script: alias.script,
      isPrimary: false,
      aliasKind: "vernacular_alias" as const,
      status: "rejected" as const,
      sourceSlug: "overgarden-curation",
      sourceRecordKey: null,
      sourceMethod: "curator" as const,
      confidence: 0.1,
      license: "OverGarden curator decision",
      attributionRequired: false,
      projectionNotes: alias.projectionNotes,
    })),
    ...input.generatedAliases.map((alias) => ({
      displayName: alias.displayName,
      normalizedName: normalizeCatalogName(alias.displayName),
      locale: alias.locale,
      script: alias.script,
      isPrimary: false,
      aliasKind: "generated_variant" as const,
      status: "generated" as const,
      sourceSlug: "overgarden-generated",
      sourceRecordKey: null,
      sourceMethod: "generated" as const,
      confidence: alias.confidence,
      license: "OverGarden generated candidate",
      attributionRequired: false,
      projectionNotes: alias.projectionNotes,
    })),
  ];
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
    catalogKind: "species",
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
  input: SpeciesBackboneProjectionInput = speciesBackboneSeedDefinition(),
): SpeciesBackboneProjection {
  return JSON.parse(
    stableJsonStringify(jsonValue(selectSpeciesBackboneProjection(input))),
  ) as SpeciesBackboneProjection;
}

export function speciesBackboneAllowedProjectionJson(
  input: SpeciesBackboneProjectionInput = speciesBackboneSeedDefinition(),
): JsonValue {
  return jsonValue(speciesBackboneAllowedProjection(input));
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

function selectSpeciesBackboneProjection(
  input: SpeciesBackboneProjectionInput,
): SpeciesBackboneProjection {
  if ("projection" in input) return input.projection;
  return input;
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
