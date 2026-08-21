import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  searchCatalogSuggestionsForTypeahead: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));

vi.mock("@/server/catalog-repository", () => ({
  searchCatalogSuggestionsForTypeahead:
    mocks.searchCatalogSuggestionsForTypeahead,
}));

describe("GET /api/garden/catalog/typeahead", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireCurrentRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
  });

  it("returns the bounded safe suggestion contract from the canonical search boundary", async () => {
    mocks.searchCatalogSuggestionsForTypeahead.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000161001",
        displayName: "OVE161 Sun Tomato",
        canonicalName: "OVE161 Golden Tomato",
        catalogKind: "plant_variety",
        locale: "en",
        status: "confirmed",
        source: "internal_seed",
        serveClass: "low_confidence",
        trustState: "curated",
        trustLabel: "Curated",
        sourceLabel: "OverGarden curated catalog",
        sourceCaveat: "Curated catalog identity.",
        disambiguationLabel: "Plant variety · OverGarden curated catalog · en",
        _rankingScoreDetails: { typo: { typoCount: 1 } },
        ownerUserId: "must-not-reach-http",
      },
    ]);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost:3000/api/garden/catalog/typeahead?q=OVE161%20Sun%20Tomato",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      suggestions: [
        {
          id: "00000000-0000-4000-8000-000000161001",
          displayName: "OVE161 Sun Tomato",
          canonicalName: "OVE161 Golden Tomato",
          catalogKind: "plant_variety",
          locale: "en",
          status: "confirmed",
          source: "internal_seed",
          serveClass: "low_confidence",
          trustState: "curated",
          trustLabel: "Curated",
          sourceLabel: "OverGarden starter catalog",
          sourceCaveat:
            "Curated OverGarden identity. Compare the type and name before choosing.",
          disambiguationLabel:
            "Plant variety · OverGarden starter catalog · en",
        },
      ],
    });
    expect(mocks.requireCurrentRequestScope).toHaveBeenCalledOnce();
    expect(mocks.searchCatalogSuggestionsForTypeahead).toHaveBeenCalledWith(
      "OVE161 Sun Tomato",
    );
  });
});
