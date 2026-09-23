import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicTopicAggregationPage: vi.fn(),
  listPublicKnowledgeEvidence: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: vi.fn(),
  redirect: mocks.redirect,
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/public-topic-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/public-topic-repository")
  >()),
  getPublicTopicAggregationPage: mocks.getPublicTopicAggregationPage,
}));

vi.mock("@/server/public-knowledge-evidence-repository", () => ({
  listPublicKnowledgeEvidence: mocks.listPublicKnowledgeEvidence,
}));

vi.mock("@/lib/storage", () => ({
  getPublicDerivativeUrl: (key: string) =>
    `/fixture-media/${encodeURIComponent(key)}`,
}));

beforeEach(() => {
  // A topic is a static document: with no database in the environment it
  // defers to the request and renders the skeleton (ADR-0032 D4).
  vi.stubEnv("DATABASE_URL", "postgresql://unit.test/x");
  mocks.getPublicTopicAggregationPage.mockResolvedValue(topicPage());
  mocks.listPublicKnowledgeEvidence.mockResolvedValue(evidence());
  mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
  mocks.redirect.mockImplementation((target: string) => {
    throw new Error(`redirect:${target}`);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/topics/[slug]", () => {
  it("renders rich curated topic evidence and declares its three locales", async () => {
    const { default: TopicRoute, generateMetadata } =
      await import("@/app/[locale]/topics/[slug]/page");
    const html = renderToStaticMarkup(
      await TopicRoute({
        params: Promise.resolve({ locale: "ru", slug: "care-checks" }),
      }),
    );

    expect(html).toContain("Тема");
    expect(html).toContain("Регулярні спостереження");
    // Real counts and recency, never crawler admission (OG-UX-032).
    expect(html).toContain("5 записей садоводов");
    expect(html).toContain("последняя запись");
    expect(html).not.toMatch(/индекс|Проверенная/u);
    // The topic searches its own entries, through the journals' search.
    const search = /<form[^>]*data-topic-search="true"[^>]*>/u.exec(html)?.[0];
    expect(search).toContain('role="search"');
    expect(search).toContain('action="/ru/journals"');
    expect(search).toContain('method="get"');
    expect(html).toContain(
      '<input type="hidden" name="topic" value="care-checks"/>',
    );
    // Its entries once, not again in a rail (criterion 4).
    expect(html).not.toContain('data-site-shell-context="route-owned"');
    expect(html).toContain('id="topic-evidence"');
    expect(html).toMatch(
      /data-knowledge-evidence-all="true"[^>]*>Все записи \(5\)/u,
    );
    // No authored piece draws on this topic, so there is no related section.
    expect(html).not.toContain('data-knowledge-related="true"');
    expect(html).not.toContain("/garden");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ru", slug: "care-checks" }),
    });
    // A topic's own content is its chrome, and that is translated, so the page
    // genuinely exists in three languages and each is its own canonical
    // (ADR-0029 D10). The entries it lists are not translated and are not meant
    // to be — `hreflang` is exactly for same content in different languages.
    expect(metadata).toMatchObject({
      alternates: {
        canonical: "https://over.garden/ru/topics/care-checks",
        languages: {
          uk: "https://over.garden/topics/care-checks",
          bg: "https://over.garden/bg/topics/care-checks",
          ru: "https://over.garden/ru/topics/care-checks",
          "x-default": "https://over.garden/topics/care-checks",
        },
      },
      openGraph: {
        locale: "ru_BG",
        url: "https://over.garden/ru/topics/care-checks",
      },
      robots: { index: true, follow: true },
    });
  });

  it("lists the answers and guides that draw on the topic, once", async () => {
    mocks.getPublicTopicAggregationPage.mockResolvedValue({
      ...topicPage(),
      topic: { slug: "plants", label: "Рослини" },
    });
    const { default: TopicRoute } =
      await import("@/app/[locale]/topics/[slug]/page");
    const html = renderToStaticMarkup(
      await TopicRoute({
        params: Promise.resolve({ locale: "uk", slug: "plants" }),
      }),
    );

    const related = html.slice(html.indexOf('data-knowledge-related="true"'));
    expect(related).toContain("Відповіді й посібники на цю тему");
    expect(related).toContain('href="/answers/why-are-tomato-leaves-yellow"');
    expect(related).toContain("Садівництво · Відповідь");
    expect(related).toContain('href="/guides/start-a-living-plant-record"');
    expect(related).toContain("Довідка OverGarden · Посібник");
    expect(
      html.match(/href="\/answers\/why-are-tomato-leaves-yellow"/gu)?.length,
    ).toBe(1);
  });

  it("allows only the canonical Ukrainian topic route to inherit the quality gate", async () => {
    const { generateMetadata } =
      await import("@/app/[locale]/topics/[slug]/page");
    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "uk", slug: "care-checks" }),
      }),
    ).resolves.toMatchObject({
      alternates: { canonical: "https://over.garden/topics/care-checks" },
      robots: { index: true, follow: true },
    });
  });

  it("serves the unprefixed topic to a Bulgaria-market reader instead of redirecting", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    const { default: RootTopicRoute, generateMetadata } =
      await import("./page");

    // There used to be a second geo-307 here, inside the page rather than the
    // proxy — the audit found only the proxy's. `/topics/{slug}` is a canonical
    // address and answers 200 to everyone (ADR-0029 D10).
    await expect(
      RootTopicRoute({
        params: Promise.resolve({ slug: "care-checks" }),
        searchParams: Promise.resolve({
          authIntent: "follow",
          authControl: "follow-topic-main",
          intent: "opaque-token",
          email: "private@example.com",
        }),
      }),
    ).resolves.toBeDefined();
    expect(mocks.getPublicTopicAggregationPage).toHaveBeenCalled();

    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "care-checks" }),
      }),
    ).resolves.toMatchObject({
      alternates: { canonical: "https://over.garden/topics/care-checks" },
      openGraph: {
        locale: "uk_UA",
        url: "https://over.garden/topics/care-checks",
      },
      robots: { index: true, follow: true },
    });
  });
});

function topicPage() {
  return {
    topic: { slug: "care-checks", label: "Регулярні спостереження" },
    entryCount: 5,
    aggregateBodyLength: 900,
    latestPublishedAt: "2026-07-10T10:00:00.000Z",
    qualityClass: "verified",
    indexState: { isIndexable: true },
    entries: [
      {
        id: "topic-entry",
        objectId: "topic-object",
        title: "Регулярне спостереження",
        bodyPreview: Array.from(
          { length: 120 },
          (_, index) => `спостереження${index}`,
        ).join(" "),
        entryDate: "2026-07-10",
        publishedAt: "2026-07-10T10:00:00.000Z",
        publicPath: "/journal/topic-entry",
      },
    ],
  };
}

function evidence() {
  return {
    items: [],
    totalCount: 5,
    hasMore: true,
    allEvidencePath: "/ru/journals?topic=care-checks",
  };
}
