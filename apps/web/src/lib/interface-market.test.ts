import { describe, expect, it } from "vitest";

import {
  getAllowedInterfaceLocales,
  getDefaultInterfaceLocale,
  readInterfaceCountryCode,
  resolveInterfaceMarket,
} from "./interface-market";

describe("interface market contract", () => {
  it("never reads a market out of a locale prefix", () => {
    // Each market carries all three languages now, so a prefix says which
    // language a reader chose and nothing about where they are. Reading a
    // market out of it moved a reader in Ukraine into the Bulgarian market for
    // choosing Russian, and took the language control away from a reader in
    // Bulgaria for choosing Ukrainian.
    expect(
      resolveInterfaceMarket({ routeLocale: "bg", countryCode: "UA" }),
    ).toEqual({ market: "ukraine", source: "country" });
    expect(
      resolveInterfaceMarket({ routeLocale: "ru", countryCode: "UA" }),
    ).toEqual({ market: "ukraine", source: "country" });
    expect(
      resolveInterfaceMarket({ routeLocale: "uk", countryCode: "BG" }),
    ).toEqual({ market: "bulgaria", source: "country" });
    expect(
      resolveInterfaceMarket({ routeLocale: "uk", persistedMarket: "bulgaria" }),
    ).toEqual({ market: "bulgaria", source: "persisted" });
  });

  it("lets supported country win on unprefixed routes", () => {
    expect(
      resolveInterfaceMarket({
        countryCode: "UA",
        persistedMarket: "bulgaria",
      }),
    ).toEqual({ market: "ukraine", source: "country" });
    expect(
      resolveInterfaceMarket({
        countryCode: "BG",
        persistedMarket: "ukraine",
      }),
    ).toEqual({ market: "bulgaria", source: "country" });
  });

  it("uses the bounded market preference only when country is unavailable", () => {
    expect(
      resolveInterfaceMarket({
        countryCode: null,
        persistedMarket: "bulgaria",
      }),
    ).toEqual({ market: "bulgaria", source: "persisted" });
    expect(
      resolveInterfaceMarket({
        countryCode: "DE",
        persistedMarket: "ukraine",
      }),
    ).toEqual({ market: "ukraine", source: "persisted" });
    expect(
      resolveInterfaceMarket({
        countryCode: null,
        persistedMarket: "invalid",
      }),
    ).toEqual({ market: "ukraine", source: "fallback" });
  });

  it("offers every language in every market and differs only in the default", () => {
    expect(getAllowedInterfaceLocales("ukraine")).toEqual(["uk", "bg", "ru"]);
    expect(getAllowedInterfaceLocales("bulgaria")).toEqual(["uk", "bg", "ru"]);
    expect(getDefaultInterfaceLocale("ukraine")).toBe("uk");
    expect(getDefaultInterfaceLocale("bulgaria")).toBe("bg");
  });

  it("reads only a normalized country-level request signal", () => {
    expect(
      readInterfaceCountryCode(new Headers({ "x-vercel-ip-country": " bg " })),
    ).toBe("BG");
    expect(
      readInterfaceCountryCode(new Headers({ "cf-ipcountry": "ua" })),
    ).toBe("UA");
    expect(
      readInterfaceCountryCode(new Headers({ "x-country-code": "unknown" })),
    ).toBeNull();
  });
});
