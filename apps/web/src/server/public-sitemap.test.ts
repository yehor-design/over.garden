import { describe, expect, it, vi } from "vitest";

import { publicTopicPath } from "@/lib/garden/public-paths";

const mocks = vi.hoisted(() => ({
  countEntries: vi.fn(),
  countProfiles: vi.fn(),
  listEntryUrls: vi.fn(),
  listProfileUrls: vi.fn(),
  listCommunityUrls: vi.fn(),
  listAuthored: vi.fn(),
  listVariety: vi.fn(),
  listTopics: vi.fn(),
  getTopicPage: vi.fn(),
}));

vi.mock("@/server/public-sitemap-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/public-sitemap-repository")
  >()),
  countPublicJournalEntriesForSitemap: mocks.countEntries,
  countPublicProfilesForSitemap: mocks.countProfiles,
  listPublicJournalEntrySitemapUrls: mocks.listEntryUrls,
  listPublicProfileSitemapUrls: mocks.listProfileUrls,
  listPublicCommunitySitemapUrls: mocks.listCommunityUrls,
}));

vi.mock("@/server/public-localized-content", () => ({
  listIndexableLocalizedAuthoredSitemapEntries: mocks.listAuthored,
}));

vi.mock("@/server/public-variety-repository", () => ({
  listIndexablePublicVarietySitemapEntries: mocks.listVariety,
}));

vi.mock("@/server/public-topic-repository", () => ({
  listPublicKnowledgeTopics: mocks.listTopics,
  getPublicTopicAggregationPage: mocks.getTopicPage,
  buildPublicTopicDiscoverySource: (
    page: { topic: { slug: string }; entries: unknown[] },
    consumerId: string,
  ) => ({
    consumerId,
    candidateState: "candidate",
    visibleText: page.entries.length > 0 ? [page.topic.slug] : [],
    distinctPublicEntityIds:
      page.entries.length > 0 ? [`topic:${page.topic.slug}`] : [],
    canonicalPath: publicTopicPath(page.topic.slug),
    equivalentLocales: [],
  }),
}));

import {
  buildPublicSitemapChunk,
  listPublicSitemapChunkIds,
  parsePublicSitemapChunkId,
  publicSitemapChunkPath,
  renderSitemapIndexXml,
  renderSitemapUrlsetXml,
} from "@/server/public-sitemap";

