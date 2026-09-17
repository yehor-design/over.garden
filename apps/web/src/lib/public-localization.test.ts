import { describe, expect, it } from "vitest";

import {
  PUBLIC_LOCALES,
  buildLanguageAlternates,
  getLanguageSwitcherLocales,
  getRootLocaleRedirectPath,
  localizedPath,
  selectPublicLocaleFromAcceptLanguage,
  selectPublicLocaleFromRequestContext,
  stripLocalePrefix,
} from "./public-localization";

describe("public localization paths", () => {
  it("keeps Ukrainian canonical paths unprefixed", () => {
    expect(localizedPath("uk", "/")).toBe("/");
    expect(localizedPath("uk", "/privacy")).toBe("/privacy");
    expect(localizedPath("bg", "/privacy")).toBe("/bg/privacy");
    expect(localizedPath("ru", "privacy")).toBe("/ru/privacy");
  });

  it("strips only supported locale prefixes", () => {
    expect(stripLocalePrefix("/bg/topics/care-checks")).toEqual({
      locale: "bg",
      path: "/topics/care-checks",
    });
    expect(stripLocalePrefix("/uk")).toEqual({ locale: "uk", path: "/" });
    expect(stripLocalePrefix("/en/privacy")).toEqual({
      locale: null,
      path: "/en/privacy",
    });
  });

  it("never emits a canonical /uk alternate", () => {
    expect(buildLanguageAlternates("/privacy")).toEqual({
      uk: "/privacy",
      bg: "/bg/privacy",
      ru: "/ru/privacy",
      "x-default": "/privacy",
    });
    expect(Object.values(buildLanguageAlternates("/"))).not.toContain("/uk");
  });

  it("offers every language to every reader", () => {
    expect(getLanguageSwitcherLocales()).toEqual(["uk", "bg", "ru"]);
  });
});

describe("public first-entry locale", () => {
  it("uses country-level market defaults and ignores Accept-Language as a market signal", () => {
    expect(
      selectPublicLocaleFromRequestContext({
        countryCode: "BG",
        acceptLanguage: "ru;q=1",
      }),
    ).toBe("bg");
    expect(
      selectPublicLocaleFromRequestContext({
        countryCode: "UA",
        acceptLanguage: "ru;q=1",
      }),
    ).toBe("uk");
    expect(
      selectPublicLocaleFromRequestContext({
        countryCode: null,
        acceptLanguage: "ru;q=1,bg;q=0.9",
      }),
    ).toBe("uk");
    expect(getRootLocaleRedirectPath("ru;q=1")).toBe("/");
  });

  it("retains Accept-Language parsing only as a non-market utility", () => {
    expect(selectPublicLocaleFromAcceptLanguage("bg-BG,bg;q=0.9")).toBe("bg");
    expect(selectPublicLocaleFromAcceptLanguage("ru;q=0.9,uk;q=0.8")).toBe(
      "ru",
    );
  });
});

describe("hreflang reciprocity", () => {
  it("builds the same alternate set from every locale of a family", () => {
    // Google requires reciprocity: each page in a cluster must name the others
    // *and itself*. That holds only when every locale of a family passes the
    // same list, which is why a per-locale list is the wrong shape for this.
    const fromEach = PUBLIC_LOCALES.map(() =>
      buildLanguageAlternates("/topics/care-checks", PUBLIC_LOCALES),
    );
    for (const alternates of fromEach) {
      expect(alternates).toEqual(fromEach[0]);
      expect(Object.keys(alternates).sort()).toEqual([
        "bg",
        "ru",
        "uk",
        "x-default",
      ]);
    }
  });

  it("puts x-default on the unprefixed default locale", () => {
    const alternates = buildLanguageAlternates("/journals", PUBLIC_LOCALES);

    expect(alternates["x-default"]).toBe(alternates.uk);
    expect(alternates.uk).toBe("/journals");
  });

  it("never lets a narrowed language list stand in for an hreflang set", () => {
    // An hreflang cluster is built from the addresses a page has, never from
    // what some reader may switch to. Narrowing the set produced a cluster
    // that omitted the canonical URL itself — /bg/communities once declared bg
    // and ru and not uk. The switcher now happens to list all three, which is
    // exactly why this must be asserted against a narrowed list rather than
    // against the switcher: the day the two diverge again, this still fails.
    const narrowed = ["bg", "ru"] as const;

    expect(
      Object.keys(buildLanguageAlternates("/communities", narrowed)),
    ).not.toContain("uk");
    expect(
      Object.keys(buildLanguageAlternates("/communities")),
    ).toEqual([...PUBLIC_LOCALES, "x-default"]);
    expect(buildLanguageAlternates("/communities")["x-default"]).toBe(
      "/communities",
    );
  });
});
