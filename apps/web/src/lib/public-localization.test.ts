import { describe, expect, it } from "vitest";

import {
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

  it("keeps the public switcher allowlist market-bounded", () => {
    expect(getLanguageSwitcherLocales("uk")).toEqual(["uk"]);
    expect(getLanguageSwitcherLocales("bg")).toEqual(["bg", "ru"]);
    expect(getLanguageSwitcherLocales("ru")).toEqual(["bg", "ru"]);
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
