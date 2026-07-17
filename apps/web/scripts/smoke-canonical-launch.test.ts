import { describe, expect, it } from "vitest";

import {
  assertAuthenticatedGardenShell,
  assertCanonicalLegacyRedirect,
  assertOperatorAccessState,
  assertPublicRoutePolicyContract,
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

describe("canonical launch operator access contract", () => {
  it.each([
    ["admin", "sign-in-required"],
    ["admin", "denied"],
    ["erasure-requests", "denied"],
  ] as const)("accepts the %s %s structural boundary", (surface, state) => {
    expect(() =>
      assertOperatorAccessState({
        html: `<main data-operator-surface="${surface}" data-operator-access-state="${state}">Localized copy</main>`,
        surface,
        state,
        label: `${surface} ${state}`,
      }),
    ).not.toThrow();
  });

  it.each([
    [
      "the wrong surface",
      '<main data-operator-surface="erasure-requests" data-operator-access-state="denied"></main>',
    ],
    [
      "an allowed state",
      '<main data-operator-surface="admin" data-operator-access-state="allowed"></main>',
    ],
    [
      "duplicate access markers",
      '<main data-operator-surface="admin" data-operator-access-state="denied"><div data-operator-access-state="allowed"></div></main>',
    ],
    ["localized text without a marker", "<main>Доступ заборонено.</main>"],
  ])("rejects %s", (_label, html) => {
    expect(() =>
      assertOperatorAccessState({
        html,
        surface: "admin",
        state: "denied",
        label: "normal admin block",
      }),
    ).toThrow(/normal admin block/);
  });
});

describe("canonical launch public route contract", () => {
  it("accepts a same-origin localized final page after canonical redirects", () => {
    expect(() =>
      assertPublicRoutePolicyContract({
        base: "https://over.garden",
        path: "/privacy",
        finalUrl: "https://over.garden/bg/privacy",
        status: 200,
        text: '<meta name="robots" content="noindex, nofollow"/>',
        expectedMarker: "noindex",
      }),
    ).not.toThrow();
  });

  it.each([
    ["an external redirect", "https://example.com/privacy", 200, "noindex"],
    ["a non-final response", "https://over.garden/privacy", 307, "noindex"],
    ["a missing policy marker", "https://over.garden/privacy", 200, "index"],
  ])("rejects %s", (_label, finalUrl, status, text) => {
    expect(() =>
      assertPublicRoutePolicyContract({
        base: "https://over.garden",
        path: "/privacy",
        finalUrl,
        status,
        text,
        expectedMarker: "noindex",
      }),
    ).toThrow();
  });

  it("accepts the permanent Ukrainian-default canonical redirect", () => {
    expect(() =>
      assertCanonicalLegacyRedirect({
        path: "/uk/blog/example",
        status: 308,
        location: "/blog/example",
        expectedLocation: "/blog/example",
      }),
    ).not.toThrow();
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
