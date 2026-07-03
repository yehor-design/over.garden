import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BlogPostPage, { generateMetadata } from "./page";

describe("/blog/[slug]", () => {
  it("renders the authored article and keeps product writes gated", async () => {
    const html = renderToStaticMarkup(
      await BlogPostPage({
        params: Promise.resolve({
          slug: "ai-garden-advice-vs-real-garden-proof",
        }),
      }),
    );

    expect(html).toContain("AI garden advice is not the same");
    expect(html).toContain("Advice disappears. Records compound.");
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
          slug: "ai-garden-advice-vs-real-garden-proof",
        }),
      }),
    ).resolves.toMatchObject({
      title:
        "AI garden advice is not the same as dated garden proof | OverGarden",
      alternates: {
        canonical: "/blog/ai-garden-advice-vs-real-garden-proof",
      },
      robots: { index: true, follow: true },
    });
  });
});
