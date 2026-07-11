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

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // Production still uses next/image; SSR assertions only need public output.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
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
  cards: [
    {
      title: "Відновлення після зміни режиму",
      excerpt:
        "Апетит повернувся до звичного рівня, активність стабільна, наступна перевірка запланована без додаткового втручання.",
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
        catalogPath: "/breed/domestic-shorthair",
      },
      author: {
        handle: "demo_danylo",
        displayName: "Данило",
        avatarUrl: null,
        profilePath: "/@demo_danylo",
      },
      media: [
        { publicUrl: "https://media.example/one.png" },
        { publicUrl: "https://media.example/two.png" },
        { publicUrl: "https://media.example/three.png" },
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
        catalogPath: null,
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
    { kind: "bee_colony", count: 9 },
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
  it("renders dense real result context and retains the exact directory URL through detail", () => {
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
    expect(html).toContain('name="q"');
    expect(html).toContain('name="kind"');
    expect(html).toContain('name="catalog"');
    expect(html).toContain('name="topic"');
    expect(html).toContain('name="season"');
    expect(html).toContain('name="region"');
    expect(html).toContain('name="sort"');
    expect(html).toContain("18");
    expect(html).toContain("Кішка після адаптації");
    expect(html).toContain('href="/breed/domestic-shorthair"');
    expect(html).toContain('href="/@demo_danylo"');
    expect(html).toContain('data-journal-result-media-count="3"');
    expect(html).toContain('data-journal-result-media-count="0"');
    expect(html).toContain(
      'href="/journal/recovery-check?from=%2Fjournals%3Fq%3D',
    );
    expect(html.match(/<img /g)).toHaveLength(3);
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
    expect(html).toContain(
      'href="/ru/journals?q=%D0%B2%D1%96%D0%B4%D0%BD%D0%BE%D0%B2%D0%BB%D0%B5%D0%BD%D0%BD%D1%8F&amp;catalog=visual-domestic-shorthair',
    );
    expect(html).toContain("Показать больше журналов");
    expect(html).toContain("Страница 2 из 3");
    expect(html).toContain("page=3");
  });

  it("keeps loading, empty, error, and exhausted states useful and read-open", () => {
    const copy = getPublicJournalDirectoryCopy("bg");
    const states = (["loading", "empty", "error"] as const).map((state) =>
      renderToStaticMarkup(
        <PublicJournalDirectory
          locale="bg"
          copy={copy}
          page={{ ...page, cards: [], totalCount: 0, hasNextPage: false }}
          facets={facets}
          state={state}
        />,
      ),
    );
    const exhausted = renderToStaticMarkup(
      <PublicJournalDirectory
        locale="bg"
        copy={copy}
        page={{ ...page, hasNextPage: false }}
        facets={facets}
        state="ready"
      />,
    );

    expect(states[0]).toContain(
      'aria-label="Зареждане на публичните дневници"',
    );
    expect(states[1]).toContain("Няма намерени дневници");
    expect(states[1]).toContain('href="/bg/journals"');
    expect(states[2]).toContain("Дневниците временно не са достъпни");
    expect(states[2]).toContain("Опитайте отново");
    expect(exhausted).toContain("Всички намерени дневници са показани");
    for (const html of states) {
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

  it("preserves the gated visual corpus through forms, reset, pagination, and detail return", () => {
    const html = renderToStaticMarkup(
      <PublicJournalDirectory
        locale="uk"
        copy={getPublicJournalDirectoryCopy("uk")}
        page={{ ...page, request: { ...page.request, page: 1 } }}
        facets={facets}
        state="ready"
        visualCorpus
      />,
    );

    expect(html).toContain(
      'type="hidden" name="__visualJournals" value="corpus"',
    );
    expect(html).toContain(
      'data-journal-filter-state="/journals?q=%D0%B2%D1%96%D0%B4%D0%BD%D0%BE%D0%B2%D0%BB%D0%B5%D0%BD%D0%BD%D1%8F&amp;kind=animal&amp;catalog=visual-domestic-shorthair&amp;topic=stress-and-recovery&amp;season=summer&amp;region=BG-23&amp;sort=oldest&amp;__visualJournals=corpus"',
    );
    expect(html).toContain('href="/journals?__visualJournals=corpus"');
    expect(html).toContain("%26__visualJournals%3Dcorpus");
    expect(html).toContain("page=2&amp;__visualJournals=corpus");
  });
});
