import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import GuideRoute, {
  generateMetadata,
} from "@/app/[locale]/guides/[slug]/page";

beforeEach(() => {
  // An authored page is a static document: with no database in the environment
  // it defers to the request and renders the skeleton (ADR-0032 D4).
  vi.stubEnv("DATABASE_URL", "postgresql://unit.test/x");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/guides/[slug]", () => {
  it("renders a localized authored guide as a read-only public page", async () => {
    mocks.listPublicKnowledgeEvidence.mockResolvedValue(emptyEvidence());
    mocks.listPublicKnowledgeTopics.mockResolvedValue([]);
    const html = renderToStaticMarkup(
      await GuideRoute({
        params: Promise.resolve({
          locale: "bg",
          slug: "start-a-living-plant-record",
        }),
      }),
    );

    expect(html).toContain("Как да започнете жив запис на растение");
    expect(html).toContain("Изберете едно растение");
    // Help with OverGarden, said as such, with no pretence of a source
    // (`OVE-498`, OG-UX-033).
    expect(html).toContain("Помощ за OverGarden · Ръководство");
    expect(html).toContain("Редакция OverGarden");
    expect(html).not.toContain("принципи за поверителност");
    expect(html).toContain("Основа и ограничения");
    const about = html.slice(html.indexOf('data-knowledge-about="true"'));
    expect(about).toContain(
      "Няма външни източници: текстът описва самия OverGarden.",
    );
    expect(about).toContain(
      "Това е помощ за OverGarden, а не градинарски съвет.",
    );
    // A specialist review is a question for advice, not for product help.
    expect(about).not.toContain("Проверка от специалист");
    expect(html).toContain("Записи на други градинари за растения");
    expect(html).toContain("Тук все още няма записи на градинари");
    // Its one related section: the gardening answer.
    const related = html.slice(html.indexOf('data-knowledge-related="true"'));
    expect(related).toContain(
      'href="/bg/answers/why-are-tomato-leaves-yellow"',
    );
    expect(related).toContain("Градинарство · Отговор");
    expect(html).toContain('data-site-shell-context="route-owned"');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"about":"Помощ за OverGarden"');
    expect(html).toContain("/bg/knowledge");
    expect(html).not.toContain("/garden");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
  });

  it("uses indexable metadata for known guides", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({
          locale: "bg",
          slug: "start-a-living-plant-record",
        }),
      }),
    ).resolves.toMatchObject({
      title: "Как да започнете жив запис на растение | OverGarden",
      alternates: {
        canonical: "https://over.garden/bg/guides/start-a-living-plant-record",
        languages: {
          uk: "https://over.garden/guides/start-a-living-plant-record",
          bg: "https://over.garden/bg/guides/start-a-living-plant-record",
          ru: "https://over.garden/ru/guides/start-a-living-plant-record",
        },
      },
      robots: { index: true, follow: true },
    });
  });
});

function emptyEvidence() {
  return {
    items: [],
    totalCount: 0,
    hasMore: false,
    allEvidencePath: "/journals",
  };
}
