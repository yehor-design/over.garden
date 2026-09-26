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
    expect(copy.degradedSearchTitle).toBe("Пошук тимчасово обмежений");
    // The faceted bar's own copy: the filter button carries the active count
    // and the result count is pluralised here, because `FilterBar` carries no
    // locale (DESIGN.md §4.2.5).
    expect(copy.filtersWithCount(0)).toBe("Фільтри");
    expect(copy.filtersWithCount(3)).toBe("Фільтри (3)");
    expect(copy.resultCount(1)).toBe("1 запис");
    expect(copy.resultCount(2)).toBe("2 записи");
    expect(copy.resultCount(5)).toBe("5 записів");
    expect(copy.resultCount(11)).toBe("11 записів");
    expect(copy.resultCount(21)).toBe("21 запис");
  });

  it("does not fall back to Ukrainian or English chrome in Bulgarian and Russian", () => {
    const bg = getPublicJournalDirectoryCopy("bg");
    const ru = getPublicJournalDirectoryCopy("ru");

    expect(bg.heading).toBe("Дневници");
    expect(bg.catalogLabel).toBe("Идентичност");
    expect(bg.emptyTitle).toBe("Няма намерени записи");
    expect(ru.heading).toBe("Журналы");
    expect(ru.regionLabel).toBe("Безопасный регион");
    expect(ru.errorTitle).toBe("Журналы временно недоступны");
    expect(bg.degradedSearchTitle).not.toBe("Пошук тимчасово обмежений");
    expect(ru.degradedSearchTitle).not.toBe("Пошук тимчасово обмежений");
    // Bulgarian takes a plain singular/plural and the other two take three
    // forms, so the count is not one shared helper pretending otherwise.
    expect(bg.resultCount(1)).toBe("1 запис");
    expect(bg.resultCount(5)).toBe("5 записа");
    expect(ru.resultCount(1)).toBe("1 запись");
    expect(ru.resultCount(3)).toBe("3 записи");
    expect(ru.resultCount(7)).toBe("7 записей");
    expect(bg.filtersWithCount(2)).toBe("Филтри (2)");
    expect(ru.filtersWithCount(2)).toBe("Фильтры (2)");
  });
});
