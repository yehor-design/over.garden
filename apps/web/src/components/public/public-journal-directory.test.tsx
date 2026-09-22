import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getPublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import type {
  PublicJournalDirectoryFacets,
  PublicJournalDirectoryPage,
} from "@/server/public-journal-directory-repository";
import {
  buildPublicJournalDirectoryHref,
  PublicJournalDirectory,
} from "./public-journal-directory";

// `FilterBar` applies on change through the router once hydrated; a static
// render only needs the hook to exist. What the bar does with it is asserted
// in `src/components/ui/filter-bar.test.tsx`, against a real interaction.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: ({
    modules,
  }: {
    modules: Array<{ key: string; title: string }>;
  }) => (
    <aside data-testid="registered-context-rail">
      {modules.map((module) => (
        <h2 key={module.key}>{module.title}</h2>
      ))}
    </aside>
  ),
  SiteShellContextRailModules: ({
    modules,
  }: {
    modules: Array<{ key: string; title: string }>;
  }) => (
    <aside data-testid="mobile-context-rail">
      {modules.map((module) => (
        <h2 key={module.key}>{module.title}</h2>
      ))}
    </aside>
  ),
}));

const request = {
  query: "відновлення",
  kind: "animal",
  catalog: "visual-domestic-shorthair",
  topic: "stress-and-recovery",
  season: "summer",
  region: "BG-23",
  sort: "oldest",
  page: 2,
} as const;

const page: PublicJournalDirectoryPage = {
  request,
  totalCount: 18,
  totalPages: 3,
  hasPreviousPage: true,
  hasNextPage: true,
  searchSource: "hybrid",
  searchFallbackReason: null,
  cards: [
    {
      title: "Відновлення після зміни режиму",
      excerpt:
        "Апетит повернувся до звичного рівня, активність стабільна, наступна перевірка запланована без додаткового втручання.",
      sourceLanguage: "uk",
      entryDate: "2026-07-10",
      publishedAt: "2026-07-10T12:00:00.000Z",
      publicPath: "/journal/recovery-check",
      season: "summer",
      safeRegionCode: "BG-23",
      object: {
        displayName: "Кішка після адаптації",
        kind: "animal",
        identityLabel: "Domestic Shorthair",
        catalogKind: "breed",
        catalogSlug: "domestic-shorthair",
        catalogPath: "/breed/domestic-shorthair",
        publicPath: "/lineage/objects/00000000-0000-4000-8000-000000000101",
      },
      author: {
        handle: "demo_danylo",
        displayName: "Данило",
        avatarUrl: null,
        profilePath: "/@demo_danylo",
      },
      media: [
        {
          publicUrl: "https://media.example/one.png",
          focalX: 0.5,
          focalY: 0.5,
          intrinsicWidth: 800,
          intrinsicHeight: 600,
          placeholderDataUri: null,
          variantLongEdges: [],
        },
        {
          publicUrl: "https://media.example/two.png",
          focalX: 0.5,
          focalY: 0.5,
          intrinsicWidth: 800,
          intrinsicHeight: 600,
          placeholderDataUri: null,
          variantLongEdges: [],
        },
        {
          publicUrl: "https://media.example/three.png",
          focalX: 0.5,
          focalY: 0.5,
          intrinsicWidth: 800,
          intrinsicHeight: 600,
          placeholderDataUri: null,
          variantLongEdges: [],
        },
      ],
      topics: [
        {
          slug: "stress-and-recovery",
          label: "Відновлення після стресу",
        },
      ],
    },
    {
      title: "Коротка перевірка без фото",
      excerpt: "Стан без різких змін.",
      sourceLanguage: "uk",
      entryDate: "2026-06-20",
      publishedAt: "2026-06-20T12:00:00.000Z",
      publicPath: "/journal/no-media-check",
      season: "summer",
      safeRegionCode: null,
      object: {
        displayName: "Коза у дворі",
        kind: "animal",
        identityLabel: null,
        catalogKind: null,
        catalogSlug: null,
        catalogPath: null,
        publicPath: "/lineage/objects/00000000-0000-4000-8000-000000000102",
      },
      author: null,
      media: [],
      topics: [],
    },
  ],
};

const facets: PublicJournalDirectoryFacets = {
  kinds: [
    { kind: "plant", count: 42 },
    { kind: "animal", count: 16 },
    { kind: "animal", count: 9 },
  ],
  catalogs: [
    {
      slug: "visual-domestic-shorthair",
      label: "Domestic Shorthair",
      kind: "breed",
      count: 3,
    },
  ],
  topics: [
    {
      slug: "stress-and-recovery",
      label: "Відновлення після стресу",
      count: 8,
    },
  ],
  regions: [{ code: "BG-23", count: 7 }],
};

