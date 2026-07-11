import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listIndexablePublicVarietySitemapEntries: vi.fn(),
}));

vi.mock("@/server/public-variety-repository", () => ({
  listIndexablePublicVarietySitemapEntries:
    mocks.listIndexablePublicVarietySitemapEntries,
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

    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toEqual([
      "https://over.garden/blog",
      "https://over.garden/bg/blog",
      "https://over.garden/ru/blog",
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
      "https://over.garden/bg/markets/bulgaria",
      "https://over.garden/ru/markets/bulgaria",
      "https://over.garden/variety/pomidor-cheri-0000000101",
      "https://over.garden/species/solanum-lycopersicum",
      "https://over.garden/breed/carpathian-bee",
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
      url: "https://over.garden/blog",
      lastModified: new Date("2026-07-03T00:00:00.000Z"),
    });
    expect(entries.at(-1)).toMatchObject({
      url: "https://over.garden/breed/carpathian-bee",
      lastModified: new Date("2026-06-22T12:00:00.000Z"),
    });
  });
});
