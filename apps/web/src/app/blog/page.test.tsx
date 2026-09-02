import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BlogIndexRoute, { generateMetadata } from "../[locale]/blog/page";

describe("/blog", () => {
  it("renders localized blog content with indexable metadata", async () => {
    const html = renderToStaticMarkup(
      await BlogIndexRoute({ params: Promise.resolve({ locale: "uk" }) }),
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "uk" }),
    });

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.alternates).toMatchObject({ canonical: "/blog" });
    expect(html).toContain("Корисні публічні сторінки");
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
