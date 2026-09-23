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

    expect(html).toContain(
      "Порада від AI — не те саме, що датований запис про вашу рослину",
    );
    expect(html).toContain("Порада зникає. Записи накопичуються.");
    // What it is and who signs it, before the text (`OVE-499`).
    expect(html).toContain(">Нотатка</p>");
    expect(html).toContain("Редакція OverGarden");
    expect(html).toMatch(/<time dateTime="2026-07-03">/u);
    // No team plan for search traffic in the reader's copy.
    expect(html).not.toMatch(/трафік|discovery|тонк/u);
    expect(html).toContain("Опубліковане бачать усі");
    // One list of what to read next, named in the contents.
    expect(html).toContain('id="related-paths"');
    expect(html).toContain('href="#related-paths"');
    expect(html).toContain("Читайте також");
    expect(html).toContain('href="/guides/start-a-living-plant-record"');
    expect(html).not.toContain(
      "/ru/blog/ai-garden-advice-vs-real-garden-proof",
    );
    expect(html).not.toContain(
      "/bg/blog/ai-garden-advice-vs-real-garden-proof",
    );
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
        "Порада від AI — не те саме, що датований запис про вашу рослину | OverGarden",
      alternates: {
        canonical:
          "https://over.garden/blog/ai-garden-advice-vs-real-garden-proof",
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
