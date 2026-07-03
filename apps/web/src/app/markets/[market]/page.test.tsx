import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import MarketLandingPage, { generateMetadata } from "./page";

describe("/markets/[market]", () => {
  it("renders the Ukraine market landing as an indexable read-only page", async () => {
    const html = renderToStaticMarkup(
      await MarketLandingPage({
        params: Promise.resolve({ market: "ukraine" }),
      }),
    );

    expect(html).toContain("OverGarden for gardeners in Ukraine");
    expect(html).toContain("Who this is for");
    expect(html).toContain("The promise");
    expect(html).toContain("Start a private record");
    expect(html).toContain("/garden");
    expect(html).not.toContain("OVE-117");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/journal/");
  });

  it("renders the Bulgaria market landing as an indexable read-only page", async () => {
    const html = renderToStaticMarkup(
      await MarketLandingPage({
        params: Promise.resolve({ market: "bulgaria" }),
      }),
    );

    expect(html).toContain("OverGarden for gardeners in Bulgaria");
    expect(html).toContain("gardens, yards, greenhouses, terraces");
    expect(html).toContain("/garden");
    expect(html).not.toContain("OVE-117");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/journal/");
  });

  it("uses indexable metadata for known market landings", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({ market: "ukraine" }),
      }),
    ).resolves.toMatchObject({
      title: "OverGarden for gardeners in Ukraine | OverGarden",
      alternates: {
        canonical: "/markets/ukraine",
      },
      robots: { index: true, follow: true },
    });
  });
});
