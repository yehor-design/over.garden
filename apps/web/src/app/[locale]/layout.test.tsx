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

  it("sets the document language from the route and the shell from the reader", async () => {
    const html = renderToStaticMarkup(
      await LocaleRootLayout({
        children: <main>OverGarden</main>,
        params: Promise.resolve({ locale: "ru" }),
      }),
    );

    expect(html).toContain('data-lang="ru"');
    // The shell resolves the reader instead of taking the route's word for it.
    // This subtree is where an unprefixed address renders for a reader who
    // chose this language, so the market behind the language control is a fact
    // about them, not about the prefix they were rewritten into.
    expect(html).toContain('data-localization="request"');
    expect(html).toContain("<main>OverGarden</main>");
  });
});
