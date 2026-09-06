import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";

const mocks = vi.hoisted(() => ({
  resolvePublicCatalogPermalink: vi.fn(),
  resolvePublicCatalogAlias: vi.fn(),
}));

vi.mock("@/server/public-catalog-address-repository", () => ({
  resolvePublicCatalogPermalink: mocks.resolvePublicCatalogPermalink,
  resolvePublicCatalogAlias: mocks.resolvePublicCatalogAlias,
}));

import { resolveCatalogAliasRoute } from "./catalog-alias-route";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

describe("catalog alias resolvers (ADR-0026 D8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 308 to the canonical page for a permalink, in the default locale", async () => {
    mocks.resolvePublicCatalogPermalink.mockResolvedValueOnce({
      status: "redirect",
      catalogItemId: ITEM_ID,
      canonicalPath: "/species/solanum-lycopersicum",
    });
    const response = await resolveCatalogAliasRoute({
      scheme: "id",
      value: ITEM_ID,
      request: new Request(`https://over.garden/id/${ITEM_ID}`),
    });

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "https://over.garden/species/solanum-lycopersicum",
    );
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(mocks.resolvePublicCatalogPermalink).toHaveBeenCalledWith(ITEM_ID);
    expect(mocks.resolvePublicCatalogAlias).not.toHaveBeenCalled();
  });

  it("keeps the locale the request carried when an external identifier resolves", async () => {
    mocks.resolvePublicCatalogAlias.mockResolvedValueOnce({
      status: "redirect",
      catalogItemId: ITEM_ID,
      canonicalPath: "/species/solanum-lycopersicum/de-barao",
    });
    const response = await resolveCatalogAliasRoute({
      scheme: "eppo",
      value: "LYPES",
      request: new Request("https://over.garden/bg/eppo/LYPES"),
      locale: "bg",
    });

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "https://over.garden/bg/species/solanum-lycopersicum/de-barao",
    );
    expect(mocks.resolvePublicCatalogAlias).toHaveBeenCalledWith("eppo", "LYPES");
  });

  it("answers a real, localized, noindex 404 document when nothing carries the identifier", async () => {
    mocks.resolvePublicCatalogAlias.mockResolvedValueOnce({ status: "not_found" });
    const response = await resolveCatalogAliasRoute({
      scheme: "wikidata",
      value: "Q1",
      request: new Request("https://over.garden/ru/wikidata/Q1"),
      locale: "ru",
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    const html = await response.text();
    expect(html).toContain(getPublicSurfaceCopy("ru").organism.notFound);
    expect(html).not.toContain(getPublicSurfaceCopy("uk").organism.notFound);
  });
});
