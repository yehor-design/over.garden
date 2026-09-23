import { describe, expect, it } from "vitest";

import {
  formatPublicProfileCount,
  getPublicProfileCopy,
} from "./public-profile-copy";

describe("public profile copy", () => {
  it.each([
    ["uk", "Записи", "Об’єкти"],
    ["bg", "Записи", "Обекти"],
    ["ru", "Записи", "Объекты"],
  ] as const)(
    "names the two views in the product's vocabulary for %s (OVE-494)",
    (locale, entries, objects) => {
      const copy = getPublicProfileCopy(locale);

      expect(copy.entriesTab).toBe(entries);
      expect(copy.objectsTab).toBe(objects);
      expect(copy.follow).toBeTruthy();
      expect(copy.report).toBeTruthy();
      expect(copy.block).toBeTruthy();
      expect(copy.pageStatus).toContain("{page}");
      expect(copy.pageStatus).toContain("{count}");
    },
  );

  it("says nothing about how the page is built", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const words = JSON.stringify(getPublicProfileCopy(locale));
      // The lineage count, the claim queue and the "counters are hidden"
      // notice were implementation facts shown to readers.
      expect(words).not.toMatch(/походжен|произход|происхожден/iu);
      expect(words).not.toMatch(/лічильник|брояч|счётчик/iu);
    }
  });

  it("counts followers in each language's own plural forms", () => {
    expect(formatPublicProfileCount("uk", "followers", 1)).toBe("1 підписник");
    expect(formatPublicProfileCount("uk", "followers", 3)).toBe("3 підписники");
    expect(formatPublicProfileCount("uk", "followers", 12)).toBe(
      "12 підписників",
    );
    expect(formatPublicProfileCount("ru", "following", 5)).toBe("5 подписок");
    expect(formatPublicProfileCount("bg", "followers", 1)).toBe(
      "1 последовател",
    );
    expect(formatPublicProfileCount("bg", "followers", 7)).toBe(
      "7 последователи",
    );
  });
});
