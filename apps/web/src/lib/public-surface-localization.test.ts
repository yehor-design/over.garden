import { describe, expect, it } from "vitest";

import {
  formatPublicCount,
  getPublicSurfaceCopy,
} from "./public-surface-localization";

describe("public surface localization", () => {
  it("provides public UI copy for every supported locale", () => {
    expect(getPublicSurfaceCopy("uk").journal.entryType).toBe(
      "Запис у журналі живого об'єкта",
    );
    expect(getPublicSurfaceCopy("bg").engagement.bookmark).toBe("Запази");
    expect(getPublicSurfaceCopy("ru").passport.title).toBe(
      "Публичный паспорт живого объекта",
    );
    expect(getPublicSurfaceCopy("bg").sourceCredits.versionLabel).toBe(
      "Версия",
    );
  });

  it("uses locale-aware count forms without changing source values", () => {
    expect(formatPublicCount("uk", "entry", 5)).toBe("5 записів");
    expect(formatPublicCount("bg", "photo", 2)).toBe("2 снимки");
    expect(formatPublicCount("ru", "publicEntry", 2)).toBe(
      "2 публичные записи",
    );
    expect(formatPublicCount("uk", "like", 1)).toBe("1 вподобання");
  });
});
