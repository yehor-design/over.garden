import { createHash } from "node:crypto";

import type { JsonValue, PlantObjectKind } from "@/db/schema";

export const BREED_SEED_PARSER_VERSION =
  "ove-86.approved-breed-expansion.seed.v1";

const UA_VERIFIED_AT = "2026-06-30T00:00:00.000Z";
const VBO_VERIFIED_AT = "2026-07-02T00:00:00.000Z";

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
  fetchedAt: UA_VERIFIED_AT,
  verifiedAt: UA_VERIFIED_AT,
} as const;

export const VBO_BREED_SOURCE = {
  slug: "vertebrate-breed-ontology",
  name: "Vertebrate Breed Ontology curated supported-species subset",
  category: "breeds",
  version: "vbo-2026-04-15-ove-86-curated-subset",
  url: "https://purl.obolibrary.org/obo/vbo.obo",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attributionRequired: true,
  attributionText: "Vertebrate Breed Ontology, Monarch Initiative, CC BY 4.0.",
  allowedUsage: [
    "raw_snapshot",
    "canonical_product_projection",
    "approved_subset",
  ],
  fetchedAt: VBO_VERIFIED_AT,
  verifiedAt: VBO_VERIFIED_AT,
} as const;

export type BreedSeedSource =
  | typeof UA_OFFICIAL_BEE_BREED_SOURCE
  | typeof VBO_BREED_SOURCE;

export type BreedSeedProductSource =
  | "ua_official_bee_breed"
  | "vertebrate_breed_ontology";

