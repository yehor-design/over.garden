import { describe, expect, it } from "vitest";

import {
  getAllowedInterfaceLocales,
  getDefaultInterfaceLocale,
  readInterfaceCountryCode,
  resolveInterfaceMarket,
} from "./interface-market";

describe("interface market contract", () => {
  it("treats explicit Bulgarian and Russian routes as Bulgaria-market intent", () => {
    expect(
      resolveInterfaceMarket({ routeLocale: "bg", countryCode: "UA" }),
    ).toEqual({ market: "bulgaria", source: "route" });
    expect(
      resolveInterfaceMarket({ routeLocale: "ru", countryCode: "UA" }),
    ).toEqual({ market: "bulgaria", source: "route" });
    expect(
      resolveInterfaceMarket({ routeLocale: "uk", countryCode: "BG" }),
    ).toEqual({ market: "ukraine", source: "route" });
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

  it("owns deterministic per-market locale allowlists and defaults", () => {
    expect(getAllowedInterfaceLocales("ukraine")).toEqual(["uk"]);
    expect(getDefaultInterfaceLocale("ukraine")).toBe("uk");
    expect(getAllowedInterfaceLocales("bulgaria")).toEqual(["bg", "ru"]);
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
