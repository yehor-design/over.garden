import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicTopicAggregationPage: vi.fn(),
  listPublicKnowledgeEvidence: vi.fn(),
}));

vi.mock("@/server/public-topic-repository", () => ({
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
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/topics/[slug]", () => {
  it("renders curated topic evidence and keeps localized UGC projections noindex", async () => {
    const { default: TopicRoute, generateMetadata } =
      await import("../../[locale]/topics/[slug]/page");
    const html = renderToStaticMarkup(
      await TopicRoute({
        params: Promise.resolve({ locale: "ru", slug: "care-checks" }),
      }),
    );

    expect(html).toContain("Проверенная тема");
    expect(html).toContain("Регулярні спостереження");
    expect(html).toContain("5 публичных записей");
    expect(html).not.toContain("/garden");
    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "ru", slug: "care-checks" }),
      }),
    ).resolves.toMatchObject({
      alternates: { canonical: "/topics/care-checks" },
      robots: { index: false, follow: false },
    });
  });

  it("allows only the canonical Ukrainian topic route to inherit the quality gate", async () => {
    const { generateMetadata } =
      await import("../../[locale]/topics/[slug]/page");
    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "uk", slug: "care-checks" }),
      }),
    ).resolves.toMatchObject({
      alternates: { canonical: "/topics/care-checks" },
      robots: { index: true, follow: true },
    });
  });

  it("restricts a synthetic dense topic to fixture evidence and keeps it noindex", async () => {
    enableVisualFixtureEnv();
    const { default: TopicRoute, generateMetadata } =
      await import("../../[locale]/topics/[slug]/page");
    const params = Promise.resolve({ locale: "uk", slug: "care-checks" });
    const searchParams = Promise.resolve({ __visualKnowledge: "corpus" });
    const html = renderToStaticMarkup(
      await TopicRoute({ params, searchParams }),
    );

    expect(html).toContain("Регулярні спостереження");
    expect(html).toContain("/knowledge?__visualKnowledge=corpus");
    expect(mocks.getPublicTopicAggregationPage).toHaveBeenCalledWith(
      "care-checks",
      expect.objectContaining({ restrictToEntryIds: expect.any(Array) }),
    );
    expect(mocks.listPublicKnowledgeEvidence).toHaveBeenCalledWith(
      { topicSlugs: ["care-checks"], catalogSlugs: [] },
      "uk",
      expect.objectContaining({
        restrictToEntryIds: expect.any(Array),
        visualCorpus: true,
      }),
    );
    await expect(
      generateMetadata({ params, searchParams }),
    ).resolves.toMatchObject({
      robots: { index: false, follow: false },
    });
  });
});

function topicPage() {
  return {
    topic: { slug: "care-checks", label: "Регулярні спостереження" },
    entryCount: 5,
    aggregateBodyLength: 900,
    latestPublishedAt: "2026-07-10T10:00:00.000Z",
    indexState: { isIndexable: true },
    entries: [],
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

function enableVisualFixtureEnv() {
  vi.stubEnv("VISUAL_FIXTURES_ENABLED", "true");
  vi.stubEnv("VISUAL_FIXTURES_TARGET", "local");
  vi.stubEnv("VISUAL_FIXTURES_DATABASE", "overgarden_visual");
  vi.stubEnv(
    "DATABASE_URL",
    "postgres://postgres:postgres@127.0.0.1/overgarden_visual",
  );
  vi.stubEnv("R2_ENDPOINT", "http://127.0.0.1:9000");
  vi.stubEnv("R2_PUBLIC_BASE_URL", "http://127.0.0.1:9000/overgarden");
}