describe("public journal directory", () => {
  it("discloses bounded degraded search without turning it into a blocking error", () => {
    const html = renderToStaticMarkup(
      <PublicJournalDirectory
        locale="uk"
        copy={getPublicJournalDirectoryCopy("uk")}
        page={{
          ...page,
          searchSource: "bounded_fallback",
          searchFallbackReason: "timeout",
        }}
        facets={facets}
        state="ready"
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('data-public-journal-search-degraded="true"');
    expect(html).toContain("Пошук тимчасово обмежений");
    expect(html).toContain("Кішка після адаптації");
    expect(html).not.toContain('data-public-journal-directory-state="error"');
  });

  it("renders the facets, the count and every card as a named article", () => {
    const html = renderToStaticMarkup(
      <PublicJournalDirectory
        locale="uk"
        copy={getPublicJournalDirectoryCopy("uk")}
        page={page}
        facets={facets}
        state="ready"
      />,
    );

    expect(html).toContain('data-public-journal-directory="true"');
    expect(html).toContain('data-public-journal-directory-state="ready"');
    expect(html).toContain(">Журнали</h1>");
    // Criterion 5: one parameter per facet, named for the facet, and the sort
    // as its own control beside them.
    expect(html).toContain('data-filter-bar-form="true"');
    expect(html).toContain('name="q"');
    // Plants or animals is the one mode, as links; the rest sit in the panel.
    expect(html).toContain('data-filter-bar-modes="true"');
    expect(html).toMatch(/href="\/journals\?[^"]*kind=plant[^"]*"/u);
    expect(html).not.toContain('data-filter-bar-facet="kind"');
    expect(html).toContain('data-filter-bar-facet="catalog"');
    expect(html).toContain('data-filter-bar-facet="topic"');
    expect(html).toContain('data-filter-bar-facet="season"');
    expect(html).toContain('data-filter-bar-facet="region"');
    expect(html).toContain('data-filter-bar-sort="true"');
    // Criterion 3: the count is visible and lives in a polite live region.
    expect(html).toContain('data-journal-result-count="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("18 записів");
    // One button, labelled with the applied *secondary* filters: catalogue,
    // topic, season and region. The query, the mode and the sort are shown
    // where they are set, not counted twice (OVE-482).
    expect(html).toContain('data-filter-bar-open="true"');
    expect(html).toContain("Фільтри (4)");

    expect(html).toContain("Кішка після адаптації");
    expect(html).toContain('href="/breed/domestic-shorthair"');
    expect(html).toContain('href="/@demo_danylo"');
    // Each result is an `<article>` a reader can be told the name of, and it
    // keeps the exact directory URL it came from.
    expect(html).toContain(
      'aria-labelledby="entry-card-/journal/recovery-check-title"',
    );
    expect(html).toContain(
      'href="/journal/recovery-check?from=%2Fjournals%3Fq%3D',
    );
    // One cover per card, and the card with no photograph reserves the box.
    expect(html).toContain('data-entry-card-media="cover"');
    expect(html).toContain('data-entry-card-media="fallback"');
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).not.toMatch(
      /ownerUserId|entryId|spaceId|derivativeKey|quarantine|latitude|longitude|href="[^"]*(?:sign-in|register)|>Створити акаунт</i,
    );
  });

  it("renders removable active filters, reset, and page-preserving continuation", () => {
    const html = renderToStaticMarkup(
      <PublicJournalDirectory
        locale="ru"
        copy={getPublicJournalDirectoryCopy("ru")}
        page={page}
        facets={facets}
        state="ready"
      />,
    );

    expect(html).toContain('aria-label="Активные фильтры"');
    expect(html).toContain('href="/ru/journals"');
    // Criterion 2: a chip's removal is a real link, so it works unhydrated.
    expect(html).toMatch(/<a[^>]*aria-label="Убрать фильтр: [^"]+"/u);
    expect(html).toContain('data-slot="chip"');
    expect(html).toContain(
      'href="/ru/journals?q=%D0%B2%D1%96%D0%B4%D0%BD%D0%BE%D0%B2%D0%BB%D0%B5%D0%BD%D0%BD%D1%8F&amp;catalog=visual-domestic-shorthair',
    );
    expect(html).toContain("Показать больше журналов");
    expect(html).toContain("Страница 2 из 3");
    expect(html).toContain("page=3");
  });

  it("tells the two empty states apart, and settles a failure into a class", () => {
    const copy = getPublicJournalDirectoryCopy("bg");
    const emptyPage = {
      ...page,
      cards: [],
      totalCount: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    };
    const loading = renderToStaticMarkup(
      <PublicJournalDirectory
        locale="bg"
        copy={copy}
        page={emptyPage}
        facets={facets}
        state="loading"
      />,
    );
    const noResults = renderToStaticMarkup(
      <PublicJournalDirectory
        locale="bg"
        copy={copy}
        page={emptyPage}
        facets={facets}
        state="empty"
      />,
    );
    const firstRun = renderToStaticMarkup(
      <PublicJournalDirectory
        locale="bg"
        copy={copy}
        page={{
          ...emptyPage,
          request: {
            query: "",
            kind: "all",
            catalog: null,
            topic: null,
            season: "all",
            region: null,
            sort: "recent",
            page: 1,
          },
        }}
        facets={facets}
        state="empty"
      />,
    );
    const failed = renderToStaticMarkup(
      <PublicJournalDirectory
        locale="bg"
        copy={copy}
        page={emptyPage}
        facets={facets}
        state="error"
        failure={{
          failureClass: "query_timeout",
          digest: "ABC1234",
          relation: null,
        }}
      />,
    );

    expect(loading).toContain('aria-label="Зареждане на публичните дневници"');

    // Criterion 8: the filters that are on, a way to clear them, no picture.
    expect(noResults).toContain('data-screen-state="empty-no-results"');
    expect(noResults).toContain("Няма намерени дневници");
    expect(noResults).toContain("Нулиране на всичко");
    expect(noResults).not.toContain("/illustrations/");

    // Nothing filtered and still nothing there is the other state entirely:
    // the product has no public entries yet, and that one has a picture.
    expect(firstRun).toContain('data-screen-state="empty-first-run"');
    expect(firstRun).toContain("/illustrations/empty-journal.webp");
    expect(firstRun).toContain("Още няма публични дневници");

    // ADR-0023: a class the operator can read, a digest the reader can quote.
    expect(failed).toContain('data-screen-state="error"');
    expect(failed).toContain('data-section-failure="query_timeout"');
    expect(failed).toContain("Код за справка: ABC1234");
    expect(failed).toContain("Опитайте отново");

    for (const html of [loading, noResults, firstRun, failed]) {
      expect(html).not.toMatch(
        /href="[^"]*(?:sign-in|register)|>Вход<|>Регистрация</i,
      );
    }
  });

  it("builds canonical localized URLs with stable ordering and default omission", () => {
    expect(buildPublicJournalDirectoryHref("uk", request)).toBe(
      "/journals?q=%D0%B2%D1%96%D0%B4%D0%BD%D0%BE%D0%B2%D0%BB%D0%B5%D0%BD%D0%BD%D1%8F&kind=animal&catalog=visual-domestic-shorthair&topic=stress-and-recovery&season=summer&region=BG-23&sort=oldest&page=2",
    );
    expect(
      buildPublicJournalDirectoryHref("bg", {
        query: "",
        kind: "all",
        catalog: null,
        topic: null,
        season: "all",
        region: null,
        sort: "recent",
        page: 1,
      }),
    ).toBe("/bg/journals");
  });
});

