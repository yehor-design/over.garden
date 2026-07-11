import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublicObjectCatalogPage: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("@/server/public-object-catalog-repository", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/server/public-object-catalog-repository")
    >();
  return {
    ...actual,
    listPublicObjectCatalogPage: mocks.listPublicObjectCatalogPage,
  };
});

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

describe("GET /api/public/objects/suggestions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.listPublicObjectCatalogPage.mockResolvedValue({
      request: { kind: "all", identity: "all", query: "томат", page: 1 },
      totalCount: 1,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
      cards: [
        {
          key: "catalog:tomato",
          objectKind: "plant",
          identityState: "catalog",
          identityName: "Помідор чері",
          catalogKind: "plant_variety",
          catalogStatus: "seeded",
          catalogPath: "/variety/tomato",
          objectCount: 2,
          journalCount: 5,
          representativeObject: {
            displayName: "Томат у теплиці",
            path: "/lineage/objects/object-1",
          },
          latestJournal: {
            title: "Перший врожай",
            path: "/journal/harvest",
            entryDate: "2026-07-10",
          },
          mediaPublicUrl: null,
        },
      ],
    });
  });

  it("returns no suggestions before two characters without touching the repository", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://over.garden/api/public/objects/suggestions?q=x"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ suggestions: [] });
    expect(mocks.listPublicObjectCatalogPage).not.toHaveBeenCalled();
  });

  it("returns bounded public-safe evidence suggestions without requiring auth", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://over.garden/api/public/objects/suggestions?q=томат&kind=plant",
      ),
    );
    const body = await response.json();

    expect(mocks.listPublicObjectCatalogPage).toHaveBeenCalledWith(
      { kind: "plant", identity: "all", query: "томат", page: 1 },
      "uk",
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(body).toEqual({
      suggestions: [
        {
          key: "catalog:tomato",
          label: "Помідор чері",
          href: "/variety/tomato",
          objectKind: "plant",
          identityState: "catalog",
          journalCount: 5,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toMatch(
      /owner|space|location|email|source|derivative|quarantine|latitude|longitude/i,
    );
  });
});
