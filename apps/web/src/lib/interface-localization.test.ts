import { describe, expect, it } from "vitest";

import {
  getInterfaceCopy,
  resolveInterfaceLocale,
} from "./interface-localization";

describe("interface locale contract", () => {
  it("resolves locale sources in explicit, route, persisted, and request order", () => {
    expect(
      resolveInterfaceLocale({
        explicitLocale: "ru",
        routeLocale: "bg",
        persistedLocale: "uk",
        countryCode: "UA",
        acceptLanguage: "uk;q=1",
      }),
    ).toBe("ru");

    expect(
      resolveInterfaceLocale({
        explicitLocale: "invalid",
        routeLocale: "bg",
        persistedLocale: "uk",
        countryCode: "UA",
        acceptLanguage: "uk;q=1",
      }),
    ).toBe("bg");

    expect(
      resolveInterfaceLocale({
        persistedLocale: "ru",
        countryCode: "BG",
        acceptLanguage: "bg;q=1",
      }),
    ).toBe("ru");

    expect(
      resolveInterfaceLocale({
        persistedLocale: "en",
        countryCode: "BG",
        acceptLanguage: "ru;q=1",
      }),
    ).toBe("bg");
  });

  it("uses Accept-Language and then Ukrainian as deterministic safe fallbacks", () => {
    expect(
      resolveInterfaceLocale({
        countryCode: "DE",
        acceptLanguage: "ru;q=0.9,bg;q=0.8",
      }),
    ).toBe("ru");
    expect(
      resolveInterfaceLocale({
        countryCode: null,
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("uk");
    expect(resolveInterfaceLocale({})).toBe("uk");
    expect(
      resolveInterfaceLocale({
        countryCode: null,
        acceptLanguage: "en;q=1,bg;q=0",
      }),
    ).toBe("uk");
  });

  it("provides one typed chrome contract without translating user content", () => {
    expect(getInterfaceCopy("uk").workspace.title).toBe("Простір саду");
    expect(getInterfaceCopy("bg").navigation.followedFeed).toBe(
      "Следвани записи",
    );
    expect(getInterfaceCopy("ru").object.backToJournal).toBe("Назад к журналу");
  });
});
