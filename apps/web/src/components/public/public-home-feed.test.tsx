import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  PublicFeedPage,
  TrustedPublicFeedTopic,
} from "@/server/public-feed-repository";
import { buildPublicFeedHref } from "./public-feed-entry-card";
import {
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
  kindFacetLabel: "Рослини чи тварини",
  allKinds: "Усі",
  allTopics: "Усі теми",
  removeFilter: "Прибрати фільтр",
  topicFilterLabel: "Перевірені теми",
  discuss: "Обговорення",
  publishedBy: "Автор",
  safeRegion: "Регіон",
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

  // OVE-492 (OG-UX-041): photographs at their own proportions, several side
  // by side, and no box at all for a text note.
  it("keeps the media pipeline's srcset and draws no box for a text note", () => {
    const html = render();

    // ADR-0022 D2: plain `<img srcset>` off media.over.garden, the 480/1280
    // variants, no optimizer hop.
    expect(html).toContain("one-480.webp 480w");
    expect(html).toContain("one-1280.webp 1280w");
    expect(html).not.toContain("/_next/image");
    // The first entry has two photographs, and the card shows both.
    expect(html).toContain(
      'data-entry-card-media="grid" data-entry-card-media-count="2"',
    );
    // The second is a text note: its card draws no photograph's box.
    expect(html.match(/data-entry-card-media=/g)).toHaveLength(1);
    expect(html).not.toContain("aspect-card");
  });

  it("reads author and date before the object, the words and the photographs", () => {
    const html = render();
    const card = html.slice(
      html.indexOf('data-entry-card="entry-1"'),
      html.indexOf('data-entry-card="entry-2"'),
    );
    const at = (needle: string) => card.indexOf(needle);
    expect(at("Олена")).toBeGreaterThan(-1);
    expect(at("Олена")).toBeLessThan(at("10 лип. 2026"));
    expect(at("10 лип. 2026")).toBeLessThan(at("Томат Черрі"));
    expect(at("Томат Черрі")).toBeLessThan(at("Підсумок тижня для томата"));
    expect(at("Підсумок тижня для томата")).toBeLessThan(
      at("data-entry-card-media"),
    );
    expect(at("data-entry-card-media")).toBeLessThan(at("Обговорення"));
  });

  it("dates a backdated entry by its observation and names its publication", () => {
    const [first] = page.entries;
    const html = render({
      feed: {
        ...page,
        entries: [
          {
            ...first!,
            entryDate: "2026-05-03",
            publishedAt: "2026-09-12T18:40:00.000Z",
            excerptTruncated: true,
          },
        ],
      },
    });

    expect(html).toContain('<time dateTime="2026-05-03"');
    expect(html).toContain(">3 трав. 2026 р.</time>");
    expect(html).toContain(">Опубліковано 12 вер. 2026 р.</time>");
    expect(html).toContain('data-entry-card-read-more="true"');
    // An entry published the day it was observed says so once.
    expect(render()).not.toContain("Опубліковано");
    expect(render()).not.toContain('data-entry-card-read-more="true"');
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
    // Two photographs in that card: the first is asked for at once, the
    // second waits.
    expect(reordered).toHaveLength(2);
    expect(reordered[0]).toMatch(/loading="eager"/u);
    expect(reordered[0]).toMatch(/fetchPriority="high"/iu);
    expect(reordered[1]).toMatch(/loading="lazy"/u);

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

  // OVE-492 (OG-UX-015): one discovery bar. Latest and Following are the
  // modes; plants or animals and the topics are facets behind one button,
  // never rows of chips above the first card.
  it("filters through the shared bar: modes as links, facets behind Filters", () => {
    const html = render({
      request: { cursor: null, kind: "plant", topic: "winter-care" },
    });

    expect(html).toContain('data-filter-bar-modes="true"');
    expect(html).toMatch(
      /<a[^>]*aria-current="page"[^>]*href="\/"[^>]*>Останні<\/a>|<a[^>]*href="\/"[^>]*aria-current="page"[^>]*>Останні<\/a>/u,
    );
    expect(html).toMatch(/<a[^>]*href="\/feed"[^>]*>Підписки<\/a>/u);
    expect(html).toContain('data-filter-bar-open="true"');
    expect(html).toContain("Фільтри (2)");
    expect(html).toContain('data-filter-bar-facet="kind"');
    expect(html).toContain('data-filter-bar-facet="topic"');
    // The active filters are chips that remove themselves by a real link.
    expect(html).toContain('href="/?topic=winter-care"');
    expect(html).toContain('href="/?kind=plant"');
    // No row of chips repeating plants and animals above the cards.
    expect(html).not.toContain('data-feed-kind-filters="true"');
    expect(html).not.toContain('data-feed-topic-filters="true"');
    expect(html).not.toContain("aria-pressed");
  });

  // OG-UX-015: "Рослини" is the kind facet; the system topic of the same
  // name is not offered again, in the panel or the rail — unless it is the
  // one in the URL, so the reader can remove it.
  it("does not offer plants or animals a second time as topics", () => {
    const withKindTopics: TrustedPublicFeedTopic[] = [
      ...topics,
      { slug: "plants", label: "Рослини", entryCount: 63 },
      { slug: "animals", label: "Тварини", entryCount: 12 },
    ];
    const html = render({ topics: withKindTopics });
    const topicFacet = html.slice(
      html.indexOf('data-filter-bar-facet="topic"'),
      html.indexOf("</select>", html.indexOf('data-filter-bar-facet="topic"')),
    );
    expect(topicFacet).toContain("Зимовий догляд");
    expect(topicFacet).not.toContain('value="plants"');
    expect(topicFacet).not.toContain('value="animals"');
    expect(
      buildPublicHomeFeedContextModules(
        "uk",
        copy,
        withKindTopics,
      )[0]?.items.map((item) => item.label),
    ).toEqual(["Зимовий догляд"]);

    const inUrl = render({
      topics: withKindTopics,
      request: { cursor: null, kind: "all", topic: "plants" },
    });
    expect(inUrl).toContain('value="plants"');
  });

  it("offers no topic nobody has written about", () => {
    const html = render();

    // Criterion 5: a row of counts of which several are zero is not
    // information. A topic with no entries can only ever return nothing.
    expect(html).toContain("Зимовий догляд");
    expect(html).not.toContain("Тема без записів");
    expect(html).not.toContain('href="/?topic=quiet-topic"');
  });

  it("offers Following to every reader, so the page never asks who is reading", () => {
    // `/feed` shows a guest the public feed and says what signing in adds, so
    // the link is the same for everyone and the page stays a static document.
    const html = render();
    expect(html).toMatch(/<a[^>]*href="\/feed"[^>]*>Підписки<\/a>/u);
    expect(html).not.toContain("data-signed-in-only");
  });

  it("ends with «Показати ще», a real link to the next portion, and with nothing after the last (OVE-518)", () => {
    const more = render({
      request: { cursor: null, kind: "animal", topic: "winter-care" },
    });
    const end = render({ feed: { ...page, nextCursor: null } });

    expect(more).toMatch(
      /<a href="\/\?cursor=eyJ2ZXJzaW9uIjoxfQ&amp;kind=animal&amp;topic=winter-care"[^>]*data-show-more-link="true"[^>]*>Показати ще<\/a>/u,
    );
    // No "previous" and no page count: a Threads list has neither.
    expect(more).not.toContain('data-slot="pagination"');
    expect(end).not.toContain("data-show-more-link");
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
    // Shaped like a card's own order — byline, context, words — with no
    // photograph box a text note would not have.
    expect(html).not.toContain("aspect-card");
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

  /**
   * OG-UX-029 (`OVE-487`): a card's photograph sits beside its own linked
   * title. It carries the gardener's description when there is one, and is
   * decorative otherwise — never the title a screen reader just read.
   */
  it("describes a card's photograph in the gardener's words, or not at all", () => {
    const [first] = page.entries;
    const described = renderToStaticMarkup(
      <PublicHomeFeed
        locale="uk"
        copy={copy}
        feed={{
          ...page,
          entries: [
            {
              ...first!,
              media: [
                {
                  ...first!.media[0]!,
                  caption: "Жовті плями на нижньому листі",
                },
              ],
            },
          ],
        }}
        request={{ cursor: null, kind: "all", topic: null }}
        topics={topics}
        state="ready"
      />,
    );
    expect(described).toContain('alt="Жовті плями на нижньому листі"');
    expect(described).not.toContain(`alt="${first!.title}"`);

    const bare = render();
    expect(bare).toMatch(/<img[^>]*alt=""/u);
    expect(bare).not.toContain(`alt="${first!.title}"`);
  });
});
