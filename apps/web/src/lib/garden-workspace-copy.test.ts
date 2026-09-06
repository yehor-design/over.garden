import { describe, expect, it } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
  localizedJournalSaveErrorMessage,
} from "@/lib/garden-workspace-copy";

const LOCALES = [
  "uk",
  "bg",
  "ru",
] as const satisfies readonly InterfaceLocale[];

describe("garden workspace copy", () => {
  it("keeps exact recursive key parity across every supported locale", () => {
    const expectedShape = copyShape(getGardenWorkspaceCopy("uk"));

    for (const locale of LOCALES) {
      expect(copyShape(getGardenWorkspaceCopy(locale))).toEqual(expectedShape);
    }
  });

  it("localizes representative inventory, local authoring, and publication states", () => {
    expect(getGardenWorkspaceCopy("uk").workspace.summary.objects).toBe(
      "Об'єкти",
    );
    expect(getGardenWorkspaceCopy("bg").composer.actions.saveOnline).toBe(
      "Запазване на първия запис",
    );
    expect(getGardenWorkspaceCopy("ru").composer.publicationNotice).toBe(
      "До успешной публикации изменения остаются только в этой вкладке. Опубликованная запись будет публичной.",
    );
    expect(getGardenWorkspaceCopy("bg").saveProgress.firstEntry.title).toBe(
      "Записът за градината ви е започнат",
    );
    expect(getGardenWorkspaceCopy("uk").composer.photo.choose).toBe(
      "Обрати фото",
    );
    expect(getGardenWorkspaceCopy("bg").composer.photo.choose).toBe(
      "Избор на снимка",
    );
    expect(getGardenWorkspaceCopy("ru").composer.photo.choose).toBe(
      "Выбрать фото",
    );
  });

  it("preserves user and catalog values while localizing surrounding copy", () => {
    const objectName = "Monstera deliciosa — Балкон № 3";
    const sentence = formatGardenWorkspaceTemplate(
      getGardenWorkspaceCopy("bg").workspace.nextAction.finishFirstNoteTitle,
      { objectName },
    );

    expect(sentence).toContain(objectName);
    expect(sentence).toContain("първата бележка");
  });

  it("names the three picker outcomes in every locale without a trust word or a caveat", () => {
    const expected = {
      uk: { own: /Додати як мою назву: «Де Барао»/u, outcomes: /вид, сорт чи породу/u },
      bg: { own: /Добавяне като мое име: „Де Барао“/u, outcomes: /вид, сорт или порода/u },
      ru: { own: /Добавить как моё название: «Де Барао»/u, outcomes: /вид, сорт или породу/u },
    } as const;

    for (const locale of LOCALES) {
      const picker = getGardenWorkspaceCopy(locale).composer.catalogPicker;
      expect(
        formatGardenWorkspaceTemplate(picker.ownName, { query: "Де Барао" }),
      ).toMatch(expected[locale].own);
      expect(picker.outcomes).toMatch(expected[locale].outcomes);
      expect(Object.keys(picker.kinds).sort()).toEqual([
        "breed",
        "cultivar",
        "species",
      ]);
      expect(JSON.stringify(picker)).not.toMatch(
        /trust|caveat|source|Перевірено|Проверено|Потвърдено|карантин|quarant/iu,
      );
    }
  });

  it("maps photo and generic save failures to locale-owned recovery copy", () => {
    expect(
      localizedJournalSaveErrorMessage(
        "uk",
        new Error("photo intent no longer has selected bytes"),
      ),
    ).toContain("Не вдалося прочитати це фото");
    expect(
      localizedJournalSaveErrorMessage("bg", new Error("Database unavailable")),
    ).toBe(
      "Все още не може да бъде запазено. Опитайте отново при стабилна връзка.",
    );
    expect(localizedJournalSaveErrorMessage("ru", null)).toContain(
      "Не удалось сохранить",
    );
  });

  it("describes self-serve access without retired invitation language", () => {
    const retiredAccessLanguage =
      /closed.?pilot|founder.?rehearsal|без запрошення|без покана|без приглашения|закрит(?:ий|ого) пілот|затворен(?:ия)? пилот|закрыт(?:ый|ого) пилот/i;

    for (const locale of LOCALES) {
      expect(
        flattenStrings(getGardenWorkspaceCopy(locale)).join("\n"),
      ).not.toMatch(retiredAccessLanguage);
    }
  });

  it("contains no verified English workspace fallback in authored locale copy", () => {
    const forbidden =
      /\b(?:next useful action|living objects|drafts on this device|queued locally|save first entry|mention suggestions unavailable|garden trail|try this section again)\b/i;

    for (const locale of LOCALES) {
      expect(
        flattenStrings(getGardenWorkspaceCopy(locale)).join("\n"),
      ).not.toMatch(forbidden);
    }
  });
});

function copyShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyShape);
  if (typeof value === "string") return "string";
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, copyShape(nested)]),
    );
  }
  return typeof value;
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenStrings);
  }
  return [];
}
