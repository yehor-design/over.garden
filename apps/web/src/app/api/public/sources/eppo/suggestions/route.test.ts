import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  listPublicEppoSourcePage: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("@/lib/stable-registry/feature-gate", () => ({
  isStableRegistryPublicDiscoveryEnabled: mocks.enabled,
}));

vi.mock(
  "@/server/catalog-source/public-eppo-explorer-repository",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/server/catalog-source/public-eppo-explorer-repository")
      >();
    return {
      ...actual,
      listPublicEppoSourcePage: mocks.listPublicEppoSourcePage,
    };
  },
);

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

describe("GET /api/public/sources/eppo/suggestions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    mocks.listPublicEppoSourcePage.mockResolvedValue({
      request: { kind: "plant", query: "sollc", cursor: null },
      records: [
        {
          eppoCode: "SOLLC",
          displayName: "Tomato",
          objectKind: "plant",
          scientificName: "Solanum lycopersicum",
          taxonomicRank: "Species",
          parentDisplayName: "Solanum",
          aliases: [],
          evidenceState: "source_record_not_approved",
          href: "/bg/sources/eppo/SOLLC",
          qualityClass: "partial",
          observedAt: "2026-08-28T10:00:00.000Z",
          source: {
            name: "EPPO Codes",
            url: "https://data.eppo.int/",
            license: "EPPO Codes Open Data Licence",
            licenseUrl: null,
            attribution: null,
          },
        },
      ],
      nextCursor: null,
      qualityClass: "partial",
    });
  });

  it("returns the source-evidence badge, never an approved product identity", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://over.garden/api/public/sources/eppo/suggestions?q=sollc&kind=plant",
      ),
    );
    const body = await response.json();

    expect(mocks.listPublicEppoSourcePage).toHaveBeenCalledWith(
      { kind: "plant", query: "sollc", cursor: null },
      "bg",
    );
    expect(response.headers.get("Server-Timing")).toMatch(
      /^public_source_query_latency;dur=\d+(?:\.\d+)?$/u,
    );
    expect(body).toEqual({
      suggestions: [
        {
          eppoCode: "SOLLC",
          displayName: "Tomato",
          objectKind: "plant",
          evidenceState: "source_record_not_approved",
          href: "/bg/sources/eppo/SOLLC",
        },
      ],
      nextCursor: null,
    });
    expect(JSON.stringify(body)).not.toMatch(
      /approved_stable_registry|raw|source_only|field_rights|latitude|longitude|coordinates|capture/i,
    );
  });

  it("returns a bounded retryable failure when the source projection misses its deadline", async () => {
    mocks.listPublicEppoSourcePage.mockRejectedValueOnce({ code: "57014" });
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://over.garden/api/public/sources/eppo/suggestions?q=sollc",
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("1");
    expect(response.headers.get("Server-Timing")).toMatch(
      /^public_source_query_latency;dur=\d+(?:\.\d+)?$/u,
    );
    await expect(response.json()).resolves.toEqual({
      error: "temporarily_unavailable",
    });
  });
});
