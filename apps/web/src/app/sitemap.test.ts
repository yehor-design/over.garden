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
      "https://over.garden/",
      "https://over.garden/blog",
      "https://over.garden/blog/ai-garden-advice-vs-real-garden-proof",
      "https://over.garden/guides/start-a-living-plant-record",
      "https://over.garden/answers/why-are-tomato-leaves-yellow",
      "https://over.garden/markets/ukraine",
      "https://over.garden/markets/bulgaria",
      "https://over.garden/variety/pomidor-cheri-0000000101",
    ]);
    expect(urls.join(" ")).not.toContain("/health");
    expect(urls.join(" ")).not.toContain("/join");
    expect(urls.join(" ")).not.toContain("/garden");
    expect(urls.join(" ")).not.toContain("/journal/");
  });
});
