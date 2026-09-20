import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  PublicFeedPage,
  TrustedPublicFeedTopic,
} from "@/server/public-feed-repository";
import {
  buildPublicFeedHref,
  buildPublicHomeFeedContextModules,
  PublicHomeFeed,
  type PublicHomeFeedCopy,
} from "./public-home-feed";

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: ({
    modules,
  }: {
    modules: Array<{
      key: string;
      title: string;
      items: Array<{ href: string; label: string }>;
    }>;
  }) => (
    <aside data-testid="registered-context-rail">
      {modules.map((module) => (
        <section key={module.key}>
          <h2>{module.title}</h2>
          {module.items.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </section>
      ))}
    </aside>
  ),
  SiteShellContextRailModules: ({
    modules,
  }: {
    modules: Array<{
      key: string;
      title: string;
      items: Array<{ href: string; label: string }>;
    }>;
  }) => (
    <aside data-testid="mobile-context-rail">
      {modules.map((module) => (
        <section key={module.key}>
          <h2>{module.title}</h2>
          {module.items.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </section>
      ))}
    </aside>
  ),
}));

const copy: PublicHomeFeedCopy = {
  heading: "Стрічка",
  headingDescription: "Публічні записи садівників, від найновішого.",
  filterLabel: "Фільтрувати стрічку",
  recentFilter: "Останні",
  followedFilter: "Підписки",
  plantFilter: "Рослини",
  animalFilter: "Тварини",
  topicFilterLabel: "Перевірені теми",
  discuss: "Обговорення",
  publishedBy: "Автор",
  safeRegion: "Регіон",
  loadMore: "Наступна сторінка",
  firstPage: "До початку стрічки",
  paginationLabel: "Сторінки стрічки",
  endOfFeed: "Усі доступні записи переглянуто",
  emptyTitle: "Тут поки немає публічних записів",
  emptyBody:
    "Змініть фільтр або перейдіть до перевірених матеріалів OverGarden.",
  emptyPrimary: "Скинути фільтри",
  emptySecondary: "Відкрити знання",
  noResultsTitle: "За цими фільтрами нічого не знайдено",
  activeFiltersLabel: "Активні фільтри",
  loadingLabel: "Завантаження публічних журналів",
  errorTitle: "Стрічку не вдалося завантажити",
  errorBody: "Спробуйте ще раз або продовжуйте читати перевірені матеріали.",
  errorReference: "Код звернення:",
  retry: "Спробувати ще раз",
  trustedTopicsTitle: "Перевірені теми",
  trustedTopicsEmpty: "Поки немає тем із перевіреним публічним доказом.",
  knowledgeTitle: "Корисне поруч",
  guideLabel: "Як почати живий журнал",
  answerLabel: "Чому жовтіє листя томатів",
  kindLabels: {
    plant: "Рослина",
    animal: "Тварина",
  },
};

const topics: TrustedPublicFeedTopic[] = [
  { slug: "winter-care", label: "Зимовий догляд", entryCount: 4 },
  { slug: "quiet-topic", label: "Тема без записів", entryCount: 0 },
];

const page: PublicFeedPage = {
  entries: [
    {
      id: "entry-1",
      title: "Підсумок тижня для томата",
      excerpt:
        "Новий приріст рівний, листя тримає пружність, а після ранкового поливу ґрунт просихає передбачувано.",
      sourceLanguage: "uk",
      entryDate: "2026-07-10",
      publishedAt: "2026-07-10T12:00:00.000Z",
      publicPath: "/@demo_olena/tomato-week",
      object: {
        id: "object-1",
        displayName: "Томат Черрі",
        kind: "plant",
        publicPath: "/@demo_olena/objects/tomato",
        safeRegionCode: "UA-30",
      },
      author: {
        handle: "demo_olena",
        displayName: "Олена",
        avatarUrl: null,
        profilePath: "/@demo_olena",
      },
      media: [
        {
          id: "media-1",
          publicUrl: "https://media.over.garden/one.webp",
          focalX: 0.5,
          focalY: 0.5,
          intrinsicWidth: 2560,
          intrinsicHeight: 1440,
          placeholderDataUri: null,
          variantLongEdges: [480, 1280, 2560],
        },
        {
          id: "media-2",
          publicUrl: "https://media.over.garden/two.webp",
          focalX: 0.5,
          focalY: 0.5,
          intrinsicWidth: 800,
          intrinsicHeight: 600,
          placeholderDataUri: null,
          variantLongEdges: [],
        },
      ],
      topics: [{ slug: "winter-care", label: "Зимовий догляд" }],
    },
    {
      id: "entry-2",
      title: "Спокійний огляд сім'ї",
      excerpt: "Літ рівний, корму достатньо, закритого розплоду без змін.",
      sourceLanguage: "uk",
      entryDate: "2026-07-09",
      publishedAt: "2026-07-09T12:00:00.000Z",
      publicPath: "/@demo_olena/apiary-check",
      object: {
        id: "object-2",
        displayName: "Сім'я Карніка",
        kind: "animal",
        publicPath: "/@demo_olena/objects/carnica",
        safeRegionCode: null,
      },
      author: null,
      media: [],
      topics: [],
    },
  ],
  nextCursor: "eyJ2ZXJzaW9uIjoxfQ",
};

