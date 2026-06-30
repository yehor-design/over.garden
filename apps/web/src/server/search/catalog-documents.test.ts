import { describe, expect, it } from "vitest";

import {
  CATALOG_TYPEAHEAD_INDEX,
  catalogTypeaheadSuggestionDedupeKey,
  catalogTypeaheadHitToSuggestion,
  dedupeCatalogTypeaheadSuggestions,
  toCatalogTypeaheadDocument,
  type CatalogTypeaheadRow,
} from "./catalog-documents";

function catalogRow(
  overrides: Partial<CatalogTypeaheadRow> = {},
): CatalogTypeaheadRow {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    canonicalName: "Помідор чері",
    normalizedName: "помідор чері",
    catalogKind: "plant_variety",
    status: "seeded",
    source: "internal_seed",
    createdByUserId: null,
    itemLocale: "uk",
    displayName: "Томат чері",
    aliasNormalizedName: "томат чері",
    aliasLocale: "uk",
    isPrimary: false,
    ...overrides,
  };
}

describe("catalog typeahead search documents", () => {
  it("uses the dedicated derived catalog index", () => {
    expect(CATALOG_TYPEAHEAD_INDEX).toBe("catalog_typeahead");
  });

  it("indexes only public catalog identity fields for seeded or confirmed rows", () => {
    const document = toCatalogTypeaheadDocument(catalogRow());

    expect(document).toEqual({
      id: "00000000-0000-4000-8000-000000000101:uk:%D1%82%D0%BE%D0%BC%D0%B0%D1%82%20%D1%87%D0%B5%D1%80%D1%96",
      catalogItemId: "00000000-0000-4000-8000-000000000101",
      displayName: "Томат чері",
      canonicalName: "Помідор чері",
      normalizedName: "томат чері",
      catalogKind: "plant_variety",
      locale: "uk",
      itemLocale: "uk",
      status: "seeded",
      source: "internal_seed",
      isPrimary: false,
      rank: 10,
      kind: "catalog_item",
    });
    expect(document).not.toHaveProperty("createdByUserId");
    expect(document).not.toHaveProperty("ownerUserId");
    expect(document).not.toHaveProperty("journalText");
    expect(document).not.toHaveProperty("coordinates");
    expect(document).not.toHaveProperty("mediaMetadata");
    expect(document).not.toHaveProperty("rawPayload");
    expect(document).not.toHaveProperty("sourceOnlyFields");
    expect(document).not.toHaveProperty("sourceRecordId");
  });

  it("indexes species backbone aliases without source IDs or raw provenance", () => {
    const document = toCatalogTypeaheadDocument(
      catalogRow({
        id: "00000000-0000-4000-8000-000000000301",
        canonicalName: "Solanum lycopersicum L.",
        normalizedName: "solanum lycopersicum l.",
        source: "species_backbone",
        catalogKind: "species",
        itemLocale: "la",
        displayName: "помідор",
        aliasNormalizedName: "помідор",
        aliasLocale: "uk",
        isPrimary: false,
      }),
    );

    expect(document).toEqual({
      id: "00000000-0000-4000-8000-000000000301:uk:%D0%BF%D0%BE%D0%BC%D1%96%D0%B4%D0%BE%D1%80",
      catalogItemId: "00000000-0000-4000-8000-000000000301",
      displayName: "помідор",
      canonicalName: "Solanum lycopersicum L.",
      normalizedName: "помідор",
      catalogKind: "species",
      locale: "uk",
      itemLocale: "la",
      status: "seeded",
      source: "species_backbone",
      isPrimary: false,
      rank: 10,
      kind: "catalog_item",
    });
    expect(document).not.toHaveProperty("colId");
    expect(document).not.toHaveProperty("wfoId");
    expect(document).not.toHaveProperty("gbifTaxonKey");
    expect(document).not.toHaveProperty("eppoCode");
    expect(document).not.toHaveProperty("wikidataId");
    expect(document).not.toHaveProperty("aliasStatus");
    expect(document).not.toHaveProperty("aliasKind");
    expect(document).not.toHaveProperty("sourceMethod");
    expect(document).not.toHaveProperty("confidence");
    expect(document).not.toHaveProperty("license");
    expect(document).not.toHaveProperty("licenseUrl");
    expect(document).not.toHaveProperty("attributionRequired");
    expect(document).not.toHaveProperty("attributionText");
    expect(document).not.toHaveProperty("sourceCredits");
    expect(document).not.toHaveProperty("sourceRecordKey");
    expect(document).not.toHaveProperty("coordinates");
    expect(document).not.toHaveProperty("rawPayload");
  });

  it("indexes breed aliases as breed documents without validation-only source IDs", () => {
    const document = toCatalogTypeaheadDocument(
      catalogRow({
        id: "00000000-0000-4000-8000-000000000601",
        canonicalName: "Карпатська бджола",
        normalizedName: "карпатська бджола",
        catalogKind: "breed",
        source: "ua_official_bee_breed",
        itemLocale: "uk",
        displayName: "Карпатська",
        aliasNormalizedName: "карпатська",
        aliasLocale: "uk",
        isPrimary: false,
      }),
    );

    expect(document).toMatchObject({
      catalogItemId: "00000000-0000-4000-8000-000000000601",
      displayName: "Карпатська",
      canonicalName: "Карпатська бджола",
      catalogKind: "breed",
      locale: "uk",
      itemLocale: "uk",
      status: "seeded",
      source: "ua_official_bee_breed",
      kind: "catalog_item",
    });
    expect(document).not.toHaveProperty("vboId");
    expect(document).not.toHaveProperty("dadIsRef");
    expect(document).not.toHaveProperty("efabisRef");
    expect(document).not.toHaveProperty("officialBeeRef");
    expect(document).not.toHaveProperty("sourceOnlyFields");
    expect(document).not.toHaveProperty("rawPayload");
  });

  it("does not index provisional user-added catalog rows", () => {
    expect(
      toCatalogTypeaheadDocument(
        catalogRow({
          status: "provisional",
          source: "user_added",
          createdByUserId: "00000000-0000-0000-0000-000000000001",
        }),
      ),
    ).toBeNull();
  });

  it("does not index owner-scoped rows even if their status was later changed", () => {
    expect(
      toCatalogTypeaheadDocument(
        catalogRow({
          status: "confirmed",
          createdByUserId: "00000000-0000-0000-0000-000000000001",
        }),
      ),
    ).toBeNull();
  });

  it("maps safe Meili hits back to selectable catalog suggestions", () => {
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000101",
        displayName: "Помідор чері",
        canonicalName: "Помідор чері",
        catalogKind: "plant_variety",
        locale: "uk",
        status: "seeded",
        source: "internal_seed",
      }),
    ).toEqual({
      id: "00000000-0000-4000-8000-000000000101",
      displayName: "Помідор чері",
      canonicalName: "Помідор чері",
      catalogKind: "plant_variety",
      locale: "uk",
      status: "seeded",
      source: "internal_seed",
    });
  });

  it("rejects unsafe Meili hits instead of leaking them into typeahead", () => {
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000201",
        displayName: "Бабусин перець",
        canonicalName: "Бабусин перець",
        catalogKind: "plant_variety",
        locale: "und",
        status: "provisional",
        source: "user_added",
        createdByUserId: "00000000-0000-0000-0000-000000000001",
        journalBody: "private note",
        rawPayload: { varietyName: "Бабусин перець" },
        sourceOnlyFields: { occurrenceCoordinates: [50.45, 30.52] },
      }),
    ).toBeNull();
  });

  it("rejects raw catalog source fields even on otherwise selectable hits", () => {
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000101",
        displayName: "Bergeron 1",
        canonicalName: "Bergeron 1",
        catalogKind: "plant_variety",
        locale: "uk",
        status: "seeded",
        source: "ua_state_register",
        sourceRecordId: "00000000-0000-4000-8000-000000056003",
        rawPayloadSha256: "a".repeat(64),
      }),
    ).toBeNull();
  });

  it("rejects species backbone hits that carry source IDs or occurrence fields", () => {
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000301",
        displayName: "помідор",
        canonicalName: "Solanum lycopersicum L.",
        catalogKind: "species",
        locale: "uk",
        status: "seeded",
        source: "species_backbone",
        sourceRecordKey: "GBIF:species:2930137",
        gbifTaxonKey: 2930137,
        coordinates: [50.4501, 30.5234],
      }),
    ).toBeNull();
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000301",
        displayName: "Tomato",
        canonicalName: "Solanum lycopersicum L.",
        catalogKind: "species",
        locale: "en",
        status: "seeded",
        source: "species_backbone",
        gbifTaxonKey: 2930137,
      }),
    ).toBeNull();
  });

  it("rejects species backbone hits that carry alias curation metadata", () => {
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000301",
        displayName: "помідор",
        canonicalName: "Solanum lycopersicum L.",
        catalogKind: "species",
        locale: "uk",
        status: "seeded",
        source: "species_backbone",
        aliasStatus: "accepted",
        aliasKind: "vernacular_alias",
        sourceMethod: "source_backed",
        confidence: 0.98,
        license: "CC0 1.0 Universal",
        attributionRequired: false,
      }),
    ).toBeNull();
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000301",
        displayName: "garden tomato",
        canonicalName: "Solanum lycopersicum L.",
        catalogKind: "species",
        locale: "en",
        status: "seeded",
        source: "species_backbone",
        alias_status: "review_needed",
        projection_notes: "held for curator review",
      }),
    ).toBeNull();
  });

  it("rejects source attribution credits if they appear in typeahead hits", () => {
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000301",
        displayName: "Solanum lycopersicum L.",
        canonicalName: "Solanum lycopersicum L.",
        catalogKind: "species",
        locale: "la",
        status: "seeded",
        source: "species_backbone",
        sourceName: "GBIF Backbone Taxonomy",
        sourceUrl: "https://api.gbif.org/v1/species/match",
        sourceVersion: "Backbone pubDate 2023-08-28",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attributionText:
          "GBIF Backbone Taxonomy, Creative Commons Attribution 4.0 International.",
      }),
    ).toBeNull();
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000057",
        displayName: "Ботсадівський",
        canonicalName: "Ботсадівський",
        catalogKind: "plant_variety",
        locale: "uk",
        status: "seeded",
        source: "ua_state_register",
        sourceCredits: [
          {
            sourceName: "Ukraine State Register of Plant Varieties",
            license: "Creative Commons Attribution 4.0 International",
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects breed hits that carry VBO, DAD-IS, EFABIS, or manual source-only fields", () => {
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000601",
        displayName: "Карпатська",
        canonicalName: "Карпатська бджола",
        catalogKind: "breed",
        locale: "uk",
        status: "seeded",
        source: "ua_official_bee_breed",
        dadIsRef: "DAD-IS:internal-only",
      }),
    ).toBeNull();
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000601",
        displayName: "Карпатська бджола",
        canonicalName: "Карпатська бджола",
        catalogKind: "breed",
        locale: "uk",
        status: "seeded",
        source: "ua_official_bee_breed",
        internalValidation: { dadIsEfabis: true },
      }),
    ).toBeNull();
  });

  it("rejects BG/EU official variety hits that carry parser or legal metadata", () => {
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000611",
        displayName: "Садово 1",
        canonicalName: "Садово 1",
        catalogKind: "plant_variety",
        locale: "bg",
        status: "seeded",
        source: "eu_common_catalogue_bg",
        sourceId: "EU-PVP:BG:SADOVO-1",
        parserConfidence: 0.9825,
        sourceRowReference: "Country / Org BG; Denomination Sadovo 1",
      }),
    ).toBeNull();
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000611",
        displayName: "Sadovo 1",
        canonicalName: "Садово 1",
        catalogKind: "plant_variety",
        locale: "en",
        status: "seeded",
        source: "eu_common_catalogue_bg",
        legal_value_caveat: "information only",
        iasas_parser_blocker: "PDF-only",
      }),
    ).toBeNull();
  });

  it("rejects genebank candidate hits that carry accession or review metadata", () => {
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000621",
        displayName: "Red Cherry",
        canonicalName: "Red Cherry tomato",
        catalogKind: "plant_variety",
        locale: "en",
        status: "seeded",
        source: "grin_genebank_candidate",
        accessionIdentifier: "GRIN curated proof row OVE62-001",
        candidateKind: "accession",
        reviewStatus: "candidate_review",
      }),
    ).toBeNull();
    expect(
      catalogTypeaheadHitToSuggestion({
        catalogItemId: "00000000-0000-4000-8000-000000000621",
        displayName: "Solanum lycopersicum Red Cherry",
        canonicalName: "Red Cherry tomato",
        catalogKind: "plant_variety",
        locale: "la",
        status: "seeded",
        source: "grin_genebank_candidate",
        germplasm_distribution_policy: "source-only distribution caveat",
        genesys_eurisco_blocker: "internal-validation-only",
      }),
    ).toBeNull();
  });

  it("dedupes aliases by catalog item ID to keep the picker stable", () => {
    expect(
      dedupeCatalogTypeaheadSuggestions([
        {
          id: "00000000-0000-4000-8000-000000000101",
          displayName: "Помідор чері",
          canonicalName: "Помідор чері",
          catalogKind: "plant_variety",
          locale: "uk",
          status: "seeded",
          source: "internal_seed",
        },
        {
          id: "00000000-0000-4000-8000-000000000101",
          displayName: "Томат чері",
          canonicalName: "Помідор чері",
          catalogKind: "plant_variety",
          locale: "uk",
          status: "seeded",
          source: "internal_seed",
        },
      ]),
    ).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000101",
        displayName: "Помідор чері",
        canonicalName: "Помідор чері",
        catalogKind: "plant_variety",
        locale: "uk",
        status: "seeded",
        source: "internal_seed",
      },
    ]);
  });

  it("dedupes source-backed duplicate proof fixtures by canonical concept", () => {
    expect(
      dedupeCatalogTypeaheadSuggestions([
        {
          id: "00000000-0000-4000-8000-000000056002",
          displayName: "Bergeron 1",
          canonicalName: "Bergeron 1",
          catalogKind: "plant_variety",
          locale: "uk",
          status: "seeded",
          source: "ua_state_register",
        },
        {
          id: "00000000-0000-4000-8000-000000064002",
          displayName: "Bergeron 1",
          canonicalName: "Bergeron 1",
          catalogKind: "plant_variety",
          locale: "uk",
          status: "seeded",
          source: "ua_state_register",
        },
      ]),
    ).toEqual([
      {
        id: "00000000-0000-4000-8000-000000056002",
        displayName: "Bergeron 1",
        canonicalName: "Bergeron 1",
        catalogKind: "plant_variety",
        locale: "uk",
        status: "seeded",
        source: "ua_state_register",
      },
    ]);
  });

  it("does not collapse non-source-backed rows just because names match", () => {
    const left = {
      id: "00000000-0000-4000-8000-000000000701",
      displayName: "Red Cherry",
      canonicalName: "Red Cherry",
      catalogKind: "plant_variety" as const,
      locale: "en",
      status: "seeded" as const,
      source: "internal_seed",
    };
    const right = {
      ...left,
      id: "00000000-0000-4000-8000-000000000702",
    };

    expect(catalogTypeaheadSuggestionDedupeKey(left)).toBe(
      "catalog-item:00000000-0000-4000-8000-000000000701",
    );
    expect(dedupeCatalogTypeaheadSuggestions([left, right])).toEqual([
      left,
      right,
    ]);
  });
});
