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

  it("describes unknown and unavailable identities per domain, and knows no provisional one", () => {
    expect(
      publicObjectCatalogIdentityDescription("uk", "plant", "unknown"),
    ).toContain("ще не визначено");
    expect(
      publicObjectCatalogIdentityDescription("uk", "animal", "unavailable"),
    ).toContain("недоступна");
    expect(
      publicObjectCatalogIdentityDescription("bg", "animal", "unknown"),
    ).toContain("не е потвърден");
    // A gardener's own name is a private label (ADR-0026 D6): no public
    // filter, badge or description names it.
    expect(JSON.stringify(getPublicObjectCatalogCopy("uk"))).not.toMatch(
      /provisional|Робоч/u,
    );
  });
});