function render(
  overrides: Partial<React.ComponentProps<typeof PublicHomeFeed>> = {},
) {
  return renderToStaticMarkup(
    <PublicHomeFeed
      locale="uk"
      copy={copy}
      feed={page}
      request={{ cursor: null, kind: "all", topic: null }}
      topics={topics}
      state="ready"
      {...overrides}
    />,
  );
}

describe("the public home feed", () => {
  it("is a list of named articles inside the 704 px column", () => {
    const html = render();

    expect(html).toContain('data-public-home-feed="true"');
    expect(html).toContain(">Стрічка</h1>");
    // Criterion 1: the page declares no width of its own, so the shell's
    // 704 px `--container-content` is the column. A `max-w-3xl` here — which
    // is what this surface carried — is 768 and overflows it the moment the
    // shell's clamp moves.
    expect(html).not.toContain("max-w-3xl");
    expect(html).toContain('data-public-feed-list="true"');
    // Criterion 8: every card is an `<article>` with an accessible name.
    const articles = html.match(/<article[^>]*aria-labelledby="entry-card-/g);
    expect(articles).toHaveLength(2);
    expect(html).toContain('id="entry-card-entry-1-title"');
  });

  it("reserves every cover's box and keeps the media pipeline's srcset", () => {
    const html = render();

    // Criterion 3, and ADR-0022 D2: plain `<img srcset>` off
    // media.over.garden, the 480/1280 variants, no optimizer hop.
    expect(html).toContain('data-entry-card-media="cover"');
    // 4:3 is DESIGN.md §2.10's *card* ratio; 16:9 is a cover's, and a cover is
    // the entry page's hero rather than a card's picture.
    expect(html).toContain("aspect-card");
    expect(html).toContain("one-480.webp 480w");
    expect(html).toContain("one-1280.webp 1280w");
    expect(html).not.toContain("/_next/image");
    // One cover per card, not a grid of three: the second photograph of an
    // entry belongs on the entry, not in a feed.
    expect(html.match(/data-entry-card-media="cover"/g)).toHaveLength(1);
    // The card with no photograph reserves the same box.
    expect(html).toContain('data-entry-card-media="fallback"');
  });

  it("asks first for the first photograph, not for the first card", () => {
    // `OVE-470`. A feed that opens with a words-only entry has its first
    // photograph in the second card, on the first screen of a phone — and
    // `priority={index === 0}` left it lazy, so nothing asked for the largest
    // thing on the screen until layout had found it.
    const [withPhotograph, wordsOnly] = page.entries;
    const images = (html: string) =>
      [...html.matchAll(/<img\b[^>]*>/gu)].map((match) => match[0]);

    const [cover] = images(render());
    expect(cover).toMatch(/loading="eager"/u);
    expect(cover).toMatch(/fetchPriority="high"/iu);

    const reordered = images(
      render({ feed: { ...page, entries: [wordsOnly!, withPhotograph!] } }),
    );
    expect(reordered).toHaveLength(1);
    expect(reordered[0]).toMatch(/loading="eager"/u);
    expect(reordered[0]).toMatch(/fetchPriority="high"/iu);

    // Below the second card a photograph is below the first screen, and asking
    // for it early would take the link from what the reader is looking at.
    const [buried] = images(
      render({
        feed: {
          ...page,
          entries: [
            wordsOnly!,
            { ...wordsOnly!, id: "entry-3" },
            withPhotograph!,
          ],
        },
      }),
    );
    expect(buried).toMatch(/loading="lazy"/u);
    expect(buried).not.toMatch(/fetchPriority=/iu);
  });

  it("filters with chips that state whether they are on, and put the state in the URL", () => {
    const html = render({
      request: { cursor: null, kind: "plant", topic: "winter-care" },
    });

    // Criterion 4. `aria-pressed` is valid on a button and an ARIA error on a
    // link, which is why these are submit buttons in a GET form rather than
    // the anchors this row used to be.
    expect(html).toContain('data-feed-kind-filters="true"');
    expect(html).toContain('method="get"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toMatch(/<a[^>]*aria-pressed/u);
    // The pressed chip carries no name, so pressing it again clears the filter.
    expect(html).toMatch(
      /<button[^>]*type="submit"[^>]*aria-pressed="true"[^>]*>(?![^<]*name=)/u,
    );
    // The other filter travels as a hidden field, so choosing a kind keeps the
    // topic and the URL still describes the whole view.
    expect(html).toContain('type="hidden" name="topic" value="winter-care"');
    expect(html).toContain('type="hidden" name="kind" value="plant"');
    expect(html).toContain("overflow-x-auto");
  });

  it("offers no topic nobody has written about", () => {
    const html = render();

    // Criterion 5: a row of counts of which several are zero is not
    // information. A topic with no entries can only ever return nothing.
    expect(html).toContain("Зимовий догляд");
    expect(html).not.toContain("Тема без записів");
    expect(html).not.toContain('href="/?topic=quiet-topic"');
  });

  it("leaves the followed feed to a region of its own, so the page never asks who is reading", () => {
    // `SignedInOnly` answers from the session the document started; under a
    // server render with no provider that is a guest, and the link is absent.
    // What a gardener sees is asserted where it is decided:
    // `src/components/site-shell/signed-in-only.test.tsx`.
    expect(render()).not.toContain('href="/feed"');
  });

  it("paginates with real links and says when the feed is exhausted", () => {
    const more = render({
      request: { cursor: null, kind: "animal", topic: "winter-care" },
    });
    const end = render({ feed: { ...page, nextCursor: null } });

    expect(more).toContain(
      'href="/?cursor=eyJ2ZXJzaW9uIjoxfQ&amp;kind=animal&amp;topic=winter-care"',
    );
    expect(end).toContain("Усі доступні записи переглянуто");
  });

  it("tells the two empty states apart", () => {
    const firstRun = render({
      feed: { entries: [], nextCursor: null },
      state: "empty",
    });
    const noResults = render({
      feed: { entries: [], nextCursor: null },
      request: { cursor: null, kind: "animal", topic: "winter-care" },
      state: "empty",
    });

    // Nothing exists yet: one illustration, one sentence, one action.
    expect(firstRun).toContain('data-screen-state="empty-first-run"');
    expect(firstRun).toContain("/illustrations/empty-journal.webp");
    expect(firstRun).toContain("Тут поки немає публічних записів");

    // Something exists and the filters excluded it: no picture, the filters
    // that are on, and a way to clear them (DESIGN.md §5.4).
    expect(noResults).toContain('data-screen-state="empty-no-results"');
    expect(noResults).not.toContain("/illustrations/");
    expect(noResults).toContain("За цими фільтрами нічого не знайдено");
    expect(noResults).toContain("Тварина");
    expect(noResults).toContain("Зимовий догляд");
    expect(noResults).toContain("Скинути фільтри");
  });

  it("renders a skeleton shaped like the cards it replaces", () => {
    const html = render({ state: "loading" });

    expect(html).toContain('aria-label="Завантаження публічних журналів"');
    expect(html).toContain('aria-busy="true"');
    // The skeleton reserves the same 4:3 box, so the real card shifts nothing.
    expect(html).toContain("aspect-card");
  });

  it("renders a failure the page settled, with the class and the digest", () => {
    const html = render({
      state: "error",
      request: { cursor: null, kind: "animal", topic: null },
      failure: {
        failureClass: "connection_unavailable",
        digest: "ABC1234",
        relation: null,
      },
    });

    expect(html).toContain('data-screen-state="error"');
    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(html).toContain("Код звернення: ABC1234");
    expect(html).toContain("Стрічку не вдалося завантажити");
    expect(html).toContain('href="/?kind=animal"');
    expect(html).not.toMatch(/href="[^"]*(?:sign.?up|register|join)/i);
  });

  it("builds the rail from topics that exist, as real anchors", () => {
    // The rail is the crawlable path to a topic, since the row above is
    // buttons. A topic with no entries is not in it either.
    expect(buildPublicHomeFeedContextModules("ru", copy, topics)).toMatchObject(
      [
        {
          key: "feed-topics",
          title: "Перевірені теми",
          items: [
            {
              href: "/ru?topic=winter-care",
              label: "Зимовий догляд",
              meta: "4",
            },
          ],
        },
        {
          key: "feed-knowledge",
          title: "Корисне поруч",
          items: [
            {
              href: "/ru/guides/start-a-living-plant-record",
              label: "Як почати живий журнал",
            },
            {
              href: "/ru/answers/why-are-tomato-leaves-yellow",
              label: "Чому жовтіє листя томатів",
            },
          ],
        },
      ],
    );
  });

  it("normalizes feed href ordering without carrying an exhausted cursor", () => {
    expect(
      buildPublicFeedHref("bg", {
        cursor: null,
        kind: "plant",
        topic: "winter-care",
      }),
    ).toBe("/bg?kind=plant&topic=winter-care");
    expect(
      buildPublicFeedHref("uk", { cursor: null, kind: "all", topic: null }),
    ).toBe("/");
  });
});

describe("an entry written in another language", () => {
  it("carries its own lang in a feed the reader is browsing in theirs", () => {
    // WCAG 3.1.2, and the point of the product: a Bulgarian gardener's entry
    // appears in a Ukrainian reader's feed untranslated, so the words are
    // Bulgarian and are marked as Bulgarian. The reader's chrome around them
    // stays Ukrainian.
    const html = render({
      feed: {
        ...page,
        entries: [
          {
            ...page.entries[0]!,
            id: "entry-bg",
            sourceLanguage: "bg" as const,
            title: "Седмичен преглед на доматите",
          },
        ],
      },
    });

    expect(html).toContain('lang="bg"');
    expect(html).toContain("Седмичен преглед на доматите");
  });

  it("marks nothing when the entry and the page agree", () => {
    const html = render();

    // One `lang` on the surface itself, and not one per card.
    expect(html.match(/lang="uk"/g)).toHaveLength(1);
    expect(html).not.toContain('lang="bg"');
    expect(html).not.toContain('lang="ru"');
  });
});
