import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublicKnowledgeEvidence: vi.fn(),
}));

vi.mock("@/server/public-knowledge-evidence-repository", () => ({
  listPublicKnowledgeEvidence: mocks.listPublicKnowledgeEvidence,
}));

vi.mock("@/lib/storage", () => ({
  getPublicDerivativeUrl: (key: string) =>
    `/fixture-media/${encodeURIComponent(key)}`,
}));

import AnswerRoute, {
  generateMetadata,
} from "../../[locale]/answers/[slug]/page";

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

    expect(html).toContain("Краткий ответ");
    expect(html).toContain("Листья томатов часто желтеют");
    expect(html).toContain("Что записать как доказательство");
    expect(html).toContain("Авторский материал");
    expect(html).toContain("Редакция OverGarden");
    expect(html).toContain("проверяемым опытом");
    expect(html).toContain("Опыт из публичных журналов");
    expect(html).toContain('data-site-shell-context="route-owned"');
    expect(html).toContain("Частые вопросы");
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"WebPage"');
    expect(html).toContain('"inLanguage":"ru"');
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
        canonical: "/ru/answers/why-are-tomato-leaves-yellow",
        languages: {
          uk: "/answers/why-are-tomato-leaves-yellow",
          bg: "/bg/answers/why-are-tomato-leaves-yellow",
          ru: "/ru/answers/why-are-tomato-leaves-yellow",
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
