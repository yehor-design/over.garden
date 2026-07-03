import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  getRootLocaleRedirectPath,
  selectPublicLocaleFromAcceptLanguage,
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
  });

  it("renders localized homepages with language switcher and no private route leaks", async () => {
    const html = renderToStaticMarkup(
      await HomeRoute({ params: Promise.resolve({ locale: "uk" }) }),
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "uk" }),
    });

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.alternates).toMatchObject({
      canonical: "/uk",
      languages: {
        uk: "/uk",
        bg: "/bg",
        ru: "/ru",
        "x-default": "/uk",
      },
    });
    expect(html).toContain('lang="uk"');
    expect(html).toContain("Ведіть живу історію");
    expect(html).toContain("Українська");
    expect(html).toContain("Български");
    expect(html).toContain("Русский");
    expect(html).not.toContain("/join?");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/garden/pilot");
  });
});