describe("a card written in another language", () => {
  it("carries its own lang, and marks nothing when the two agree", () => {
    // The same rule as the feed (WCAG 3.1.2): the directory lists other
    // gardeners' words untranslated, so the words keep their language while
    // the filters and headings around them keep the reader's.
    const bulgarianCard = {
      ...page.cards[0]!,
      sourceLanguage: "bg" as const,
      title: "Възстановяване след смяна на режима",
    };
    const mixed = renderToStaticMarkup(
      <PublicJournalDirectory
        locale="uk"
        copy={getPublicJournalDirectoryCopy("uk")}
        page={{ ...page, cards: [bulgarianCard] }}
        facets={facets}
        state="ready"
      />,
    );
    expect(mixed).toContain('lang="bg"');
    expect(mixed).toContain("Възстановяване след смяна на режима");

    const uniform = renderToStaticMarkup(
      <PublicJournalDirectory
        locale="uk"
        copy={getPublicJournalDirectoryCopy("uk")}
        page={page}
        facets={facets}
        state="ready"
      />,
    );
    expect(uniform).not.toContain('lang="bg"');
    expect(uniform).not.toContain('lang="ru"');
    // One on the surface, none on a card.
    expect(uniform.match(/lang="uk"/g)).toHaveLength(1);
  });
});
