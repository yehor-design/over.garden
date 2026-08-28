import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  listPublicStableCatalogPage: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

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
    };
  },
);

vi.mock("@/server/stable-registry/public-catalog-repository", () => ({
  findPublicStableCatalogRecord: vi.fn(),
  listPublicStableCatalogPage: mocks.listPublicStableCatalogPage,
}));

describe("localized Stable Catalog page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.listPublicStableCatalogPage.mockResolvedValue({
      request: { kind: "plant", query: "tomato", cursor: null },
      records: [
        {
          stableTaxon: "tomato-0000000001",
          objectKind: "plant",
          displayName: "Tomato",
          scientificName: "Solanum lycopersicum",
          taxonomicRank: "variety",
          parentDisplayName: null,
          aliases: ["Solanum lycopersicum"],
          evidenceState: "approved_stable_registry",
          href: "/bg/catalog/tomato-0000000001",
          qualityClass: "verified",
          observedAt: "2026-08-28T10:00:00.000Z",
        },
      ],
      nextCursor: null,
      qualityClass: "verified",
    });
  });

  it("renders a guest-safe approved catalog result with an explicit badge", async () => {
    const { default: Route } = await import("./page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "bg" }),
        searchParams: Promise.resolve({ q: "tomato", kind: "plant" }),
      }),
    );

    expect(mocks.listPublicStableCatalogPage).toHaveBeenCalledWith(
      { kind: "plant", query: "tomato", cursor: null },
      "bg",
    );
    expect(html).toContain('data-stable-registry-explorer="catalog"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain("Одобрено в Stable Registry");
    expect(html).toContain("Tomato");
    expect(html).not.toMatch(
      /raw|source_only|field_rights|checksum|latitude|longitude|coordinates/i,
    );
  });

  it("renders an invalid query state without reading the catalog", async () => {
    const { default: Route } = await import("./page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ q: "x" }),
      }),
    );

    expect(html).toContain('data-stable-registry-state="degraded"');
    expect(html).toContain("Використайте від 2 до 120");
    expect(mocks.listPublicStableCatalogPage).not.toHaveBeenCalled();
  });

  it("keeps retry and approved-catalog recovery controls usable after a bounded read failure", async () => {
    mocks.listPublicStableCatalogPage.mockRejectedValueOnce(
      new Error("statement timeout"),
    );
    const { default: Route } = await import("./page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ q: "tomato" }),
      }),
    );

    expect(html).toContain('data-stable-registry-state="degraded"');
    expect(html).toContain("Пошук тимчасово недоступний");
    expect(html).toContain("Спробувати ще раз");
    expect(html).toContain('href="/catalog"');
  });
});
