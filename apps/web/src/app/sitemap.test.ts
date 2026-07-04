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
        publicSlug: "pomidor-cheri-0000000101",
        lastModified: "2026-06-20T12:00:00.000Z",
        entryCount: 3,
        aggregateBodyLength: 900,
      },
    ]);

    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toEqual([
      "https://over.garden/uk",
      "https://over.garden/bg",
      "https://over.garden/ru",
      "https://over.garden/uk/blog",
      "https://over.garden/bg/blog",
      "https://over.garden/ru/blog",
      "https://over.garden/uk/blog/ai-garden-advice-vs-real-garden-proof",
      "https://over.garden/bg/blog/ai-garden-advice-vs-real-garden-proof",
      "https://over.garden/ru/blog/ai-garden-advice-vs-real-garden-proof",
      "https://over.garden/uk/guides/start-a-living-plant-record",
      "https://over.garden/bg/guides/start-a-living-plant-record",
      "https://over.garden/ru/guides/start-a-living-plant-record",
      "https://over.garden/uk/answers/why-are-tomato-leaves-yellow",
      "https://over.garden/bg/answers/why-are-tomato-leaves-yellow",
      "https://over.garden/ru/answers/why-are-tomato-leaves-yellow",
      "https://over.garden/uk/markets/ukraine",
      "https://over.garden/ru/markets/ukraine",
      "https://over.garden/bg/markets/bulgaria",
      "https://over.garden/ru/markets/bulgaria",
      "https://over.garden/uk/markets/bulgaria",
      "https://over.garden/variety/pomidor-cheri-0000000101",
    ]);
    expect(urls).not.toContain("https://over.garden/");
    expect(urls.join(" ")).not.toContain("/health");
    expect(urls.join(" ")).not.toContain("/join");
    expect(urls.join(" ")).not.toContain("/garden");
    expect(urls.join(" ")).not.toContain("/journal/");
    expect(
      entries.every((entry) => entry.lastModified instanceof Date),
    ).toBe(true);
    expect(entries[0]).toMatchObject({
      url: "https://over.garden/uk",
      lastModified: new Date("2026-07-03T00:00:00.000Z"),
    });
    expect(entries.at(-1)).toMatchObject({
      url: "https://over.garden/variety/pomidor-cheri-0000000101",
      lastModified: new Date("2026-06-20T12:00:00.000Z"),
    });
  });
});
