import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  getRootLocaleRedirectPath,
  selectPublicLocaleFromAcceptLanguage,
  selectPublicLocaleFromRequestContext,
} from "@/lib/public-localization";
import HomeRoute, { generateMetadata } from "./[locale]/page";

describe("/", () => {
  it("selects an explicit localized root from Accept-Language", () => {
    expect(
      selectPublicLocaleFromAcceptLanguage("bg-BG,bg;q=0.9,uk;q=0.4"),
    ).toBe("bg");
    expect(selectPublicLocaleFromAcceptLanguage("ru;q=0.9,uk;q=0.8")).toBe(
      "ru",
    );
    expect(selectPublicLocaleFromAcceptLanguage("en-US,en;q=0.9")).toBe("uk");
    expect(getRootLocaleRedirectPath("bg-BG,bg;q=0.9")).toBe("/bg");
    expect(getRootLocaleRedirectPath("ru;q=0.9,uk;q=0.8", "UA")).toBe("/");
    expect(getRootLocaleRedirectPath("ru;q=0.9,uk;q=0.8", "BG")).toBe("/bg");
    expect(
      selectPublicLocaleFromRequestContext({
        acceptLanguage: "ru;q=0.9",
        countryCode: "UA",
      }),
    ).toBe("uk");
  });

  it("renders the Ukrainian default homepage without a language switcher", async () => {
    const html = renderToStaticMarkup(
      await HomeRoute({ params: Promise.resolve({ locale: "uk" }) }),
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "uk" }),
    });

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.alternates).toMatchObject({
      canonical: "/",
      languages: {
        uk: "/",
        bg: "/bg",
        ru: "/ru",
        "x-default": "/",
      },
    });
    expect(html).toContain('lang="uk"');
    expect(html).toContain("Ведіть живу історію");
    expect(html).not.toContain('aria-label="Language switcher"');
    expect(html).not.toContain("Українська");
    expect(html).not.toContain("Български");
    expect(html).not.toContain("Русский");
    expect(html).not.toContain("/join?");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/garden/pilot");
  });

  it("renders the Bulgarian homepage with only Bulgarian and Russian choices", async () => {
    const html = renderToStaticMarkup(
      await HomeRoute({ params: Promise.resolve({ locale: "bg" }) }),
    );

    expect(html).toContain('lang="bg"');
    expect(html).toContain('aria-label="Смяна на езика"');
    expect(html).toContain("Български");
    expect(html).toContain("Русский");
    expect(html).not.toContain("Українська");
    expect(html).not.toContain("/uk");
  });
});
