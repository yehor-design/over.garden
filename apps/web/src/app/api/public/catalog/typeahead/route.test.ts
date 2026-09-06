import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchCatalogSuggestionsForTypeaheadResult: vi.fn(),
  searchColUsages: vi.fn(),
  connection: vi.fn(async () => undefined),
}));

vi.mock("next/server", () => ({
  connection: mocks.connection,
}));

vi.mock("@/server/catalog-repository", () => ({
  searchCatalogSuggestionsForTypeaheadResult:
    mocks.searchCatalogSuggestionsForTypeaheadResult,
}));

vi.mock("@/server/catalog-source/col-repository", () => ({
  searchColUsages: mocks.searchColUsages,
}));

describe("GET /api/public/catalog/typeahead", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("answers the bounded row shape with a short public cache and server timing", async () => {
    mocks.searchCatalogSuggestionsForTypeaheadResult.mockResolvedValue({
      state: "ready",
      databaseMs: 3.2,
      suggestions: [
        {
          id: "00000000-0000-4000-8000-000000161001",
          displayName: "Помідор",
          matchedName: "томат",
          kind: "species",
          parentDisplayName: null,
          publicPath: "/species/solanum-lycopersicum",
          canonicalName: "must-not-reach-http",
          source: "must-not-reach-http",
        },
        {
          id: "00000000-0000-4000-8000-000000161002",
          displayName: "Де Барао",
          matchedName: null,
          kind: "cultivar",
          parentDisplayName: "Помідор",
          publicPath: null,
        },
      ],
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost:3000/api/public/catalog/typeahead?q=%D1%82%D0%BE%D0%BC%D0%B0%D1%82&kind=plant&locale=uk",
        { headers: { cookie: "overgarden.session_token=must-not-matter" } },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    );
    expect(response.headers.get("server-timing")).toMatch(
      /^db;dur=3\.20, total;dur=\d+(\.\d+)?$/,
    );
    expect(await response.json()).toEqual({
      suggestions: [
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
      ],
      state: "ready",
    });
    expect(
      mocks.searchCatalogSuggestionsForTypeaheadResult,
    ).toHaveBeenCalledWith("томат", { objectKind: "plant", locale: "uk" });
  });

  it("defaults an unknown locale to uk and caps the query at 120 characters", async () => {
    mocks.searchCatalogSuggestionsForTypeaheadResult.mockResolvedValue({
      state: "empty",
      databaseMs: 1,
      suggestions: [],
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        `http://localhost:3000/api/public/catalog/typeahead?q=${"a".repeat(200)}&kind=animal&locale=xx`,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [], state: "empty" });
    expect(
      mocks.searchCatalogSuggestionsForTypeaheadResult,
    ).toHaveBeenCalledWith("a".repeat(120), {
      objectKind: "animal",
      locale: "uk",
    });
  });

  it("rejects a missing or malformed object kind without querying, uncached", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost:3000/api/public/catalog/typeahead?q=tomato"),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ suggestions: [], state: "empty" });
    expect(
      mocks.searchCatalogSuggestionsForTypeaheadResult,
    ).not.toHaveBeenCalled();
  });

  it("answers 503 without a cache when the read fails or misses its deadline", async () => {
    mocks.searchCatalogSuggestionsForTypeaheadResult.mockRejectedValue(
      new Error("Catalog typeahead exceeded 400 ms."),
    );
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost:3000/api/public/catalog/typeahead?q=tomato&kind=plant",
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("5");
    expect(await response.json()).toEqual({
      suggestions: [],
      state: "unavailable",
    });
  });
});

describe("GET /api/public/catalog/typeahead?scope=full", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("answers checklist rows carrying an identifier, not a node id", async () => {
    mocks.searchColUsages.mockResolvedValue([
      {
        colId: "6MK7J",
        canonicalName: "Hydrochoerus hydrochaeris",
        scientificName: "Hydrochoerus hydrochaeris (Linnaeus, 1766)",
        authorship: "(Linnaeus, 1766)",
        rank: "species",
        kingdom: "Animalia",
        status: "accepted",
        acceptedName: null,
      },
      {
        colId: "LYCES",
        canonicalName: "Lycopersicon esculentum",
        scientificName: "Lycopersicon esculentum Mill.",
        authorship: "Mill.",
        rank: "species",
        kingdom: null,
        status: "synonym",
        acceptedName: "Solanum lycopersicum",
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://over.garden/api/public/catalog/typeahead?q=hydro&kind=animal&scope=full",
      ),
    );
    const body = (await response.json()) as {
      suggestions: Record<string, unknown>[];
      state: string;
      scope: string;
    };

    expect(response.status).toBe(200);
    expect(body.state).toBe("ready");
    expect(body.scope).toBe("full");
    expect(body.suggestions[0]).toEqual({
      colId: "6MK7J",
      displayName: "Hydrochoerus hydrochaeris",
      scientificName: "Hydrochoerus hydrochaeris (Linnaeus, 1766)",
      rank: "species",
    });
    // A synonym says which accepted name it leads to, and no row carries an id.
    expect(body.suggestions[1]).toMatchObject({
      colId: "LYCES",
      acceptedName: "Solanum lycopersicum",
    });
    expect(body.suggestions.every((row) => !("id" in row))).toBe(true);
    expect(mocks.searchCatalogSuggestionsForTypeaheadResult).not.toHaveBeenCalled();
  });

  it("answers 503 without caching when the checklist read fails", async () => {
    mocks.searchColUsages.mockRejectedValue(new Error("no snapshot"));

    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://over.garden/api/public/catalog/typeahead?q=hydro&kind=plant&scope=full",
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).state).toBe("unavailable");
  });
});
