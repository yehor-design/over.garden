import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import MarketLandingRoute, {
  generateMetadata,
} from "../../[locale]/markets/[market]/page";

describe("/markets/[market]", () => {
  it("renders the Ukraine market landing as a localized indexable read-only page", async () => {
    const html = renderToStaticMarkup(
      await MarketLandingRoute({
        params: Promise.resolve({ locale: "uk", market: "ukraine" }),
      }),
    );

    expect(html).toContain("OverGarden для садівників в Україні");
    expect(html).toContain("Для кого це");
    expect(html).toContain("Обіцянка");
    expect(html).toContain("Почати приватний запис");
    expect(html).not.toContain("/ru/markets/ukraine");
    expect(html).not.toContain("/bg/markets/ukraine");
    expect(html).not.toContain("data-interface-language-control");
    expect(html).toContain("/garden");
    expect(html).not.toContain("OVE-117");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/journal/");
  });

  it("renders the Bulgaria market landing as a localized indexable read-only page", async () => {
    const html = renderToStaticMarkup(
      await MarketLandingRoute({
        params: Promise.resolve({ locale: "bg", market: "bulgaria" }),
      }),
    );

    expect(html).toContain("OverGarden за градинари в България");
    expect(html).toContain("градини, дворове, оранжерии, тераси");
    expect(html).not.toContain("/uk/markets/bulgaria");
    expect(html).not.toContain("/ru/markets/bulgaria");
    expect(html).not.toContain("data-interface-language-control");
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
        params: Promise.resolve({ locale: "uk", market: "ukraine" }),
      }),
    ).resolves.toMatchObject({
      title: "OverGarden для садівників в Україні | OverGarden",
      alternates: {
        canonical: "/markets/ukraine",
        languages: {
          uk: "/markets/ukraine",
          "x-default": "/markets/ukraine",
        },
      },
      robots: { index: true, follow: true },
    });

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "bg", market: "bulgaria" }),
      }),
    ).resolves.toMatchObject({
      title: "OverGarden за градинари в България | OverGarden",
      alternates: {
        canonical: "/bg/markets/bulgaria",
        languages: {
          bg: "/bg/markets/bulgaria",
          ru: "/ru/markets/bulgaria",
          "x-default": "/bg/markets/bulgaria",
        },
      },
      robots: { index: true, follow: true },
    });
  });
});
