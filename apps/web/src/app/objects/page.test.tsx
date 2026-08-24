import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicObjectCatalogPage } from "@/server/public-object-catalog-repository";

const mocks = vi.hoisted(() => ({
  listPublicObjectCatalogPage: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  resolveVisualFixturePublicObjectCatalogMode: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: mocks.redirect,
}));

vi.mock("@/server/public-object-catalog-repository", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/server/public-object-catalog-repository")
    >();
  return {
    ...actual,
    listPublicObjectCatalogPage: mocks.listPublicObjectCatalogPage,
  };
});

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/lib/visual-fixtures/public-object-catalog-scenarios", () => ({
  resolveVisualFixturePublicObjectCatalogMode:
    mocks.resolveVisualFixturePublicObjectCatalogMode,
}));

const page: PublicObjectCatalogPage = {
  request: { kind: "animal", identity: "breed", query: "коза", page: 1 },
  cards: [],
  totalCount: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

describe("/objects", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resolveVisualFixturePublicObjectCatalogMode.mockReturnValue(null);
    mocks.listPublicObjectCatalogPage.mockResolvedValue(page);
  });

  it("renders localized URL-owned filters through the public repository", async () => {
    const { default: Route, generateMetadata } =
      await import("../[locale]/objects/page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "bg" }),
        searchParams: Promise.resolve({
          kind: "animal",
          identity: "breed",
          q: "коза",
          page: "1",
        }),
      }),
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "bg" }),
    });

    expect(mocks.listPublicObjectCatalogPage).toHaveBeenCalledWith(
      { kind: "animal", identity: "breed", query: "коза", page: 1 },
      "bg",
    );
    expect(html).toContain('lang="bg"');
    expect(html).toContain("Живи обекти");
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(metadata.alternates).toBeUndefined();
  });

  it("renders a recoverable error without redirecting a guest to auth", async () => {
    mocks.listPublicObjectCatalogPage.mockRejectedValue(
      new Error("repository unavailable"),
    );
    const { default: Route } = await import("../[locale]/objects/page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ kind: "plant" }),
      }),
    );

    expect(html).toContain("Каталог тимчасово недоступний");
    expect(html).not.toMatch(/sign.?in|register|увійти|створити акаунт/i);
  });

  it("renders stable loading and error fixture states without querying data", async () => {
    const { default: Route } = await import("../[locale]/objects/page");

    mocks.resolveVisualFixturePublicObjectCatalogMode.mockReturnValue(
      "loading",
    );
    const loadingHtml = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ __visualObjects: "loading" }),
      }),
    );

    mocks.resolveVisualFixturePublicObjectCatalogMode.mockReturnValue("error");
    const errorHtml = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ __visualObjects: "error" }),
      }),
    );

    expect(loadingHtml).toContain('data-public-object-catalog-state="loading"');
    expect(errorHtml).toContain('data-public-object-catalog-state="error"');
    expect(mocks.listPublicObjectCatalogPage).not.toHaveBeenCalled();
  });

  it("renders the localized loading boundary without route props", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    const { default: Loading } = await import("../[locale]/objects/loading");

    const html = renderToStaticMarkup(await Loading());

    expect(html).toContain('lang="bg"');
    expect(html).toContain('data-public-object-catalog-state="loading"');
    expect(html).toContain("Живи обекти");
  });

  it("redirects the unprefixed route to the persisted non-Ukrainian locale", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    const { default: RootObjectsRoute } = await import("./page");

    await RootObjectsRoute({
      searchParams: Promise.resolve({ kind: "animal", page: "2" }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/ru/objects?kind=animal&page=2",
    );
  });
});
