import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  // `FilterBar` navigates through the router once hydrated. A static render
  // only needs the hook to exist; the behaviour is proven against a real
  // interaction in `src/components/ui/filter-bar.test.tsx`.
  useRouter: () => ({ push: vi.fn() }),
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
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
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
      await import("@/app/[locale]/q/journals/page");
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
    // The page is the faceted bar now, not a form behind an Apply button.
    expect(html).toContain('data-filter-bar-form="true"');
    expect(html).toContain('data-filter-bar-modes="true"');
    expect(html).toContain('data-filter-bar-sort="true"');
    expect(html).toContain('aria-live="polite"');
    // The mocked directory lists nothing: an empty listing stays noindex (ADR-0022, D3).
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(metadata.alternates).toBeUndefined();
  });

  it("renders a recoverable guest error if either canonical repository fails", async () => {
    mocks.listPage.mockRejectedValue(new Error("database unavailable"));
    const { default: Route } = await import("@/app/[locale]/q/journals/page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ kind: "animal" }),
      }),
    );

    expect(html).toContain("Журнали тимчасово недоступні");
    // ADR-0023: the class and the digest travel with the failure, so the
    // reader and the log line quote the same string.
    expect(html).toMatch(/data-section-failure="[a-z_]+"/u);
    expect(html).toContain("Код звернення:");
    expect(html).not.toMatch(/sign.?in|register|увійти|створити акаунт/i);
  });

  it("renders the same recoverable error when candidate-scope resolution fails", async () => {
    mocks.resolveSearchScope.mockRejectedValue(
      new Error("database unavailable"),
    );
    const { default: Route } = await import("@/app/[locale]/q/journals/page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ q: "орхідея" }),
      }),
    );

    expect(html).toContain('data-public-journal-directory-state="error"');
    expect(html).toContain("Журнали тимчасово недоступні");
  });

  it("defers a failed static read instead of caching the error document", async () => {
    mocks.listPage.mockRejectedValue(new Error("database unavailable"));
    const { renderPublicJournalsPage } =
      await import("@/app/[locale]/journals/page");
    await expect(
      renderPublicJournalsPage("uk", {}, "static"),
    ).rejects.toMatchObject({
      name: "StaticRenderDeferred",
      reason: "read_failed",
    });
  });

  /**
   * The unprefixed route renders. It used to redirect a Russian or Bulgarian
   * reader to their own prefix, and that could not work: by the time this runs
   * the shell has streamed, so the status is already `200` and the location
   * header has sailed. Measured on production on 2026-09-12, `/journals` came
   * back 81 592 bytes with no JSON-LD while `/bg/journals` rendered in
   * 210 401. ADR-0029 D10 settles it anyway — a canonical URL answers `200` to
   * everyone.
   */
  it("renders in the default locale whatever the reader's interface locale is", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    const { default: RootJournalsRoute } = await import("./page");

    const rendered = await RootJournalsRoute();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(rendered).toBeTruthy();
  });
});
