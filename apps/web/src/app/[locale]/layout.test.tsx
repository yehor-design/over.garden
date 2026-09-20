import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/root-document", () => ({
  StaticRootDocument: ({
    locale,
    children,
  }: {
    locale: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="root-document" data-document="static" data-locale={locale}>
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

  it("localizes fallback metadata from the route, and claims no market from it", async () => {
    // The locale is the route's — that is what this subtree is for. The market
    // is **not**: a prerendered document has no reader, and deriving one from
    // the language told the error boundary that a Russian-reading gardener in
    // Bulgaria was in Ukraine. Measured on production on 2026-09-17, which is
    // how it was found.
    for (const locale of ["uk", "bg", "ru"] as const) {
      await expect(
        generateMetadata({ params: Promise.resolve({ locale }) }),
      ).resolves.toMatchObject({
        title: "OverGarden",
        other: { "overgarden-interface-context": `ukraine:${locale}` },
      });
    }
  });

  it("renders a static document in the route's language", async () => {
    const html = renderToStaticMarkup(
      await LocaleRootLayout({
        children: <main>OverGarden</main>,
        params: Promise.resolve({ locale: "ru" }),
      }),
    );

    // ADR-0032 D1. The route's language *is* the reader's here: this subtree
    // is where the proxy renders an unprefixed address for a reader who chose
    // this language, and a prefix is itself a choice. So the chrome needs no
    // request to know what to say, and the document is prerendered with it.
    expect(html).toContain('data-document="static"');
    expect(html).toContain('data-locale="ru"');
    expect(html).toContain("<main>OverGarden</main>");
  });

  it("falls back to the default language for a segment that is not a locale", async () => {
    const html = renderToStaticMarkup(
      await LocaleRootLayout({
        children: <main>OverGarden</main>,
        params: Promise.resolve({ locale: "garden" }),
      }),
    );

    expect(html).toContain('data-locale="uk"');
  });
});
