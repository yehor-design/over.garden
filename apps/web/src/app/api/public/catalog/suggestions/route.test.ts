import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  listPublicStableCatalogPage: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("@/lib/stable-registry/feature-gate", () => ({
  isStableRegistryPublicDiscoveryEnabled: mocks.enabled,
}));

vi.mock("@/server/stable-registry/public-catalog-repository", () => ({
  listPublicStableCatalogPage: mocks.listPublicStableCatalogPage,
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

describe("GET /api/public/catalog/suggestions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.listPublicStableCatalogPage.mockResolvedValue({
      request: { kind: "plant", query: "tomato", cursor: null },
      records: [
        {
          stableTaxon: "tomato-0000000001",
          displayName: "Tomato",
          objectKind: "plant",
          scientificName: "Solanum lycopersicum",
          taxonomicRank: "variety",
          parentDisplayName: null,
          aliases: [],
          evidenceState: "approved_stable_registry",
          href: "/catalog/tomato-0000000001",
          qualityClass: "verified",
          observedAt: "2026-08-28T10:00:00.000Z",
        },
      ],
      nextCursor: null,
      qualityClass: "verified",
    });
  });

  it("rejects an invalid query without querying the read model", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://over.garden/api/public/catalog/suggestions?q=x"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_query" });
    expect(mocks.listPublicStableCatalogPage).not.toHaveBeenCalled();
  });

  it("returns only bounded safe catalog fields for a guest", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://over.garden/api/public/catalog/suggestions?q=tomato&kind=plant",
      ),
    );
    const body = await response.json();

    expect(mocks.listPublicStableCatalogPage).toHaveBeenCalledWith(
      { kind: "plant", query: "tomato", cursor: null },
      "uk",
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("Server-Timing")).toMatch(
      /^public_catalog_query_latency;dur=\d+(?:\.\d+)?$/u,
    );
    expect(body).toEqual({
      suggestions: [
        {
          stableTaxon: "tomato-0000000001",
          displayName: "Tomato",
          objectKind: "plant",
          evidenceState: "approved_stable_registry",
          href: "/catalog/tomato-0000000001",
        },
      ],
      nextCursor: null,
    });
    expect(JSON.stringify(body)).not.toMatch(
      /raw|source_only|field_rights|checksum|latitude|longitude|coordinates|capture/i,
    );
  });

  it("keeps the feature dark with a generic not-found response", async () => {
    mocks.enabled.mockReturnValue(false);
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://over.garden/api/public/catalog/suggestions?q=tomato",
      ),
    );

    expect(response.status).toBe(404);
    expect(mocks.listPublicStableCatalogPage).not.toHaveBeenCalled();
  });

  it("fails boundedly on a repository timeout without leaking query internals", async () => {
    mocks.listPublicStableCatalogPage.mockRejectedValueOnce({
      code: "57014",
      message: "statement timeout",
    });
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://over.garden/api/public/catalog/suggestions?q=tomato",
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("1");
    expect(response.headers.get("Server-Timing")).toMatch(
      /^public_catalog_query_latency;dur=\d+(?:\.\d+)?$/u,
    );
    await expect(response.json()).resolves.toEqual({
      error: "temporarily_unavailable",
    });
  });
});
