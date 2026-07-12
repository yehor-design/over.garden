import { describe, expect, it } from "vitest";

import { getPublicProfileCopy } from "./public-profile-copy";

describe("public profile copy", () => {
  it.each([
    ["uk", "Живі об’єкти", "Журнал догляду"],
    ["bg", "Живи обекти", "Дневник за грижи"],
    ["ru", "Живые объекты", "Журнал ухода"],
  ] as const)(
    "localizes the object-first profile for %s",
    (locale, objects, journals) => {
      const copy = getPublicProfileCopy(locale);

      expect(copy.objectsTitle).toBe(objects);
      expect(copy.journalsTitle).toBe(journals);
      expect(copy.follow).toBeTruthy();
      expect(copy.report).toBeTruthy();
      expect(copy.block).toBeTruthy();
      expect(copy.privateProfile).toBeTruthy();
    },
  );
});
