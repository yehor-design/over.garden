import { describe, expect, it } from "vitest";

import {
  getInterfaceCopy,
  parseInterfaceLocalizationHint,
  resolveInterfaceLocalization,
  resolveInterfaceLocale,
  serializeInterfaceLocalizationHint,
} from "./interface-localization";

describe("interface locale contract", () => {
  it("round-trips only closed market-valid document hints", () => {
    expect(
      serializeInterfaceLocalizationHint({
        market: "bulgaria",
        locale: "ru",
      }),
    ).toBe("bulgaria:ru");
    expect(parseInterfaceLocalizationHint("bulgaria:bg")).toEqual({
      market: "bulgaria",
      locale: "bg",
    });
    expect(parseInterfaceLocalizationHint("ukraine:uk")).toEqual({
      market: "ukraine",
      locale: "uk",
    });
    expect(parseInterfaceLocalizationHint("bulgaria:uk")).toBeNull();
    expect(parseInterfaceLocalizationHint("ukraine:ru")).toBeNull();
    expect(parseInterfaceLocalizationHint("bulgaria:bg:private")).toBeNull();
    expect(() =>
      serializeInterfaceLocalizationHint({
        market: "ukraine",
        locale: "ru",
      }),
    ).toThrow("Interface localization hint must be market-valid.");
  });

  it("resolves market before accepting an allowed locale source", () => {
    expect(
      resolveInterfaceLocalization({
        explicitMarket: "ukraine",
        explicitLocale: "ru",
        routeLocale: "bg",
        persistedLocale: "uk",
        countryCode: "UA",
      }),
    ).toEqual({
      market: "ukraine",
      locale: "uk",
      marketSource: "explicit",
      localeSource: "persisted",
    });

    expect(
      resolveInterfaceLocalization({
        routeLocale: "bg",
        persistedLocale: "uk",
        countryCode: "UA",
      }),
    ).toEqual({
      market: "bulgaria",
      locale: "bg",
      marketSource: "route",
      localeSource: "route",
    });

    expect(
      resolveInterfaceLocalization({
        persistedMarket: "bulgaria",
        persistedLocale: "ru",
        countryCode: "UA",
      }),
    ).toEqual({
      market: "ukraine",
      locale: "uk",
      marketSource: "country",
      localeSource: "market-default",
    });

    expect(
      resolveInterfaceLocalization({
        persistedMarket: "bulgaria",
        persistedLocale: "uk",
        countryCode: "BG",
      }),
    ).toEqual({
      market: "bulgaria",
      locale: "bg",
      marketSource: "country",
      localeSource: "market-default",
    });
  });

  it("uses persisted state only for market continuity without a supported country", () => {
    expect(
      resolveInterfaceLocalization({
        persistedMarket: "bulgaria",
        persistedLocale: "ru",
      }),
    ).toEqual({
      market: "bulgaria",
      locale: "ru",
      marketSource: "persisted",
      localeSource: "persisted",
    });
    expect(
      resolveInterfaceLocalization({
        persistedMarket: "bulgaria",
        persistedLocale: "ru",
        countryCode: "DE",
      }),
    ).toMatchObject({ market: "bulgaria", locale: "ru" });
  });

  it("defaults by market and never uses Accept-Language to establish one", () => {
    expect(
      resolveInterfaceLocale({
        countryCode: "DE",
        acceptLanguage: "ru;q=0.9,bg;q=0.8",
      }),
    ).toBe("uk");
    expect(
      resolveInterfaceLocale({
        countryCode: "BG",
        acceptLanguage: "ru;q=1",
      }),
    ).toBe("bg");
    expect(
      resolveInterfaceLocale({
        countryCode: null,
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("uk");
    expect(resolveInterfaceLocale({})).toBe("uk");
  });

  it("provides one typed chrome contract without translating user content", () => {
    expect(getInterfaceCopy("uk").workspace.title).toBe("Простір саду");
    expect(getInterfaceCopy("bg").navigation.followedFeed).toBe(
      "Следвани записи",
    );
    expect(getInterfaceCopy("ru").object.backToJournal).toBe("Назад к журналу");
    expect(getInterfaceCopy("uk").navigation.livingObjects).toBe(
      "Живі об'єкти",
    );
    expect(getInterfaceCopy("bg").navigation.myGarden).toBe("Моята градина");
    expect(getInterfaceCopy("ru").shell.openMenu).toBe("Открыть навигацию");
    expect(getInterfaceCopy("bg").shell.loadingTitle).toBe(
      "Зареждане на OverGarden",
    );
    expect(getInterfaceCopy("ru").shell.retry).toBe("Повторить");
    expect(getInterfaceCopy("uk").shell.languageControlTrigger).toBe(
      "Змінити мову",
    );
  });
});
