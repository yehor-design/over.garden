import { describe, expect, it } from "vitest";

import { getPublicJournalDirectoryCopy } from "./public-journal-directory-copy";

describe("public journal directory copy", () => {
  it("localizes the full filter and result contract in Ukrainian", () => {
    const copy = getPublicJournalDirectoryCopy("uk");

    expect(copy.heading).toBe("Журнали");
    expect(copy.kinds).toEqual({
      all: "Усі об'єкти",
      plant: "Рослини",
      animal: "Тварини",
    });
    expect(copy.seasons.summer).toBe("Літо");
    expect(copy.sorts.relevance).toBe("За відповідністю");
    expect(copy.loadMore).toBe("Показати більше журналів");
  });

  it("does not fall back to Ukrainian or English chrome in Bulgarian and Russian", () => {
    const bg = getPublicJournalDirectoryCopy("bg");
    const ru = getPublicJournalDirectoryCopy("ru");

    expect(bg.heading).toBe("Дневници");
    expect(bg.catalogLabel).toBe("Идентичност");
    expect(bg.emptyTitle).toBe("Няма намерени дневници");
    expect(ru.heading).toBe("Журналы");
    expect(ru.regionLabel).toBe("Безопасный регион");
    expect(ru.errorTitle).toBe("Журналы временно недоступны");
  });
});
