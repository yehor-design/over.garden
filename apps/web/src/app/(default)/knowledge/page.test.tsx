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

function topics() {
  return [
    {
      slug: "care-checks",
      label: "Регулярни наблюдения",
      entryCount: 5,
      aggregateBodyLength: 900,
      latestPublishedAt: "2026-07-10T10:00:00.000Z",
      objectKinds: ["plant", "animal"],
      indexState: { isIndexable: true },
    },
    {
      slug: "observation-and-care",
      label: "Спостереження і догляд",
      entryCount: 0,
      aggregateBodyLength: 0,
      latestPublishedAt: null,
      objectKinds: [],
      indexState: { isIndexable: false },
    },
  ];
}

describe("/knowledge", () => {
  it("renders a localized hub from authored content and repository topics", async () => {
    mocks.listPublicKnowledgeTopics.mockResolvedValue(topics());

    const { renderPublicKnowledgePage, generateMetadata } =
      await import("@/app/[locale]/knowledge/page");
    const html = renderToStaticMarkup(await renderPublicKnowledgePage("bg"));

    expect(html).toContain("Знания");
    expect(html).toContain("Регулярни наблюдения");
    expect(html).toContain("5 записа на градинари");
    // A topic nobody has written under is not listed as something to read.
    expect(html).not.toContain("Наблюдения и грижи");
    expect(html).toContain("Защо листата на доматите пожълтяват?");
    expect(html).toContain("Градинарство · Отговор");
    expect(html).toContain("4 източника");
    expect(html).toContain("Помощ за OverGarden · Ръководство");
    expect(html).not.toMatch(/индексиране/u);
    // The hub reads no evidence for its rows: what an answer rests on is in
    // the code, and the entries beside it are the answer page's to show.
    expect(mocks.listPublicKnowledgeEvidence).not.toHaveBeenCalled();
    expect(html).not.toContain("/garden");
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: "bg" }) }),
    ).resolves.toMatchObject({
      title: "Знания | OverGarden",
      robots: { index: true, follow: true },
      alternates: { canonical: "https://over.garden/bg/knowledge" },
    });
  });

  it("finds an answer by the words inside it, not its title alone", async () => {
    mocks.listPublicKnowledgeTopics.mockResolvedValue(topics());
    const { renderPublicKnowledgePage } =
      await import("@/app/[locale]/knowledge/page");

    // "азот" is in the answer's causes, not in its title or its lead.
    const html = renderToStaticMarkup(
      await renderPublicKnowledgePage("uk", { q: "азот" }),
    );
    expect(html).toContain("/answers/why-are-tomato-leaves-yellow");
    expect(html).not.toContain("/guides/start-a-living-plant-record");
    expect(html).not.toContain("/topics/care-checks");
  });

  it("keeps the answers and guides when the topics cannot be read", async () => {
    mocks.listPublicKnowledgeTopics.mockRejectedValue(
      new Error("service unavailable"),
    );
    const { renderPublicKnowledgePage } =
      await import("@/app/[locale]/knowledge/page");
    const html = renderToStaticMarkup(await renderPublicKnowledgePage("uk"));
    expect(html).toContain("/answers/why-are-tomato-leaves-yellow");
    expect(html).toContain("Теми тимчасово недоступні");
    expect(html).not.toContain('data-screen-state="error"');

    // A view of topics alone has nothing left to show, and says so.
    const topicsOnly = renderToStaticMarkup(
      await renderPublicKnowledgePage("uk", { type: "topic" }),
    );
    expect(topicsOnly).toContain("Знання тимчасово недоступні");
    expect(topicsOnly).toContain('data-screen-state="error"');
  });
});
