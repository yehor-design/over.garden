import { describe, expect, it } from "vitest";

import {
  CATALOG_TYPEAHEAD_INDEX,
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
        locale: "uk",
        status: "seeded",
        source: "internal_seed",
      }),
    ).toEqual({
      id: "00000000-0000-4000-8000-000000000101",
      displayName: "Помідор чері",
      canonicalName: "Помідор чері",
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
        locale: "uk",
        status: "seeded",
        source: "ua_state_register",
        sourceRecordId: "00000000-0000-4000-8000-000000056003",
        rawPayloadSha256: "a".repeat(64),
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
          locale: "uk",
          status: "seeded",
          source: "internal_seed",
        },
        {
          id: "00000000-0000-4000-8000-000000000101",
          displayName: "Томат чері",
          canonicalName: "Помідор чері",
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
        locale: "uk",
        status: "seeded",
        source: "internal_seed",
      },
    ]);
  });
});
