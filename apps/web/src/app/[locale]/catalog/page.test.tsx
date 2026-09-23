import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
  kingdoms: vi.fn(),
  hubs: vi.fn(),
  page: vi.fn(),
  facets: vi.fn(),
  firstHand: vi.fn(),
}));
vi.mock("@/server/public-cache", () => ({
  readCatalogBrowseKingdoms: reads.kingdoms,
  readCatalogRegisterHubSpecies: reads.hubs,
  readCatalogBrowsePage: reads.page,
  readCatalogBrowseFacets: reads.facets,
  readCatalogFirstHandOrganisms: reads.firstHand,
}));

const TOMATO = {
  id: "tomato",
  name: "Solanum lycopersicum",
  vernacularName: null,
  path: "/species/solanum-lycopersicum",
  rank: "species",
  kingdom: "Plantae",
  registers: [],
  hasFirstHandContent: true,
  speciesName: null,
  publicSlug: "solanum-lycopersicum",
} as const;
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
    reads.firstHand.mockResolvedValue([TOMATO]);
    reads.page.mockResolvedValue({ cards: [TOMATO], total: 1, pageCount: 1 });
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

  it("opens on the door: a search, what gardeners wrote about, and the way into the register", async () => {
    // `OVE-496`: the unfiltered address no longer reads page one of the A–Z
    // register at all.
    const { default: Page } = await import("./page");
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ locale: "uk" }) }),
    );
    expect(html).toContain('data-catalog-view="door"');
    expect(html).toContain('data-public-catalog-state="ready"');
    expect(html).toContain('data-catalog-search-form="true"');
    expect(html).toContain("/species/solanum-lycopersicum");
    expect(html).toContain('href="/catalog?kingdom=plantae"');
    expect(html).toContain('href="/catalog?letter=s"');
    expect(html).not.toContain('data-public-catalog-state="loading"');
    expect(reads.page).not.toHaveBeenCalled();
    expect(reads.firstHand).toHaveBeenCalledWith("uk");
  });

  it("says a failed door read is partial, and keeps the search", async () => {
    reads.firstHand.mockRejectedValue(new Error("database unavailable"));
    const { renderPublicCatalogPage } = await import("./page");
    const html = renderToStaticMarkup(await renderPublicCatalogPage("uk"));
    expect(html).toContain('data-public-catalog-state="partial"');
    expect(html).toContain('data-catalog-search-form="true"');
    expect(html).not.toContain('id="catalog-first-hand"');
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
    expect(reads.firstHand).not.toHaveBeenCalled();
  });

  it.each(["kingdoms", "hubs", "firstHand", "facets"] as const)(
    "defers a failed door %s read instead of caching a degraded document",
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

  it.each(["kingdoms", "page", "facets"] as const)(
    "defers a failed register %s read instead of caching a degraded document",
    async (name) => {
      reads[name].mockRejectedValue(new Error("database unavailable"));
      const { renderPublicCatalogPage } = await import("./page");
      await expect(
        renderPublicCatalogPage("uk", { kingdom: "plantae" }, "static"),
      ).rejects.toMatchObject({
        name: "StaticRenderDeferred",
        reason: "read_failed",
      });
    },
  );

  it("renders the recoverable error on a request-time page read failure", async () => {
    reads.page.mockRejectedValue(new Error("database unavailable"));
    const { renderPublicCatalogPage } = await import("./page");
    const html = renderToStaticMarkup(
      await renderPublicCatalogPage("uk", { kingdom: "plantae" }),
    );
    expect(html).toContain('data-public-catalog-state="error"');
  });

  it("rejects a page beyond the last result page", async () => {
    const { renderPublicCatalogPage } = await import("./page");
    await expect(renderPublicCatalogPage("uk", { page: "2" })).rejects.toThrow(
      "not_found",
    );
  });
});
