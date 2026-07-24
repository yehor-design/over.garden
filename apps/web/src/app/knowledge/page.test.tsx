import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublicKnowledgeEvidence: vi.fn(),
  listPublicKnowledgeTopics: vi.fn(),
}));

vi.mock("@/server/public-knowledge-evidence-repository", () => ({
  listPublicKnowledgeEvidence: mocks.listPublicKnowledgeEvidence,
}));

vi.mock("@/server/public-topic-repository", () => ({
  listPublicKnowledgeTopics: mocks.listPublicKnowledgeTopics,
}));

vi.mock("@/lib/storage", () => ({
  getPublicDerivativeUrl: (key: string) =>
    `/fixture-media/${encodeURIComponent(key)}`,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/knowledge", () => {
  it("renders a localized dynamic hub from authored content and repository topics", async () => {
    mocks.listPublicKnowledgeEvidence.mockResolvedValue({
      items: [],
      totalCount: 3,
      hasMore: false,
      allEvidencePath: "/bg/journals",
    });
    mocks.listPublicKnowledgeTopics.mockResolvedValue([
      {
        slug: "care-checks",
        label: "Регулярни наблюдения",
        entryCount: 5,
        aggregateBodyLength: 900,
        latestPublishedAt: "2026-07-10T10:00:00.000Z",
        objectKinds: ["plant", "animal"],
        indexState: { isIndexable: true },
      },
    ]);

    const { renderPublicKnowledgePage, generateMetadata } =
      await import("../[locale]/knowledge/page");
    const html = renderToStaticMarkup(
      await renderPublicKnowledgePage("bg", { type: "topic" }),
    );

    expect(html).toContain("Знания");
    expect(html).toContain("Регулярни наблюдения");
    expect(html).not.toContain("Как да започнете жив запис на растение");
    expect(html).not.toContain("/garden");
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: "bg" }) }),
    ).resolves.toMatchObject({
      title: "Знания | OverGarden",
      alternates: {
        canonical: "/bg/knowledge",
        languages: {
          uk: "/knowledge",
          bg: "/bg/knowledge",
          ru: "/ru/knowledge",
        },
      },
      robots: { index: true, follow: true },
    });
  });

  it("renders a recoverable error when repository evidence is unavailable", async () => {
    mocks.listPublicKnowledgeEvidence.mockRejectedValue(new Error("offline"));
    mocks.listPublicKnowledgeTopics.mockRejectedValue(new Error("offline"));
    const { renderPublicKnowledgePage } =
      await import("../[locale]/knowledge/page");
    const html = renderToStaticMarkup(
      await renderPublicKnowledgePage("uk", {}),
    );
    expect(html).toContain("Знання тимчасово недоступні");
  });

  it("renders the full synthetic corpus only behind the isolated fixture gate", async () => {
    enableVisualFixtureEnv();
    mocks.listPublicKnowledgeEvidence.mockResolvedValue({
      items: [],
      totalCount: 11,
      hasMore: true,
      allEvidencePath: "/journals?__visualJournals=corpus",
    });
    mocks.listPublicKnowledgeTopics.mockResolvedValue([
      {
        slug: "care-checks",
        label: "Регулярні спостереження",
        entryCount: 11,
        aggregateBodyLength: 2200,
        latestPublishedAt: "2026-07-10T10:00:00.000Z",
        objectKinds: ["plant", "animal"],
        indexState: { isIndexable: true },
      },
    ]);

    const { renderPublicKnowledgePage, generateMetadata } =
      await import("../[locale]/knowledge/page");
    const html = renderToStaticMarkup(
      await renderPublicKnowledgePage("uk", {
        __visualKnowledge: "corpus",
      }),
    );

    expect(html).toContain(
      "Як порівняти два спостереження без зайвих припущень",
    );
    expect(html).toContain("Що робити, коли пов&#x27;язаних журналів ще немає");
    expect(html).toContain(
      "Як читати довгу історію відновлення живого об&#x27;єкта?",
    );
    expect(html).toContain("__visualKnowledge=corpus");
    expect(mocks.listPublicKnowledgeEvidence).toHaveBeenCalledWith(
      expect.any(Object),
      "uk",
      expect.objectContaining({
        restrictToEntryIds: expect.any(Array),
        visualCorpus: true,
      }),
    );
    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ __visualKnowledge: "corpus" }),
      }),
    ).resolves.toMatchObject({ robots: { index: false, follow: false } });
  });
});

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
  vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
}
