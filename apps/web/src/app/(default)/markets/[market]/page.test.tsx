import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import MarketLandingRoute, {
  generateMetadata,
  generateStaticParams,
} from "@/app/[locale]/markets/[market]/page";

describe("/markets/[market]", () => {
  it("prerenders every language a landing is written in, the default one included", () => {
    // The proxy rewrites `/markets/ukraine` to `/uk/markets/ukraine` (ADR-0032
    // D1). A pair missing here renders on demand from the fallback shell,
    // which answered 500 once the page lost its boundary (OVE-467).
    const params = generateStaticParams();
    expect(params).toContainEqual({ locale: "uk", market: "ukraine" });
    expect(params).toContainEqual({ locale: "bg", market: "bulgaria" });
  });

  it("renders the Ukraine market landing as a localized indexable read-only page", async () => {
    const html = renderToStaticMarkup(
      await MarketLandingRoute({
        params: Promise.resolve({ locale: "uk", market: "ukraine" }),
      }),
    );

    expect(html).toContain("OverGarden для садівників в Україні");
    // What the page is for, in the reader's words (`OVE-499`): who it is
    // for, what can be done here, what is true, and where to start.
    expect(html).toContain("Для кого це");
    expect(html).toContain("Що тут можна робити");
    expect(html).toContain("Що варто знати");
    expect(html).toContain("З чого почати");
    expect(html).toContain("Державного реєстру сортів рослин України");
    expect(html).toContain("Точне місце не збирається й не показується");
    expect(html).not.toMatch(/discovery|hreflang|UGC|Ринкова|Обіцянка/u);
    // Every start is a page that exists, in the page's language — never an
    // English card on a Ukrainian page.
    expect(html).toContain('href="/journals"');
    expect(html).toContain('href="/catalog"');
    expect(html).toContain('href="/knowledge"');
    expect(html).toContain("Журнали садівників");
    expect(html).not.toMatch(
      /Create a public entry|Read the first-record guide/u,
    );
    // Nothing for sale, nobody located.
    expect(html).not.toMatch(/ціна|кошик|оплат|доставк|координат/iu);
    expect(html).toContain("Створити публічний запис");
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
    expect(html).toContain("Какво можете да правите тук");
    expect(html).toContain("Общия каталог на ЕС");
    // Links into listings carry the page's language.
    expect(html).toContain('href="/bg/journals"');
    expect(html).toContain('href="/bg/catalog"');
    expect(html).toContain("Дневници на градинари");
    expect(html).not.toMatch(/hreflang|UGC|откриване/u);
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
        canonical: "https://over.garden/markets/ukraine",
      },
      robots: { index: true, follow: true },
    });

    const bulgariaMetadata = await generateMetadata({
      params: Promise.resolve({ locale: "bg", market: "bulgaria" }),
    });
    expect(bulgariaMetadata).toMatchObject({
      title: "OverGarden за градинари в България | OverGarden",
      robots: { index: true, follow: true },
      alternates: { canonical: "https://over.garden/bg/markets/bulgaria" },
    });
  });
});
