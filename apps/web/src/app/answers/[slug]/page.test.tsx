import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AnswerRoute, {
  generateMetadata,
} from "../../[locale]/answers/[slug]/page";

describe("/answers/[slug]", () => {
  it("renders the localized answer-page structure and curated JSON-LD", async () => {
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
    expect(html).toContain("Связанные сорта");
    expect(html).toContain("Связанные темы");
    expect(html).toContain("FAQ");
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"WebPage"');
    expect(html).toContain('"inLanguage":"ru"');
    expect(html).toContain("/uk/answers/why-are-tomato-leaves-yellow");
    expect(html).toContain("/garden");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/journal/");
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
          uk: "/uk/answers/why-are-tomato-leaves-yellow",
          bg: "/bg/answers/why-are-tomato-leaves-yellow",
          ru: "/ru/answers/why-are-tomato-leaves-yellow",
        },
      },
      robots: { index: true, follow: true },
    });
  });
});
