import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicTopicAggregationPage: vi.fn(),
  listIndexablePublicVarietySitemapEntries: vi.fn(),
  listPublicKnowledgeTopics: vi.fn(),
}));

vi.mock("@/server/public-variety-repository", () => ({
  listIndexablePublicVarietySitemapEntries:
    mocks.listIndexablePublicVarietySitemapEntries,
}));

vi.mock("@/server/public-topic-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/public-topic-repository")
  >()),
  getPublicTopicAggregationPage: mocks.getPublicTopicAggregationPage,
  listPublicKnowledgeTopics: mocks.listPublicKnowledgeTopics,
}));

describe("/sitemap.xml", () => {
  it("lists policy-approved indexable pages only and never noindex/internal routes", async () => {
    mocks.listIndexablePublicVarietySitemapEntries.mockResolvedValue([
      {
        catalogKind: "plant_variety",
        publicSlug: "pomidor-cheri-0000000101",
        lastModified: "2026-06-20T12:00:00.000Z",
        entryCount: 3,
        aggregateBodyLength: 900,
      },
      {
        catalogKind: "species",
        publicSlug: "solanum-lycopersicum",
        lastModified: "2026-06-21T12:00:00.000Z",
        entryCount: 3,
        aggregateBodyLength: 900,
      },
      {
        catalogKind: "breed",
        publicSlug: "carpathian-bee",
        lastModified: "2026-06-22T12:00:00.000Z",
        entryCount: 3,
        aggregateBodyLength: 900,
      },
    ]);
    mocks.listPublicKnowledgeTopics.mockResolvedValue([
      {
        slug: "care-checks",
        label: "Регулярні спостереження",
        entryCount: 5,
        aggregateBodyLength: 1200,
        latestPublishedAt: "2026-06-23T12:00:00.000Z",
        objectKinds: ["plant", "animal"],
        indexState: { sitemapEligible: true },
      },
      {
        slug: "quiet-evidence",
        label: "Тиха тема",
        entryCount: 0,
        aggregateBodyLength: 0,
        latestPublishedAt: null,
        objectKinds: [],
        indexState: { sitemapEligible: false },
      },
    ]);
    mocks.getPublicTopicAggregationPage.mockImplementation(
      async (slug: string) =>
        slug === "care-checks"
          ? {
              topic: {
                slug: "care-checks",
                label: "Регулярні спостереження",
              },
              entryCount: 1,
              aggregateBodyLength: 1200,
              latestPublishedAt: "2026-06-23T12:00:00.000Z",
              qualityClass: "verified",
              entries: [
                {
                  id: "topic-entry",
                  objectId: "topic-object",
                  title: "Спостереження",
                  bodyPreview: Array.from(
                    { length: 120 },
                    (_, index) => `слово${index}`,
                  ).join(" "),
                  entryDate: "2026-06-23",
                  publishedAt: "2026-06-23T12:00:00.000Z",
                  publicPath: "/journal/care-checks-entry",
                },
              ],
              indexState: { sitemapEligible: true },
            }
          : {
              topic: { slug, label: "Тиха тема" },
              entryCount: 0,
              aggregateBodyLength: 0,
              latestPublishedAt: null,
              qualityClass: "verified",
              entries: [],
              indexState: { sitemapEligible: false },
            },
    );

    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toEqual([
      "https://over.garden/blog/ai-garden-advice-vs-real-garden-proof",
      "https://over.garden/bg/blog/ai-garden-advice-vs-real-garden-proof",
      "https://over.garden/ru/blog/ai-garden-advice-vs-real-garden-proof",
      "https://over.garden/guides/start-a-living-plant-record",
      "https://over.garden/bg/guides/start-a-living-plant-record",
      "https://over.garden/ru/guides/start-a-living-plant-record",
      "https://over.garden/answers/why-are-tomato-leaves-yellow",
      "https://over.garden/bg/answers/why-are-tomato-leaves-yellow",
      "https://over.garden/ru/answers/why-are-tomato-leaves-yellow",
      "https://over.garden/markets/ukraine",
      "https://over.garden/variety/pomidor-cheri-0000000101",
      "https://over.garden/species/solanum-lycopersicum",
      "https://over.garden/breed/carpathian-bee",
      "https://over.garden/topics/care-checks",
    ]);
    expect(urls).not.toContain("https://over.garden/uk");
    expect(urls).not.toContain("https://over.garden/ru/markets/ukraine");
    expect(urls.join(" ")).not.toContain("/health");
    expect(urls.join(" ")).not.toContain("/join");
    expect(urls.join(" ")).not.toContain("/garden");
    expect(urls.join(" ")).not.toContain("/journal/");
    expect(entries.every((entry) => entry.lastModified instanceof Date)).toBe(
      true,
    );
    expect(entries[0]).toMatchObject({
      url: "https://over.garden/blog/ai-garden-advice-vs-real-garden-proof",
      lastModified: new Date("2026-07-03T00:00:00.000Z"),
    });
    expect(entries.at(-1)).toMatchObject({
      url: "https://over.garden/topics/care-checks",
      lastModified: new Date("2026-06-23T12:00:00.000Z"),
    });
    expect(mocks.getPublicTopicAggregationPage).toHaveBeenCalledTimes(2);
  });
});
