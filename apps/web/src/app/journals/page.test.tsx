import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PublicJournalDirectoryFacets,
  PublicJournalDirectoryPage,
} from "@/server/public-journal-directory-repository";

const mocks = vi.hoisted(() => ({
  listPage: vi.fn(),
  listFacets: vi.fn(),
  resolveSearchScope: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: mocks.redirect,
}));

vi.mock(
  "@/server/public-journal-directory-repository",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/server/public-journal-directory-repository")
      >();
    return {
      ...actual,
      listPublicJournalDirectoryPage: mocks.listPage,
      listPublicJournalDirectoryFacets: mocks.listFacets,
      resolvePublicJournalDirectorySearchScope: mocks.resolveSearchScope,
    };
  },
);

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

const request = {
  query: "орхідея",
  kind: "plant",
  catalog: null,
  topic: null,
  season: "all",
  region: null,
  sort: "relevance",
  page: 1,
} as const;

const page: PublicJournalDirectoryPage = {
  request,
  cards: [],
  totalCount: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
  searchSource: "database",
  searchFallbackReason: null,
};

const facets: PublicJournalDirectoryFacets = {
  kinds: [],
  catalogs: [],
  topics: [],
  regions: [],
};

describe("/journals", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.listPage.mockResolvedValue(page);
    mocks.listFacets.mockResolvedValue(facets);
    mocks.resolveSearchScope.mockResolvedValue({
      entryIds: ["00000000-0000-4000-8000-000000000001"],
      source: "hybrid",
      reason: null,
    });
  });

  it("renders localized URL-owned search through canonical public repositories", async () => {
    const { default: Route, generateMetadata } =
      await import("../[locale]/journals/page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "bg" }),
        searchParams: Promise.resolve({ q: "орхідея", kind: "plant" }),
      }),
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "bg" }),
    });

    expect(mocks.listPage).toHaveBeenCalledWith(
      request,
      "bg",
      expect.objectContaining({ searchScope: expect.any(Object) }),
    );
    expect(mocks.listFacets).toHaveBeenCalledTimes(2);
    expect(html).toContain('lang="bg"');
    expect(html).toContain("Дневници");
    // The mocked directory lists nothing: an empty listing stays noindex (ADR-0022, D3).
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(metadata.alternates).toBeUndefined();
  });

  it("renders a recoverable guest error if either canonical repository fails", async () => {
    mocks.listPage.mockRejectedValue(new Error("database unavailable"));
    const { default: Route } = await import("../[locale]/journals/page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ kind: "animal" }),
      }),
    );

    expect(html).toContain("Журнали тимчасово недоступні");
    expect(html).not.toMatch(/sign.?in|register|увійти|створити акаунт/i);
  });

  it("renders the same recoverable error when candidate-scope resolution fails", async () => {
    mocks.resolveSearchScope.mockRejectedValue(
      new Error("database unavailable"),
    );
    const { default: Route } = await import("../[locale]/journals/page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ q: "орхідея" }),
      }),
    );

    expect(html).toContain('data-public-journal-directory-state="error"');
    expect(html).toContain("Журнали тимчасово недоступні");
  });

  it("redirects the unprefixed route to a persisted non-Ukrainian locale with filters", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    const { default: RootJournalsRoute } = await import("./page");

    await RootJournalsRoute({
      searchParams: Promise.resolve({
        q: "пчёлы",
        kind: "animal",
        page: "2",
      }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/ru/journals?q=%D0%BF%D1%87%D1%91%D0%BB%D1%8B&kind=animal&page=2",
    );
  });
});
