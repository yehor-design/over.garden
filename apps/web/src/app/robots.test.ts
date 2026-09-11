import { describe, expect, it } from "vitest";

import robots from "./robots";

describe("/robots.txt", () => {
  it("allows public discovery and points crawlers to the canonical sitemap", () => {
    expect(robots()).toEqual({
      rules: [
        {
          userAgent: "*",
          allow: "/",
          disallow: [
            "/garden",
            "/account",
            "/auth",
            "/erasure",
            "/api",
            "/skeleton",
          ],
        },
      ],
      sitemap: "https://over.garden/sitemap.xml",
    });
  });

  it("disallows every prefix the proxy keeps out of a shared cache", () => {
    // The two lists answer different questions — one is crawl budget, the
    // other is cache safety — but a path that may never be cached is never a
    // path worth crawling, so the robots list must cover that one.
    const disallow = robots().rules as { disallow?: string[] };
    for (const noStorePrefix of [
      "/garden",
      "/account",
      "/auth",
      "/erasure",
      "/api",
      "/skeleton",
    ]) {
      expect(
        (Array.isArray(disallow) ? disallow[0].disallow : disallow.disallow) ??
          [],
      ).toContain(noStorePrefix);
    }
  });
});
