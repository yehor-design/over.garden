import { describe, expect, it } from "vitest";

import {
  CATALOG_TYPEAHEAD_INDEX,
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
    isGeneratedAlias: false,
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
      id: "00000000-0000-4000-8000-000000000101-158355993c15b26d5715715b",
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
      serveClass: "exact",
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
      id: "00000000-0000-4000-8000-000000000301-a3966f5cde1445beb1fd2999",
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
      serveClass: "exact",
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

  it("marks an accepted generated alias without exposing generator provenance", () => {
    const document = toCatalogTypeaheadDocument(
      catalogRow({ isGeneratedAlias: true }),
    );

    expect(document).toMatchObject({ serveClass: "generated" });
    expect(document).not.toHaveProperty("sourceMethod");
    expect(document).not.toHaveProperty("generatorVersion");
    expect(document).not.toHaveProperty("confidence");
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
});
