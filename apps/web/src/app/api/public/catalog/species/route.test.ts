import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchStandardSpeciesForTypeahead: vi.fn(),
  searchCatalogSuggestionsForTypeaheadResult: vi.fn(),
  connection: vi.fn(async () => undefined),
}));

vi.mock("next/server", () => ({
  connection: mocks.connection,
}));

vi.mock("@/server/catalog-repository", () => ({
  searchStandardSpeciesForTypeahead: mocks.searchStandardSpeciesForTypeahead,
  searchCatalogSuggestionsForTypeaheadResult:
    mocks.searchCatalogSuggestionsForTypeaheadResult,
}));

describe("GET /api/public/catalog/species (OVE-524)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("answers the standard base's species, never the whole catalogue, with the picker's short public cache", async () => {
    mocks.searchStandardSpeciesForTypeahead.mockResolvedValue({
      state: "ready",
      databaseMs: 4.1,
      suggestions: [
        {
          id: "00000000-0000-4000-8000-000000161101",
          displayName: "Курка",
          matchedName: null,
          kind: "species",
          parentDisplayName: null,
          publicPath: "/species/gallus-gallus-domesticus",
        },
      ],
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost:3000/api/public/catalog/species?q=%D0%BA%D1%83%D1%80%D0%BA%D0%B0&kind=animal&locale=uk",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    );
    expect(await response.json()).toEqual({
      suggestions: [
        {
          id: "00000000-0000-4000-8000-000000161101",
          displayName: "Курка",
          kind: "species",
          publicPath: "/species/gallus-gallus-domesticus",
        },
      ],
      state: "ready",
    });
    expect(mocks.searchStandardSpeciesForTypeahead).toHaveBeenCalledWith(
      "курка",
      { objectKind: "animal", locale: "uk" },
    );
    expect(
      mocks.searchCatalogSuggestionsForTypeaheadResult,
    ).not.toHaveBeenCalled();
  });

  it("answers 503 without a cache when the read fails, so the step keeps its own-variant and «Не знаю»", async () => {
    mocks.searchStandardSpeciesForTypeahead.mockRejectedValue(
      new Error("Catalog typeahead exceeded 1000 ms."),
    );
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost:3000/api/public/catalog/species?q=kurka&kind=animal",
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      suggestions: [],
      state: "unavailable",
    });
  });

  it("rejects a missing kind without querying", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost:3000/api/public/catalog/species?q=kurka"),
    );
    expect(response.status).toBe(400);
    expect(mocks.searchStandardSpeciesForTypeahead).not.toHaveBeenCalled();
  });
});
