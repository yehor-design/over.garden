import { describe, expect, it } from "vitest";

import {
  assertAuthenticatedGardenShell,
  assertSitemapPolicyContract,
} from "./smoke-canonical-launch";

describe("canonical launch smoke workspace contract", () => {
  it("accepts the current authenticated operational workspace marker", () => {
    expect(() =>
      assertAuthenticatedGardenShell(
        '<main data-garden-workspace="operational-home"></main>',
      ),
    ).not.toThrow();
  });

  it("rejects guest, loading, and legacy text-only workspace states", () => {
    for (const html of [
      '<main data-garden-workspace="guest">Garden journal</main>',
      '<main data-garden-workspace="loading"></main>',
      "<main>Garden journal</main>",
    ]) {
      expect(() => assertAuthenticatedGardenShell(html)).toThrow(
        /signed-in garden shell/,
      );
    }
  });
});

describe("canonical launch sitemap contract", () => {
  const currentSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://over.garden/knowledge</loc></url>
  <url><loc>https://over.garden/bg/blog</loc></url>
</urlset>`;

  it("accepts canonical public URLs without coupling the smoke to one locale path", () => {
    expect(() =>
      assertSitemapPolicyContract({
        status: 200,
        contentType: "application/xml",
        xml: currentSitemap,
      }),
    ).not.toThrow();
  });

  it.each([
    ["wrong origin", currentSitemap.replace("over.garden", "example.com")],
    [
      "private workspace route",
      currentSitemap.replace("/knowledge", "/garden/private-space"),
    ],
    [
      "localized private workspace route",
      currentSitemap.replace("/knowledge", "/bg/garden/private-space"),
    ],
    ["empty sitemap", currentSitemap.replace(/<url>.*<\/url>\n?/g, "")],
  ])("rejects %s", (_label, xml) => {
    expect(() =>
      assertSitemapPolicyContract({
        status: 200,
        contentType: "application/xml; charset=utf-8",
        xml,
      }),
    ).toThrow();
  });
});
