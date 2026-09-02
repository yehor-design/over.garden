import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/root-document", () => ({
  RootDocument: ({
    lang,
    localization,
    children,
  }: {
    lang: string;
    localization: { locale: string; market: string } | null;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="root-document"
      data-lang={lang}
      data-localization={
        localization ? JSON.stringify(localization) : "request"
      }
    >
      {children}
    </div>
  ),
}));

import LocaleRootLayout, {
  generateMetadata,
  generateStaticParams,
} from "./layout";

describe("locale root layout", () => {
  it("prerenders one shell per public locale", () => {
    expect(generateStaticParams()).toEqual([
      { locale: "uk" },
      { locale: "bg" },
      { locale: "ru" },
    ]);
  });

  it("localizes fallback metadata from the route, never from the request", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: "bg" }) }),
    ).resolves.toMatchObject({
      title: "OverGarden",
      other: { "overgarden-interface-context": "bulgaria:bg" },
    });
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: "uk" }) }),
    ).resolves.toMatchObject({
      other: { "overgarden-interface-context": "ukraine:uk" },
    });
  });

  it("sets the document language and market from the route", async () => {
    const html = renderToStaticMarkup(
      await LocaleRootLayout({
        children: <main>OverGarden</main>,
        params: Promise.resolve({ locale: "ru" }),
      }),
    );

    expect(html).toContain('data-lang="ru"');
    expect(html).toContain(
      'data-localization="{&quot;locale&quot;:&quot;ru&quot;,&quot;market&quot;:&quot;bulgaria&quot;}"',
    );
    expect(html).toContain("<main>OverGarden</main>");
  });
});
