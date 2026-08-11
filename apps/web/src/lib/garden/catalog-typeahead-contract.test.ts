import { describe, expect, it } from "vitest";

import {
  catalogItemIdForSelection,
  parseCatalogTypeaheadResponse,
} from "./catalog-typeahead-contract";

describe("catalog typeahead picker contract", () => {
  it("keeps only the safe canonical selection shape for an approved alias", () => {
    const [selection] = parseCatalogTypeaheadResponse({
      suggestions: [
        {
          id: "00000000-0000-4000-8000-000000161001",
          displayName: "OVE161 Sun Tomato",
          canonicalName: "OVE161 Golden Tomato",
          catalogKind: "plant_variety",
          locale: "en",
          status: "confirmed",
          source: "internal_seed",
          suggestionEvidence: { matcherVersion: "private-worker-state" },
          ownerUserId: "must-not-reach-picker-state",
          journalBody: "must-not-reach-picker-state",
          coordinates: [42.1, 23.3],
        },
      ],
    });

    expect(selection).toEqual({
      id: "00000000-0000-4000-8000-000000161001",
      displayName: "OVE161 Sun Tomato",
      canonicalName: "OVE161 Golden Tomato",
      catalogKind: "plant_variety",
      locale: "en",
      status: "confirmed",
      source: "internal_seed",
      trustState: "curated",
      trustLabel: "Curated",
      sourceLabel: "OverGarden starter catalog",
      sourceCaveat:
        "Curated OverGarden identity. Compare the type and name before choosing.",
      disambiguationLabel: "Plant variety · OverGarden starter catalog · en",
    });
    expect(JSON.stringify(selection)).not.toMatch(
      /suggestionEvidence|ownerUserId|journalBody|coordinates|private-worker-state/,
    );
    expect(catalogItemIdForSelection(selection)).toBe(
      "00000000-0000-4000-8000-000000161001",
    );
  });

  it("rejects provisional, malformed, and unsupported picker rows", () => {
    expect(
      parseCatalogTypeaheadResponse({
        suggestions: [
          {
            id: "provisional-id",
            displayName: "Private provisional name",
            canonicalName: "Private provisional name",
            catalogKind: "plant_variety",
            locale: "und",
            status: "provisional",
            source: "user_added",
          },
          {
            id: "unsupported-kind",
            displayName: "Unsafe",
            canonicalName: "Unsafe",
            catalogKind: "person",
            locale: "uk",
            status: "confirmed",
            source: "internal_seed",
          },
        ],
      }),
    ).toEqual([]);
    expect(parseCatalogTypeaheadResponse(null)).toEqual([]);
    expect(catalogItemIdForSelection(null)).toBeNull();
  });
});
