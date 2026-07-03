import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import GuidePage, { generateMetadata } from "./page";

describe("/guides/[slug]", () => {
  it("renders an authored guide as a read-only public page", async () => {
    const html = renderToStaticMarkup(
      await GuidePage({
        params: Promise.resolve({ slug: "start-a-living-plant-record" }),
      }),
    );

    expect(html).toContain("How to start a living plant record");
    expect(html).toContain("Pick one plant, not the whole garden");
    expect(html).toContain("Return to the same object");
    expect(html).toContain("/garden");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/journal/");
  });

  it("uses indexable metadata for known guides", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "start-a-living-plant-record" }),
      }),
    ).resolves.toMatchObject({
      title: "How to start a living plant record | OverGarden",
      alternates: {
        canonical: "/guides/start-a-living-plant-record",
      },
      robots: { index: true, follow: true },
    });
  });
});