export interface BreedSeedProjection {
  canonicalName: string;
  normalizedName: string;
  publicSlug: string;
  catalogKind: "breed";
  status: "seeded";
  source: BreedSeedProductSource;
  sourceId: string;
  locale: "uk" | "en";
  sourceIds: {
    officialBeeRef: string | null;
    vboId: string | null;
    dadIsRef: null;
    efabisRef: null;
    supportedObjectKind: Extract<PlantObjectKind, "animal">;
    speciesGroup: string;
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
  status: "accepted" | "review_needed" | "rejected";
  sourceSlug: string;
  sourceRecordKey: string | null;
  sourceMethod: "manual_seed" | "ontology_seed";
  confidence: number;
  license: string;
  attributionRequired: boolean;
  projectionNotes: string;
}

export interface BreedSeedConcept {
  source: BreedSeedSource;
  record: {
    id: string;
    rawPayload: JsonValue;
    sourceOnlyFields: JsonValue;
  };
  projection: BreedSeedProjection;
  aliasCandidates: BreedSeedAliasCandidate[];
}

export interface BreedSeedImportDefinition {
  source: typeof UA_OFFICIAL_BEE_BREED_SOURCE;
  vboSource: typeof VBO_BREED_SOURCE;
  concepts: BreedSeedConcept[];
  record: BreedSeedConcept["record"];
  projection: BreedSeedProjection;
  aliasCandidates: BreedSeedAliasCandidate[];
}

interface BeeBreedInput {
  key: string;
  canonicalName: string;
  shorthandName: string;
  englishDisplayName: string;
  latinReviewCandidates: string[];
}

interface VboBreedInput {
  vboId: string;
  canonicalName: string;
  displayAlias: string;
  publicSlug: string;
  speciesGroup: string;
  parentTerm: string;
  sourceProof: string[];
  reviewOnlyAliases: string[];
}

export function breedSeedDefinition(): BreedSeedImportDefinition {
  const concepts = [
    ...buildOfficialBeeBreedConcepts(),
    ...buildVboBreedConcepts(),
  ];
  const primary = concepts[0];

  return {
    source: UA_OFFICIAL_BEE_BREED_SOURCE,
    vboSource: VBO_BREED_SOURCE,
    concepts,
    record: primary.record,
    projection: primary.projection,
    aliasCandidates: concepts.flatMap((concept) => concept.aliasCandidates),
  };
}

export function breedSeedConcepts(
  definition = breedSeedDefinition(),
): BreedSeedConcept[] {
  return definition.concepts;
}

export function breedSeedSources(
  definition = breedSeedDefinition(),
): BreedSeedSource[] {
  const seen = new Set<string>();
  return definition.concepts.flatMap((concept) => {
    if (seen.has(concept.source.slug)) return [];
    seen.add(concept.source.slug);
    return [concept.source];
  });
}

export function breedSeedSourceConcepts(
  sourceSlug: string,
  definition = breedSeedDefinition(),
): BreedSeedConcept[] {
  return definition.concepts.filter(
    (concept) => concept.source.slug === sourceSlug,
  );
}

export function breedSeedSourceBySlug(
  sourceSlug: string,
  definition = breedSeedDefinition(),
): BreedSeedSource {
  const source = breedSeedSources(definition).find(
    (candidate) => candidate.slug === sourceSlug,
  );
  if (!source) throw new Error(`Unknown breed seed source: ${sourceSlug}`);
  return source;
}

export function breedSeedConceptByRecordId(
  recordId: string,
  definition = breedSeedDefinition(),
): BreedSeedConcept {
  const concept = definition.concepts.find(
    (candidate) => candidate.record.id === recordId,
  );
  if (!concept) throw new Error(`Unknown breed seed record: ${recordId}`);
  return concept;
}

export function buildBreedSeedProjection(): BreedSeedProjection {
  return breedSeedDefinition().projection;
}

export function buildBreedSeedAliasCandidates(
  projection = buildBreedSeedProjection(),
): BreedSeedAliasCandidate[] {
  const concept = breedSeedDefinition().concepts.find(
    (candidate) => candidate.projection.sourceId === projection.sourceId,
  );
  return concept?.aliasCandidates ?? [];
}

export function breedSeedSnapshotChecksum(
  definition = breedSeedDefinition(),
  sourceSlug: string = definition.source.slug,
) {
  const source = breedSeedSourceBySlug(sourceSlug, definition);
  const concepts = breedSeedSourceConcepts(sourceSlug, definition);

  return sha256Hex(
    stableJsonStringify(
      jsonValue({
        source,
        recordIds: concepts.map((concept) => concept.record.id),
        projections: concepts.map((concept) => concept.projection),
      }),
    ),
  );
}

export function breedSeedPayloadChecksum(
  definition = breedSeedDefinition(),
  concept = definition.concepts[0],
) {
  return breedSeedConceptPayloadChecksum(concept);
}

export function breedSeedConceptPayloadChecksum(concept: BreedSeedConcept) {
  return sha256Hex(stableJsonStringify(concept.record.rawPayload));
}

export function breedSeedAllowedProjection(
  definition = breedSeedDefinition(),
  concept = definition.concepts[0],
): BreedSeedProjection {
  return JSON.parse(
    stableJsonStringify(jsonValue(concept.projection)),
  ) as BreedSeedProjection;
}

export function breedSeedAllowedProjectionJson(
  definition = breedSeedDefinition(),
  concept = definition.concepts[0],
): JsonValue {
  return jsonValue(breedSeedAllowedProjection(definition, concept));
}

export function breedSeedAllowedUsage(
  definition = breedSeedDefinition(),
  source: BreedSeedSource = definition.source,
): JsonValue {
  return jsonValue(source.allowedUsage);
}

export function breedSeedRawPayload(
  definition = breedSeedDefinition(),
  concept = definition.concepts[0],
): JsonValue {
  return concept.record.rawPayload;
}

export function breedSeedSourceOnlyFields(
  definition = breedSeedDefinition(),
  concept = definition.concepts[0],
): JsonValue {
  return concept.record.sourceOnlyFields;
}

function buildOfficialBeeBreedConcepts(): BreedSeedConcept[] {
  const breeds: BeeBreedInput[] = [
    {
      key: "carpathian",
      canonicalName: "Карпатська бджола",
      shorthandName: "Карпатська",
      englishDisplayName: "Carpathian honey bee",
      latinReviewCandidates: [
        "Apis mellifera carpatica",
        "Apis mellifera carnica",
      ],
    },
    {
      key: "ukrainian-steppe",
      canonicalName: "Українська степова бджола",
      shorthandName: "Українська степова",
      englishDisplayName: "Ukrainian Steppe honey bee",
      latinReviewCandidates: ["Apis mellifera macedonica"],
    },
    {
      key: "polissian",
      canonicalName: "Поліська бджола",
      shorthandName: "Поліська",
      englishDisplayName: "Polissian honey bee",
      latinReviewCandidates: ["Apis mellifera mellifera"],
    },
  ];

  return breeds.map((breed) => {
    const sourceRecordKey = `ua-law-1492-iii:bee-breed:${breed.key}`;
    const projection = buildOfficialBeeBreedProjection(breed, sourceRecordKey);

    return {
      source: UA_OFFICIAL_BEE_BREED_SOURCE,
      record: {
        id: sourceRecordKey,
        rawPayload: jsonValue({
          lawCitation:
            "Про бджільництво : Закон України від 22.02.2000 № 1492-III",
          lawUrl: UA_OFFICIAL_BEE_BREED_SOURCE.url,
          accessDate: "2026-06-30",
          manualSeedBasis:
            "OVE-86 extends the OVE-60 official/manual bee breed seed only within the maintained official breed set; DAD-IS/EFABIS remains validation-only.",
          officialManualBreedSet: breeds.map((item) => item.canonicalName),
          selectedBreed: {
            officialName: breed.canonicalName,
            shorthandName: breed.shorthandName,
            englishDisplayName: breed.englishDisplayName,
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
            candidatesHeldForCuration: breed.latinReviewCandidates,
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
      aliasCandidates: buildOfficialBeeBreedAliasCandidates(
        projection,
        sourceRecordKey,
        breed.latinReviewCandidates,
      ),
    };
  });
}

function buildOfficialBeeBreedProjection(
  breed: BeeBreedInput,
  sourceRecordKey: string,
): BreedSeedProjection {
  const aliases = dedupeAliases([
    {
      displayName: breed.canonicalName,
      locale: "uk",
      isPrimary: true,
    },
    {
      displayName: breed.shorthandName,
      locale: "uk",
      isPrimary: false,
    },
    {
      displayName: breed.englishDisplayName,
      locale: "en",
      isPrimary: false,
    },
  ]);

  return {
    canonicalName: breed.canonicalName,
    normalizedName: normalizeCatalogName(breed.canonicalName),
    publicSlug:
      breed.key === "carpathian"
        ? "karpatska-bdzhola-ua-official-breed"
        : `${breed.key}-ua-official-breed`,
    catalogKind: "breed",
    status: "seeded",
    source: "ua_official_bee_breed",
    sourceId: `ua-official-bee-breeds:${breed.key}`,
    locale: "uk",
    sourceIds: {
      officialBeeRef: sourceRecordKey,
      vboId: null,
      dadIsRef: null,
      efabisRef: null,
      supportedObjectKind: "animal",
      speciesGroup: "Apis mellifera",
    },
    aliases,
  };
}

function buildOfficialBeeBreedAliasCandidates(
  projection: BreedSeedProjection,
  sourceRecordKey: string,
  latinReviewCandidates: string[],
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
    sourceRecordKey,
    sourceMethod: "manual_seed" as const,
    confidence: alias.isPrimary ? 1 : 0.94,
    license: UA_OFFICIAL_BEE_BREED_SOURCE.license,
    attributionRequired: UA_OFFICIAL_BEE_BREED_SOURCE.attributionRequired,
    projectionNotes:
      "Manual official bee breed seed; safe display alias projected to typeahead.",
  }));

  const reviewNeeded = latinReviewCandidates.map((candidate, index) => ({
    displayName: candidate,
    normalizedName: normalizeCatalogName(candidate),
    locale: "la",
    script: "Latin" as const,
    isPrimary: false,
    aliasKind: "accepted_scientific_name" as const,
    status: "review_needed" as const,
    sourceSlug: UA_OFFICIAL_BEE_BREED_SOURCE.slug,
    sourceRecordKey,
    sourceMethod: "manual_seed" as const,
    confidence: index === 0 ? 0.5 : 0.4,
    license: UA_OFFICIAL_BEE_BREED_SOURCE.license,
    attributionRequired: UA_OFFICIAL_BEE_BREED_SOURCE.attributionRequired,
    projectionNotes:
      "Held for curator review because Latin/subspecies mapping is disputed.",
  }));

  return [...accepted, ...reviewNeeded];
}

function buildVboBreedConcepts(): BreedSeedConcept[] {
  const breeds: VboBreedInput[] = [
    {
      vboId: "VBO:0017006",
      canonicalName: "Ukrainian Grey (Cattle)",
      displayAlias: "Ukrainian Grey",
      publicSlug: "ukrainian-grey-cattle-vbo-breed",
      speciesGroup: "Cattle",
      parentTerm: "VBO:0400020 Cattle breed",
      sourceProof: ["LBO:0000260", "ORCID contributor-backed VBO term"],
      reviewOnlyAliases: ["Українська сіра", "Ukrainian Gray"],
    },
    {
      vboId: "VBO:0017634",
      canonicalName: "Bulgarian Rhodope (Cattle)",
      displayAlias: "Bulgarian Rhodope",
      publicSlug: "bulgarian-rhodope-cattle-vbo-breed",
      speciesGroup: "Cattle",
      parentTerm: "VBO:0400020 Cattle breed",
      sourceProof: [
        "ISBN:978-1-78924-153-2",
        "https://environmentyou.au-plovdiv.bg/en/project/cattle/",
      ],
      reviewOnlyAliases: [
        "Bulgarian Rhodope Cattle",
        "Българско родопско говедо",
      ],
    },
  ];

  return breeds.map((breed) => {
    const projection = buildVboBreedProjection(breed);

    return {
      source: VBO_BREED_SOURCE,
      record: {
        id: breed.vboId,
        rawPayload: jsonValue({
          ontologyId: "vbo",
          ontologyVersion: "2026-04-15",
          vboId: breed.vboId,
          termName: breed.canonicalName,
          subsetBasis:
            "OVE-86 curated supported-species mapping from the approved VBO source; no bulk DAD-IS/EFABIS product ingestion.",
          parentTerm: breed.parentTerm,
          sourceProof: breed.sourceProof,
        }),
        sourceOnlyFields: jsonValue({
          unsupportedBranchesNotImported: true,
          localizedLabels: {
            projectedToTypeahead: false,
            reviewOnlyAliases: breed.reviewOnlyAliases,
            reason:
              "VBO is English-only for this gate; Ukrainian/Bulgarian labels require explicit operator review before projection.",
          },
          dadIsEfabisInternalValidation: {
            usedForProjection: false,
            productIngestionAllowed: false,
            reason:
              "Country-reported DAD-IS/EFABIS rows and validation notes are not product-projected by OVE-86.",
          },
          restrictedFields: {
            distributionCoordinatesStored: false,
            occurrenceCoordinatesStored: false,
            sourceOnlyPayloadLeavesRawTablesOnly: true,
          },
        }),
      },
      projection,
      aliasCandidates: buildVboBreedAliasCandidates(projection, breed),
    };
  });
}

function buildVboBreedProjection(breed: VboBreedInput): BreedSeedProjection {
  const aliases = dedupeAliases([
    {
      displayName: breed.canonicalName,
      locale: "en",
      isPrimary: true,
    },
    {
      displayName: breed.displayAlias,
      locale: "en",
      isPrimary: false,
    },
  ]);

  return {
    canonicalName: breed.canonicalName,
    normalizedName: normalizeCatalogName(breed.canonicalName),
    publicSlug: breed.publicSlug,
    catalogKind: "breed",
    status: "seeded",
    source: "vertebrate_breed_ontology",
    sourceId: breed.vboId,
    locale: "en",
    sourceIds: {
      officialBeeRef: null,
      vboId: breed.vboId,
      dadIsRef: null,
      efabisRef: null,
      supportedObjectKind: "animal",
      speciesGroup: breed.speciesGroup,
    },
    aliases,
  };
}

function buildVboBreedAliasCandidates(
  projection: BreedSeedProjection,
  breed: VboBreedInput,
): BreedSeedAliasCandidate[] {
  const accepted = projection.aliases.map((alias) => ({
    displayName: alias.displayName,
    normalizedName: alias.normalizedName,
    locale: alias.locale,
    script: "Latin" as const,
    isPrimary: alias.isPrimary,
    aliasKind: "vernacular_alias" as const,
    status: "accepted" as const,
    sourceSlug: VBO_BREED_SOURCE.slug,
    sourceRecordKey: breed.vboId,
    sourceMethod: "ontology_seed" as const,
    confidence: alias.isPrimary ? 1 : 0.96,
    license: VBO_BREED_SOURCE.license,
    attributionRequired: VBO_BREED_SOURCE.attributionRequired,
    projectionNotes:
      "Approved VBO vertebrate breed label with supported animal object-kind mapping.",
  }));

  const reviewOnly = breed.reviewOnlyAliases.map((alias) => ({
    displayName: alias,
    normalizedName: normalizeCatalogName(alias),
    locale: /[А-Яа-яІіЇїЄєҐґ]/.test(alias) ? "uk" : "en",
    script: /[А-Яа-яІіЇїЄєҐґ]/.test(alias)
      ? ("Cyrillic" as const)
      : ("Latin" as const),
    isPrimary: false,
    aliasKind: "vernacular_alias" as const,
    status: "review_needed" as const,
    sourceSlug: VBO_BREED_SOURCE.slug,
    sourceRecordKey: breed.vboId,
    sourceMethod: "ontology_seed" as const,
    confidence: 0.55,
    license: VBO_BREED_SOURCE.license,
    attributionRequired: VBO_BREED_SOURCE.attributionRequired,
    projectionNotes:
      "Held for operator review because OVE-86 does not approve generated/localized breed labels.",
  }));

  return [...accepted, ...reviewOnly];
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
