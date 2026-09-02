import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicTopicAggregationPage: vi.fn(),
  listPublicKnowledgeEvidence: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
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
  it("renders rich curated topic evidence without inventing locale equivalence", async () => {
    const { default: TopicRoute, generateMetadata } =
      await import("@/app/[locale]/topics/[slug]/page");
    const html = renderToStaticMarkup(
      await TopicRoute({
        params: Promise.resolve({ locale: "ru", slug: "care-checks" }),
      }),
    );

    expect(html).toContain("Проверенная тема");
    expect(html).toContain("Регулярні спостереження");
    expect(html).toContain("5 публичных записей");
    expect(html).not.toContain("/garden");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ru", slug: "care-checks" }),
    });
    expect(metadata).toMatchObject({
      alternates: {
        canonical: "/topics/care-checks",
      },
      openGraph: { locale: "ru", url: "/topics/care-checks" },
      robots: { index: true, follow: true },
    });
    expect(metadata.alternates?.languages).toBeUndefined();
  });

  it("allows only the canonical Ukrainian topic route to inherit the quality gate", async () => {
    const { generateMetadata } =
      await import("@/app/[locale]/topics/[slug]/page");
    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "uk", slug: "care-checks" }),
      }),
    ).resolves.toMatchObject({
      alternates: { canonical: "/topics/care-checks" },
      robots: { index: true, follow: true },
    });
  });

  it("redirects an unprefixed Bulgaria-market topic before rendering and preserves only approved state", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    const { default: RootTopicRoute, generateMetadata } =
      await import("./page");

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
    ).rejects.toThrow("redirect:/bg/topics/care-checks?authIntent=follow");
    expect(mocks.getPublicTopicAggregationPage).not.toHaveBeenCalled();

    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "care-checks" }),
      }),
    ).resolves.toMatchObject({
      alternates: { canonical: "/topics/care-checks" },
      openGraph: { locale: "bg", url: "/topics/care-checks" },
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
