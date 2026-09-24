import { describe, expect, it } from "vitest";

import { getLocalizedHomeContent } from "@/server/public-localized-content";
import { getPublicJournalEntryCopy } from "./public-journal-entry-copy";
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
    // Every market offers every language since 2026-09-17, so these two pairs
    // are ordinary rather than impossible: a reader in Bulgaria reading in
    // Ukrainian, and a reader in Ukraine reading in Russian.
    expect(parseInterfaceLocalizationHint("bulgaria:uk")).toEqual({
      market: "bulgaria",
      locale: "uk",
    });
    expect(parseInterfaceLocalizationHint("ukraine:ru")).toEqual({
      market: "ukraine",
      locale: "ru",
    });
    expect(parseInterfaceLocalizationHint("bulgaria:bg:private")).toBeNull();
    expect(parseInterfaceLocalizationHint("bulgaria:de")).toBeNull();
    expect(parseInterfaceLocalizationHint("moldova:bg")).toBeNull();
    expect(() =>
      serializeInterfaceLocalizationHint({
        market: "ukraine",
        locale: "de" as never,
      }),
    ).toThrow("Interface localization hint must be market-valid.");
  });

  it("takes the language from the loudest source and the market from the reader", () => {
    // Explicit beats the route, the route beats what was saved, and what was
    // saved beats the market's default. The market is now only the last of
    // those: it decides where a reader who has chosen nothing starts.
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
      locale: "ru",
      marketSource: "explicit",
      localeSource: "explicit",
    });

    // The prefix is a choice, and a choice outranks a saved language. It no
    // longer moves the reader's market: they are still in Ukraine.
    expect(
      resolveInterfaceLocalization({
        routeLocale: "bg",
        persistedLocale: "uk",
        countryCode: "UA",
      }),
    ).toEqual({
      market: "ukraine",
      locale: "bg",
      marketSource: "country",
      localeSource: "route",
    });

    // A saved language survives the border. This is the whole point of the
    // preference: it held only inside one market before, so a reader who chose
    // Russian in Bulgaria was put back into Ukrainian by a Ukrainian address.
    expect(
      resolveInterfaceLocalization({
        persistedMarket: "bulgaria",
        persistedLocale: "ru",
        countryCode: "UA",
      }),
    ).toEqual({
      market: "ukraine",
      locale: "ru",
      marketSource: "country",
      localeSource: "persisted",
    });

    expect(
      resolveInterfaceLocalization({
        persistedMarket: "bulgaria",
        persistedLocale: "uk",
        countryCode: "BG",
      }),
    ).toEqual({
      market: "bulgaria",
      locale: "uk",
      marketSource: "country",
      localeSource: "persisted",
    });

    // And a reader who has chosen nothing starts in their country's language.
    expect(resolveInterfaceLocalization({ countryCode: "BG" })).toEqual({
      market: "bulgaria",
      locale: "bg",
      marketSource: "country",
      localeSource: "market-default",
    });
    expect(resolveInterfaceLocalization({ countryCode: "UA" })).toEqual({
      market: "ukraine",
      locale: "uk",
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

  it("names the account as the IA does, never with the entry's or the profile's word", () => {
    // INFORMATION_ARCHITECTURE.md, "Navigation and labels" (OVE-478). In
    // Ukrainian «запис» is a journal entry and in Bulgarian «профил» is a
    // gardener's public page, so neither may also name the sign-in account.
    expect(
      (["uk", "bg", "ru"] as const).map((locale) => {
        const { account, accountRegion, openAccount } =
          getInterfaceCopy(locale).shell;
        return [account, accountRegion, openAccount];
      }),
    ).toEqual([
      ["Акаунт", "Акаунт", "Відкрити меню акаунта"],
      ["Акаунт", "Акаунт", "Отваряне на менюто на акаунта"],
      ["Аккаунт", "Аккаунт", "Открыть меню аккаунта"],
    ]);
  });

  it("calls the feed one thing in the menu, on the page and on the way back", () => {
    // The Bulgarian menu said «Емисия» and the page it opened said «Поток»,
    // as did an entry's way back to it.
    expect(
      (["uk", "bg", "ru"] as const).map((locale) => [
        getInterfaceCopy(locale).navigation.feed,
        getLocalizedHomeContent(locale).feed.heading,
        getPublicJournalEntryCopy(locale).feed,
      ]),
    ).toEqual([
      ["Стрічка", "Стрічка", "Стрічка"],
      ["Емисия", "Емисия", "Емисия"],
      ["Лента", "Лента", "Лента"],
    ]);
  });
});
