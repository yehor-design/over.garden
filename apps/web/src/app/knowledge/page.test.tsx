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
    expect(html).toContain("Как да започнете жив запис на растение");
    expect(html).not.toContain("/garden");
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: "bg" }) }),
    ).resolves.toMatchObject({
      title: "Знания | OverGarden",
      robots: { index: true, follow: true },
      alternates: { canonical: "/bg/knowledge" },
    });
  });

  it("renders a recoverable error when repository evidence is unavailable", async () => {
    mocks.listPublicKnowledgeEvidence.mockRejectedValue(
      new Error("service unavailable"),
    );
    mocks.listPublicKnowledgeTopics.mockRejectedValue(
      new Error("service unavailable"),
    );
    const { renderPublicKnowledgePage } =
      await import("../[locale]/knowledge/page");
    const html = renderToStaticMarkup(
      await renderPublicKnowledgePage("uk", {}),
    );
    expect(html).toContain("Знання тимчасово недоступні");
  });
});
