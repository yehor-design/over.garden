import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BlogIndexPage, { metadata } from "./page";

describe("/blog", () => {
  it("renders indexable authored blog content without private actions", () => {
    const html = renderToStaticMarkup(<BlogIndexPage />);

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.alternates).toMatchObject({ canonical: "/blog" });
    expect(html).toContain("Useful public pages before thin public pages.");
    expect(html).toContain("/blog/ai-garden-advice-vs-real-garden-proof");
    expect(html).toContain("/garden");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/journal/");
  });
});
