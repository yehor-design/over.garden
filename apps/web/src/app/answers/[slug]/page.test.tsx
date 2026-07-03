import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AnswerPage, { generateMetadata } from "./page";

describe("/answers/[slug]", () => {
  it("renders the answer-page structure and curated JSON-LD", async () => {
    const html = renderToStaticMarkup(
      await AnswerPage({
        params: Promise.resolve({ slug: "why-are-tomato-leaves-yellow" }),
      }),
    );

    expect(html).toContain("Concise answer");
    expect(html).toContain("Tomato leaves often turn yellow");
    expect(html).toContain("What to record as proof");
    expect(html).toContain("Related varieties");
    expect(html).toContain("Related topics");
    expect(html).toContain("FAQ");
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"WebPage"');
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
        params: Promise.resolve({ slug: "why-are-tomato-leaves-yellow" }),
      }),
    ).resolves.toMatchObject({
      title: "Why are tomato leaves turning yellow? | OverGarden",
      alternates: {
        canonical: "/answers/why-are-tomato-leaves-yellow",
      },
      robots: { index: true, follow: true },
    });
  });
});
