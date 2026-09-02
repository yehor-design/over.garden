import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildPublicSitemapChunk: vi.fn(),
}));

vi.mock("@/server/public-sitemap", () => ({
  SITEMAP_RESPONSE_HEADERS: {
    "content-type": "application/xml; charset=utf-8",
  },
  buildPublicSitemapChunk: mocks.buildPublicSitemapChunk,
  parsePublicSitemapChunkId: (value: string) =>
    value === "entries-0.xml" ? "entries-0" : null,
  renderSitemapUrlsetXml: (urls: readonly unknown[]) =>
    `<urlset>${urls.length}</urlset>`,
}));

import { GET } from "./route";

describe("GET /sitemaps/[chunk].xml", () => {
  it("answers 404 for a chunk id that is not in the index", async () => {
    const response = await GET(
      new Request("https://over.garden/sitemaps/nope.xml"),
      {
        params: Promise.resolve({ chunk: "nope.xml" }),
      },
    );

    expect(response.status).toBe(404);
    expect(mocks.buildPublicSitemapChunk).not.toHaveBeenCalled();
  });

  it("serves a known chunk as xml", async () => {
    mocks.buildPublicSitemapChunk.mockResolvedValue([
      { url: "/journal/first", lastModified: new Date(0) },
    ]);

    const response = await GET(
      new Request("https://over.garden/sitemaps/entries-0.xml"),
      { params: Promise.resolve({ chunk: "entries-0.xml" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    await expect(response.text()).resolves.toBe("<urlset>1</urlset>");
    expect(mocks.buildPublicSitemapChunk).toHaveBeenCalledWith("entries-0");
  });
});
