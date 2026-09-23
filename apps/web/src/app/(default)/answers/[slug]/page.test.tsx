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

import AnswerRoute, {
  generateMetadata,
} from "@/app/[locale]/answers/[slug]/page";

beforeEach(() => {
  // An authored page is a static document: with no database in the environment
  // it defers to the request and renders the skeleton (ADR-0032 D4).
  vi.stubEnv("DATABASE_URL", "postgresql://unit.test/x");
  mocks.listPublicKnowledgeTopics.mockResolvedValue([
    {
      slug: "plants",
      label: "Рослини",
      entryCount: 9,
      aggregateBodyLength: 4000,
      latestPublishedAt: "2026-09-12T10:00:00.000Z",
      objectKinds: ["plant"],
      indexState: { isIndexable: true },
    },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/answers/[slug]", () => {
  it("renders the localized answer-page structure and curated JSON-LD", async () => {
    mocks.listPublicKnowledgeEvidence.mockResolvedValue(emptyEvidence());
    const html = renderToStaticMarkup(
      await AnswerRoute({
        params: Promise.resolve({
          locale: "ru",
          slug: "why-are-tomato-leaves-yellow",
        }),
      }),
    );

    // Gardening, said before the format; the byline points at what the text
    // rests on instead of claiming a product principle as its source
    // (`OVE-498`, OG-UX-033).
    expect(html).toContain("Садоводство · Ответ");
    expect(html).toContain("Редакция OverGarden");
    expect(html).not.toContain("проверяемым опытом");
    expect(html).toContain('href="#answer-about"');
    expect(html).toContain("4 источника и ограничения");
    // The advice, in real headings, every claim numbered to its source.
    expect(html).toContain("Краткий ответ");
    expect(html).toContain("Листья томатов желтеют по нескольким причинам");
    expect(html).toContain("Как различить причины");
    expect(html).toContain("Что записать, чтобы найти причину");
    expect(html).toContain("Частые вопросы");
    expect(html).toMatch(
      /<a href="#knowledge-source-1" aria-label="Источник 1" data-knowledge-citation="1"[^>]*>\[1\]<\/a>/u,
    );
    // The sources, each the target of its citations, with the date read.
    const about = html.slice(html.indexOf('data-knowledge-about="true"'));
    expect(about).toContain("Об этом тексте");
    expect(about).toMatch(
      /<li id="knowledge-source-1"[^>]*><span lang="en"><a[^>]*href="https:\/\/extension\.umd\.edu\/resource\/key-common-problems-tomatoes"/u,
    );
    expect(about).toContain("Royal Horticultural Society");
    expect(about).toContain("просмотрено 23 сент. 2026");
    expect(about).toContain("Это не диагноз");
    expect(about).toContain(
      "Агроном или специалист по защите растений этот текст не проверял.",
    );
    // Help with OverGarden is kept apart from the advice and out of the FAQ.
    const faq = html.slice(
      html.indexOf('id="answer-faq"'),
      html.indexOf("data-knowledge-evidence="),
    );
    expect(faq).not.toMatch(/OverGarden|WebP|фото/u);
    const help = html.slice(html.indexOf('data-knowledge-subject="product"'));
    expect(help).toContain("Справка OverGarden");
    expect(help).toContain("OverGarden не ставит диагнозов");
    expect(help).toContain('href="/ru/guides/start-a-living-plant-record"');
    expect(help).toContain("Руководство: Как начать живую запись растения");
    // Gardeners' entries beside it, said for what they are.
    expect(html).toContain("Что садоводы записали о томатах");
    // One related section, of what exists.
    const related = html.slice(html.indexOf('data-knowledge-related="true"'));
    expect(related).toContain("Читайте также");
    expect(related).toContain('href="/ru/topics/plants"');
    expect(related).toContain("Тема · 9 записей садоводов");
    // The contents list every heading on the page, the trailing ones too.
    expect(html).toContain('href="#answer-evidence"');
    expect(html).toContain('href="#answer-related"');
    expect(html).toContain('data-site-shell-context="route-owned"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"WebPage"');
    expect(html).toContain('"inLanguage":"ru"');
    // `FAQPage` is the gardening questions, as a reader reads them.
    expect(html).toContain(
      '"name":"Когда жёлтые листья — не повод для беспокойства?"',
    );
    expect(html).not.toMatch(/"text":"[^"]*\[\d\]/u);
    expect(html).not.toContain("OverGarden сам диагностирует");
    expect(html).not.toContain("/bg/answers/why-are-tomato-leaves-yellow");
    expect(html).not.toContain("/uk/answers/why-are-tomato-leaves-yellow");
    expect(html).not.toContain("data-interface-language-control");
    expect(html).toContain("/ru/knowledge");
    expect(html).not.toContain("/garden");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toMatch(/latitude|longitude|quarantine|owner/i);
  });

  it("uses indexable metadata for known answer pages", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({
          locale: "ru",
          slug: "why-are-tomato-leaves-yellow",
        }),
      }),
    ).resolves.toMatchObject({
      title: "Почему желтеют листья томатов? | OverGarden",
      alternates: {
        canonical:
          "https://over.garden/ru/answers/why-are-tomato-leaves-yellow",
        languages: {
          uk: "https://over.garden/answers/why-are-tomato-leaves-yellow",
          bg: "https://over.garden/bg/answers/why-are-tomato-leaves-yellow",
          ru: "https://over.garden/ru/answers/why-are-tomato-leaves-yellow",
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
