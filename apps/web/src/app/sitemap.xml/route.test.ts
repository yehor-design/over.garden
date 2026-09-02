import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublicSitemapChunkIds: vi.fn(),
}));

vi.mock("@/server/public-sitemap", () => ({
  SITEMAP_RESPONSE_HEADERS: {
    "content-type": "application/xml; charset=utf-8",
  },
  listPublicSitemapChunkIds: mocks.listPublicSitemapChunkIds,
  renderSitemapIndexXml: (ids: readonly string[]) =>
    `<sitemapindex>${ids.join(",")}</sitemapindex>`,
}));

import { GET } from "./route";

describe("GET /sitemap.xml", () => {
  it("serves the chunk list as a sitemap index", async () => {
    mocks.listPublicSitemapChunkIds.mockResolvedValue([
      "authored",
      "entries-0",
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    await expect(response.text()).resolves.toBe(
      "<sitemapindex>authored,entries-0</sitemapindex>",
    );
  });
});
