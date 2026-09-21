import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
  kingdoms: vi.fn(),
  hubs: vi.fn(),
  page: vi.fn(),
  facets: vi.fn(),
}));
vi.mock("@/server/public-cache", () => ({
  readCatalogBrowseKingdoms: reads.kingdoms,
  readCatalogRegisterHubSpecies: reads.hubs,
  readCatalogBrowsePage: reads.page,
  readCatalogBrowseFacets: reads.facets,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not_found");
  },
  unstable_rethrow: () => undefined,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: () => null,
  SiteShellContextRailModules: () => null,
}));

describe("the static catalog and its query twin", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    vi.clearAllMocks();
    reads.kingdoms.mockResolvedValue([
      { kingdom: "Plantae", total: 1, initials: [{ initial: "s", total: 1 }] },
    ]);
    reads.hubs.mockResolvedValue([]);
    reads.page.mockResolvedValue({
      cards: [
        {
          id: "tomato",
          name: "Solanum lycopersicum",
          vernacularName: null,
          path: "/species/solanum-lycopersicum",
          rank: "species",
          kingdom: "Plantae",
          registers: [],
          hasFirstHandContent: true,
        },
      ],
      total: 1,
      pageCount: 1,
    });
    reads.facets.mockResolvedValue({
      kingdoms: { Plantae: 1 },
      ranks: { species: 1 },
      registers: { ua: 0, eu: 0 },
      grown: 1,
      initials: { s: 1 },
      total: 1,
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("renders a default document with visible catalog links", async () => {
    const { default: Page } = await import("./page");
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ locale: "uk" }) }),
    );
    expect(html).toContain('data-public-catalog-state="ready"');
    expect(html).toContain("/species/solanum-lycopersicum");
    expect(html).not.toContain('data-public-catalog-state="loading"');
    expect(reads.page).toHaveBeenCalledWith(
      expect.objectContaining({ kingdoms: [], page: 1 }),
      "uk",
    );
  });

  it("normalizes repeated facets only in the internal query route", async () => {
    const { default: Page } = await import("@/app/[locale]/q/catalog/page");
    await Page({
      params: Promise.resolve({ locale: "bg" }),
      searchParams: Promise.resolve({
        kingdom: ["", "plantae", "fungi"],
        letter: "s",
        page: "1",
      }),
    });
    expect(reads.page).toHaveBeenCalledWith(
      expect.objectContaining({
        kingdoms: ["Plantae", "Fungi"],
        initial: "s",
        page: 1,
      }),
      "bg",
    );
    expect(reads.hubs).not.toHaveBeenCalled();
  });

  it.each(["kingdoms", "hubs", "page", "facets"] as const)(
    "defers a failed %s read instead of caching a degraded document",
    async (name) => {
      reads[name].mockRejectedValue(new Error("database unavailable"));
      const { renderPublicCatalogPage } = await import("./page");
      await expect(
        renderPublicCatalogPage("uk", {}, "static"),
      ).rejects.toMatchObject({
        name: "StaticRenderDeferred",
        reason: "read_failed",
      });
    },
  );

  it("renders the recoverable error on a request-time page read failure", async () => {
    reads.page.mockRejectedValue(new Error("database unavailable"));
    const { renderPublicCatalogPage } = await import("./page");
    const html = renderToStaticMarkup(await renderPublicCatalogPage("uk"));
    expect(html).toContain('data-public-catalog-state="error"');
  });

  it("rejects a page beyond the last result page", async () => {
    const { renderPublicCatalogPage } = await import("./page");
    await expect(renderPublicCatalogPage("uk", { page: "2" })).rejects.toThrow(
      "not_found",
    );
  });
});
