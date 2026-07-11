import { describe, expect, it } from "vitest";

import {
  getPublicObjectCatalogCopy,
  publicObjectCatalogIdentityDescription,
} from "./public-object-catalog-copy";

describe("public living-object catalog copy", () => {
  it("localizes the browse contract without translating catalog or user content", () => {
    expect(getPublicObjectCatalogCopy("uk")).toMatchObject({
      heading: "Живі об'єкти",
      kinds: {
        all: "Усі",
        plant: "Рослини",
        animal: "Тварини",
        bee_colony: "Бджолосім'ї",
      },
      identities: {
        plant_variety: "Сорти",
        species: "Види",
        breed: "Породи",
      },
    });
    expect(getPublicObjectCatalogCopy("bg")).toMatchObject({
      heading: "Живи обекти",
      searchSubmit: "Търсене",
      openJournal: "Отвори дневника",
    });
    expect(getPublicObjectCatalogCopy("ru")).toMatchObject({
      heading: "Живые объекты",
      searchSubmit: "Найти",
      openPassport: "Открыть паспорт",
    });
  });

  it("uses domain-specific trust language for provisional animal and bee identities", () => {
    expect(
      publicObjectCatalogIdentityDescription("uk", "plant", "provisional"),
    ).toContain("робоча назва рослини");
    expect(
      publicObjectCatalogIdentityDescription("uk", "animal", "provisional"),
    ).toContain("не підтверджена порода чи вид");
    expect(
      publicObjectCatalogIdentityDescription("uk", "bee_colony", "provisional"),
    ).toContain("лінія сім'ї");
    expect(
      publicObjectCatalogIdentityDescription("bg", "animal", "unknown"),
    ).toContain("не е потвърден");
  });
});
