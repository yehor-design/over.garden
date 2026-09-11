import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BlogPostRoute, {
  generateMetadata,
} from "@/app/[locale]/blog/[slug]/page";

describe("/blog/[slug]", () => {
  it("renders the localized authored article and keeps product writes gated", async () => {
    const html = renderToStaticMarkup(
      await BlogPostRoute({
        params: Promise.resolve({
          locale: "uk",
          slug: "ai-garden-advice-vs-real-garden-proof",
        }),
      }),
    );

    expect(html).toContain("Порада AI");
    expect(html).toContain("Порада зникає. Записи накопичуються.");
    expect(html).not.toContain("/ru/blog/ai-garden-advice-vs-real-garden-proof");
    expect(html).not.toContain("/bg/blog/ai-garden-advice-vs-real-garden-proof");
    expect(html).toContain("/garden");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/journal/");
  });

  it("uses indexable metadata for known authored articles", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({
          locale: "uk",
          slug: "ai-garden-advice-vs-real-garden-proof",
        }),
      }),
    ).resolves.toMatchObject({
      title:
        "Порада AI - це не те саме, що датований садовий доказ | OverGarden",
      alternates: {
        canonical: "https://over.garden/blog/ai-garden-advice-vs-real-garden-proof",
        languages: {
          uk: "https://over.garden/blog/ai-garden-advice-vs-real-garden-proof",
          bg: "https://over.garden/bg/blog/ai-garden-advice-vs-real-garden-proof",
          ru: "https://over.garden/ru/blog/ai-garden-advice-vs-real-garden-proof",
        },
      },
      robots: { index: true, follow: true },
    });
  });
});
