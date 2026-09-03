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

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // The production component still uses next/image; this keeps SSR assertions focused.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

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
  filterLabel: "Фільтрувати стрічку",
  recentFilter: "Останні",
  followedFilter: "Підписки",
  plantFilter: "Рослини",
  animalFilter: "Тварини",
  topicFilterLabel: "Перевірені теми",
  readEntry: "Читати запис",
  publishedBy: "Автор",
  safeRegion: "Регіон",
  loadMore: "Наступна сторінка",
  endOfFeed: "Усі доступні записи переглянуто",
  emptyTitle: "Тут поки немає публічних записів",
  emptyBody:
    "Змініть фільтр або перейдіть до перевірених матеріалів OverGarden.",
  emptyPrimary: "Змінити фільтр",
  emptySecondary: "Відкрити знання",
  loadingLabel: "Завантаження публічних журналів",
  errorTitle: "Стрічку не вдалося завантажити",
  errorBody: "Спробуйте ще раз або продовжуйте читати перевірені матеріали.",
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
      entryDate: "2026-07-10",
      publishedAt: "2026-07-10T12:00:00.000Z",
      publicPath: "/journal/tomato-week",
      object: {
        id: "object-1",
        displayName: "Томат Черрі",
        kind: "plant",
        publicPath: "/lineage/objects/object-1",
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
          publicUrl: "https://media.example/one.png",
          focalX: 0.5,
          focalY: 0.5,
          intrinsicWidth: 800,
          intrinsicHeight: 600,
          placeholderDataUri: null,
          variantLongEdges: [],
        },
        {
          id: "media-2",
          publicUrl: "https://media.example/two.png",
          focalX: 0.5,
          focalY: 0.5,
          intrinsicWidth: 800,
          intrinsicHeight: 600,
          placeholderDataUri: null,
          variantLongEdges: [],
        },
        {
          id: "media-3",
          publicUrl: "https://media.example/three.png",
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
      entryDate: "2026-07-09",
      publishedAt: "2026-07-09T12:00:00.000Z",
      publicPath: "/journal/apiary-check",
      object: {
        id: "object-2",
        displayName: "Сім'я Карніка",
        kind: "animal",
        publicPath: "/lineage/objects/object-2",
        safeRegionCode: null,
      },
      author: null,
      media: [],
      topics: [],
    },
  ],
  nextCursor: "eyJ2ZXJzaW9uIjoxfQ",
};

describe("public home feed", () => {
  it("renders real journal evidence and one-click journal, object, and profile paths", () => {
    const html = renderToStaticMarkup(
      <PublicHomeFeed
        locale="uk"
        copy={copy}
        feed={page}
        request={{ cursor: null, kind: "all", topic: null }}
        topics={topics}
        isAuthenticated={false}
        state="ready"
      />,
    );

    expect(html).toContain('data-public-home-feed="true"');
    expect(html).toContain(">Стрічка</h1>");
    expect(html).not.toContain(
      "Читайте реальні датовані спостереження без реєстрації",
    );
    expect(html).not.toMatch(
      /Почати перший запис|Створити акаунт|Зареєструватися/i,
    );
    expect(html).toContain('href="/journal/tomato-week"');
    expect(html).toContain('href="/lineage/objects/object-1"');
    expect(html).toContain('href="/@demo_olena"');
    expect(html).toContain("Підсумок тижня для томата");
    expect(html).toContain("Томат Черрі");
    expect(html).toContain("Олена");
    expect(html).toContain("Регіон UA-30");
    expect(html).not.toContain("BG-23");
    expect(html).toContain('data-feed-media-count="3"');
    expect(html).toContain('data-feed-topic-filters="true"');
    expect(html).toContain("overflow-x-auto");
    expect(html.match(/<img /g)).toHaveLength(3);
    expect(html).toContain("Спокійний огляд сім&#x27;ї");
  });

  it("uses URL-driven object and topic filters and reveals followed only for a session", () => {
    const guestHtml = renderToStaticMarkup(
      <PublicHomeFeed
        locale="bg"
        copy={copy}
        feed={page}
        request={{ cursor: null, kind: "plant", topic: "winter-care" }}
        topics={topics}
        isAuthenticated={false}
        state="ready"
      />,
    );
    const authenticatedHtml = renderToStaticMarkup(
      <PublicHomeFeed
        locale="bg"
        copy={copy}
        feed={page}
        request={{ cursor: null, kind: "all", topic: null }}
        topics={topics}
        isAuthenticated={true}
        state="ready"
      />,
    );

    expect(guestHtml).toContain('href="/bg?kind=animal&amp;topic=winter-care"');
    expect(guestHtml).toContain('href="/bg?kind=plant&amp;topic=quiet-topic"');
    expect(guestHtml).not.toContain('href="/bg/feed"');
    expect(authenticatedHtml).toContain('href="/bg/feed"');
    expect(authenticatedHtml).toContain("Підписки");
  });

  it("preserves active filters in pagination and emits a deterministic end state", () => {
    const moreHtml = renderToStaticMarkup(
      <PublicHomeFeed
        locale="uk"
        copy={copy}
        feed={page}
        request={{ cursor: null, kind: "animal", topic: "winter-care" }}
        topics={topics}
        isAuthenticated={false}
        state="ready"
      />,
    );
    const endHtml = renderToStaticMarkup(
      <PublicHomeFeed
        locale="uk"
        copy={copy}
        feed={{ ...page, nextCursor: null }}
        request={{ cursor: null, kind: "all", topic: null }}
        topics={topics}
        isAuthenticated={false}
        state="ready"
      />,
    );

    expect(moreHtml).toContain(
      'href="/?cursor=eyJ2ZXJzaW9uIjoxfQ&amp;kind=animal&amp;topic=winter-care"',
    );
    expect(endHtml).toContain("Усі доступні записи переглянуто");
  });

  it("keeps empty, loading, and recoverable error states read-open", () => {
    const states = (["empty", "loading", "error"] as const).map((state) =>
      renderToStaticMarkup(
        <PublicHomeFeed
          locale="uk"
          copy={copy}
          feed={{ entries: [], nextCursor: null }}
          request={{ cursor: null, kind: "animal", topic: null }}
          topics={topics}
          isAuthenticated={false}
          state={state}
        />,
      ),
    );

    expect(states[0]).toContain("Тут поки немає публічних записів");
    expect(states[0]).toContain('href="/"');
    expect(states[0]).toContain('href="/guides/start-a-living-plant-record"');
    expect(states[1]).toContain('aria-label="Завантаження публічних журналів"');
    expect(states[2]).toContain("Стрічку не вдалося завантажити");
    expect(states[2]).toContain('href="/?kind=animal"');
    for (const html of states) {
      expect(html).not.toMatch(
        /href="[^"]*(?:sign.?up|register)|>Створити акаунт<|>Зареєструватися</i,
      );
    }
  });

  it("builds route-owned context modules from trusted topics and existing knowledge routes", () => {
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
            {
              href: "/ru?topic=quiet-topic",
              label: "Тема без записів",
              meta: "0",
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
      buildPublicFeedHref("uk", {
        cursor: null,
        kind: "all",
        topic: null,
      }),
    ).toBe("/");
  });
});
