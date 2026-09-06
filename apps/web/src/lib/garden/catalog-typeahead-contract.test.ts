import { describe, expect, it } from "vitest";

import {
  buildCatalogTypeaheadUrl,
  catalogItemIdForSelection,
  catalogLabelForSelection,
  parseCatalogTypeaheadResponse,
  parseCatalogTypeaheadState,
} from "./catalog-typeahead-contract";

describe("catalog typeahead picker contract", () => {
  it("keeps only the row shape the picker renders", () => {
    const rows = parseCatalogTypeaheadResponse({
      suggestions: [
        {
          id: "00000000-0000-4000-8000-000000161001",
          displayName: "Помідор",
          matchedName: "томат",
          kind: "species",
          publicPath: "/species/solanum-lycopersicum",
          canonicalName: "Solanum lycopersicum L.",
          status: "confirmed",
          source: "species_backbone",
          trustLabel: "Curated",
          sourceCaveat: "must-not-reach-picker-state",
          ownerUserId: "must-not-reach-picker-state",
          coordinates: [42.1, 23.3],
        },
        {
          id: "00000000-0000-4000-8000-000000161002",
          displayName: "Де Барао",
          kind: "cultivar",
          parentDisplayName: "Помідор",
          matchedName: "",
          publicPath: "//evil.example/variety/x",
        },
      ],
    });

    expect(rows).toEqual([
      {
        id: "00000000-0000-4000-8000-000000161001",
        displayName: "Помідор",
        matchedName: "томат",
        kind: "species",
        publicPath: "/species/solanum-lycopersicum",
      },
      {
        id: "00000000-0000-4000-8000-000000161002",
        displayName: "Де Барао",
        kind: "cultivar",
        parentDisplayName: "Помідор",
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(
      /canonicalName|status|source|trust|caveat|ownerUserId|coordinates|evil/,
    );
  });

  it("rejects malformed rows and unknown kinds", () => {
    expect(
      parseCatalogTypeaheadResponse({
        suggestions: [
          { id: "not-a-uuid", displayName: "x", kind: "species" },
          {
            id: "00000000-0000-4000-8000-000000161003",
            displayName: "   ",
            kind: "species",
          },
          {
            id: "00000000-0000-4000-8000-000000161004",
            displayName: "Unsafe",
            kind: "person",
          },
          null,
        ],
      }),
    ).toEqual([]);
    expect(parseCatalogTypeaheadResponse(null)).toEqual([]);
    expect(parseCatalogTypeaheadResponse({ suggestions: "nope" })).toEqual([]);
  });

  it("reads anything but an explicit ready or empty answer as unavailable", () => {
    expect(parseCatalogTypeaheadState({ state: "ready" })).toBe("ready");
    expect(parseCatalogTypeaheadState({ state: "empty" })).toBe("empty");
    expect(parseCatalogTypeaheadState({ state: "degraded" })).toBe(
      "unavailable",
    );
    expect(parseCatalogTypeaheadState(null)).toBe("unavailable");
  });

  it("maps a selection to exactly one of an identity or a label", () => {
    const item = {
      kind: "item" as const,
      row: {
        id: "00000000-0000-4000-8000-000000161001",
        displayName: "Помідор",
        kind: "species" as const,
      },
    };
    const ownName = { kind: "own_name" as const, name: "Де Барао" };

    expect(catalogItemIdForSelection(item)).toBe(
      "00000000-0000-4000-8000-000000161001",
    );
    expect(catalogLabelForSelection(item)).toBeNull();
    expect(catalogItemIdForSelection(ownName)).toBeNull();
    expect(catalogLabelForSelection(ownName)).toBe("Де Барао");
    expect(catalogItemIdForSelection(null)).toBeNull();
    expect(catalogLabelForSelection(null)).toBeNull();
  });

  it("builds the public route url with the kind and the locale, capped at 120 characters", () => {
    const url = buildCatalogTypeaheadUrl({
      query: "т".repeat(130),
      objectKind: "animal",
      locale: "bg",
    });
    const params = new URL(url, "http://localhost").searchParams;
    expect(url.startsWith("/api/public/catalog/typeahead?")).toBe(true);
    expect(params.get("q")).toHaveLength(120);
    expect(params.get("kind")).toBe("animal");
    expect(params.get("locale")).toBe("bg");
  });
});