describe("public sitemap", () => {
  it("budgets every chunk in emitted URLs, not in rows", async () => {
    mocks.countEntries.mockResolvedValue(12_000);
    // 4 000 profiles emit 12 000 URLs across three locales, so they need three
    // chunks — one was enough only while the budget counted rows.
    mocks.countProfiles.mockResolvedValue(4_000);

    await expect(listPublicSitemapChunkIds()).resolves.toEqual([
      "authored",
      "catalog",
      "topics",
      "communities",
      "profiles-0",
      "profiles-1",
      "profiles-2",
      "entries-0",
      "entries-1",
      "entries-2",
    ]);
  });

  it("keeps an empty family as one empty chunk so the index never lies", async () => {
    mocks.countEntries.mockResolvedValue(0);
    mocks.countProfiles.mockResolvedValue(0);

    await expect(listPublicSitemapChunkIds()).resolves.toEqual([
      "authored",
      "catalog",
      "topics",
      "communities",
      "profiles-0",
      "entries-0",
    ]);
  });

  it("parses chunk ids only in their canonical form", () => {
    expect(parsePublicSitemapChunkId("authored.xml")).toBe("authored");
    expect(parsePublicSitemapChunkId("entries-3.xml")).toBe("entries-3");
    expect(parsePublicSitemapChunkId("profiles-0")).toBe("profiles-0");
    expect(parsePublicSitemapChunkId("entries-x.xml")).toBeNull();
    expect(parsePublicSitemapChunkId("entries-99999.xml")).toBeNull();
    expect(parsePublicSitemapChunkId("../authored")).toBeNull();
    expect(parsePublicSitemapChunkId("")).toBeNull();
    expect(publicSitemapChunkPath("entries-3")).toBe("/sitemaps/entries-3.xml");
  });

  it("reads entry, profile, and community chunks from the repository", async () => {
    const entry = { url: "/journal/first", lastModified: new Date(0) };
    mocks.listEntryUrls.mockResolvedValue([entry]);
    mocks.listProfileUrls.mockResolvedValue([]);
    mocks.listCommunityUrls.mockResolvedValue([]);

    await expect(buildPublicSitemapChunk("entries-2")).resolves.toEqual([
      entry,
    ]);
    expect(mocks.listEntryUrls).toHaveBeenCalledWith(2);
    await buildPublicSitemapChunk("profiles-1");
    expect(mocks.listProfileUrls).toHaveBeenCalledWith(1);
    await buildPublicSitemapChunk("communities");
    expect(mocks.listCommunityUrls).toHaveBeenCalledTimes(1);
  });

  it("maps authored and catalog candidates to their public paths", async () => {
    mocks.listAuthored.mockReturnValue([
      { path: "/bg/guides/start", lastModified: "2026-07-03T00:00:00.000Z" },
    ]);
    mocks.listVariety.mockResolvedValue([]);

    await expect(buildPublicSitemapChunk("authored")).resolves.toEqual([
      {
        url: "/bg/guides/start",
        lastModified: new Date("2026-07-03T00:00:00.000Z"),
      },
    ]);
    await expect(buildPublicSitemapChunk("catalog")).resolves.toEqual([]);
  });

  it("emits canonical hierarchical organism addresses only, never a 308 target (ADR-0026 D8)", async () => {
    mocks.listVariety.mockResolvedValue([
      {
        catalogKind: "species",
        publicSlug: "solanum-lycopersicum",
        speciesSlug: null,
        lastModified: "2026-09-01T00:00:00.000Z",
      },
      {
        catalogKind: "plant_variety",
        publicSlug: "de-barao",
        speciesSlug: "solanum-lycopersicum",
        lastModified: "2026-09-02T00:00:00.000Z",
      },
      {
        catalogKind: "plant_variety",
        publicSlug: "orphan-form",
        speciesSlug: null,
        lastModified: "2026-09-03T00:00:00.000Z",
      },
      {
        catalogKind: "breed",
        publicSlug: "carpathian-bee",
        speciesSlug: "apis-mellifera",
        lastModified: "2026-09-04T00:00:00.000Z",
      },
    ]);

    // Each card is self-canonical in all three route families (ADR-0029 D10),
    // so every one of its canonicals belongs here — not just the unprefixed one.
    const catalog = await buildPublicSitemapChunk("catalog");
    expect(catalog.map((entry) => entry.url)).toEqual([
      "/species/solanum-lycopersicum",
      "/bg/species/solanum-lycopersicum",
      "/ru/species/solanum-lycopersicum",
      "/species/solanum-lycopersicum/de-barao",
      "/bg/species/solanum-lycopersicum/de-barao",
      "/ru/species/solanum-lycopersicum/de-barao",
      "/variety/orphan-form",
      "/bg/variety/orphan-form",
      "/ru/variety/orphan-form",
      "/species/apis-mellifera/carpathian-bee",
      "/bg/species/apis-mellifera/carpathian-bee",
      "/ru/species/apis-mellifera/carpathian-bee",
    ]);
    expect(catalog[0]?.lastModified).toEqual(
      new Date("2026-09-01T00:00:00.000Z"),
    );
  });

  it("lists only topics that list something (ADR-0022, D3)", async () => {
    mocks.listTopics.mockResolvedValue([{ slug: "rich" }, { slug: "empty" }]);
    mocks.getTopicPage.mockImplementation(async (slug: string) => ({
      topic: { slug },
      entries: slug === "rich" ? [{ id: "entry-1" }] : [],
      latestPublishedAt: "2026-07-10T10:00:00.000Z",
    }));

    const urls = await buildPublicSitemapChunk("topics");

    // The empty topic is refused whatever the locale; the rich one contributes
    // all three of its canonicals (ADR-0029 D10).
    expect(urls.map((item) => item.url)).toEqual([
      publicTopicPath("rich"),
      `/bg${publicTopicPath("rich")}`,
      `/ru${publicTopicPath("rich")}`,
    ]);
  });

  it("renders absolute, escaped urls with a true lastmod", () => {
    const urlset = renderSitemapUrlsetXml([
      { url: "/journal/a&b", lastModified: new Date("2026-07-01T00:00:00Z") },
    ]);
    expect(urlset.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(
      true,
    );
    expect(urlset).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(urlset).toContain(
      "/journal/a&amp;b</loc><lastmod>2026-07-01T00:00:00.000Z</lastmod></url>",
    );
    expect(urlset).toMatch(/<loc>https?:\/\/[^<]+\/journal\/a&amp;b<\/loc>/);

    const index = renderSitemapIndexXml(["authored", "entries-1"]);
    expect(index).toContain("<sitemapindex");
    expect(index).toContain("/sitemaps/authored.xml</loc>");
    expect(index).toContain("/sitemaps/entries-1.xml</loc>");
  });
});
