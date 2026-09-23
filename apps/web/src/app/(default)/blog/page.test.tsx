import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BlogIndexRoute, { generateMetadata } from "@/app/[locale]/blog/page";

describe("/blog", () => {
  it("renders localized blog content with indexable metadata", async () => {
    const html = renderToStaticMarkup(
      await BlogIndexRoute({ params: Promise.resolve({ locale: "uk" }) }),
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "uk" }),
    });

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.alternates).toMatchObject({ canonical: "https://over.garden/blog" });
    // What a gardener finds here, not the team's plan for search traffic
    // (`OVE-499`, OG-UX-034).
    expect(html).toMatch(/<h1[^>]*>Нотатки OverGarden<\/h1>/u);
    expect(html).toContain("навіщо записувати сад");
    expect(html).not.toMatch(/Корисні публічні сторінки|тонкими|пошуковим системам/u);
    expect(html).toContain("Редакція OverGarden");
    expect(html).toContain("Перейти в Мій сад");
    expect(html).toContain("/blog/ai-garden-advice-vs-real-garden-proof");
    expect(html).not.toContain("Български");
    expect(html).not.toContain("Русский");
    expect(html).toContain("/garden");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/journal/");
  });
});
