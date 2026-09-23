import { describe, expect, it } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerLineageDate,
  formatOwnerLineageTemplate,
  getOwnerLineageCatalogKindLabel,
  getOwnerLineageCopy,
} from "@/lib/owner-lineage-copy";

const LOCALES = [
  "uk",
  "bg",
  "ru",
] as const satisfies readonly InterfaceLocale[];

describe("owner lineage copy", () => {
  it("keeps exact recursive key and placeholder parity across every locale", () => {
    const expectedShape = copyShape(getOwnerLineageCopy("uk"));
    const expectedPlaceholders = placeholderShape(getOwnerLineageCopy("uk"));

    for (const locale of LOCALES) {
      expect(copyShape(getOwnerLineageCopy(locale))).toEqual(expectedShape);
      expect(placeholderShape(getOwnerLineageCopy(locale))).toEqual(
        expectedPlaceholders,
      );
    }
  });

  it("names the three lineage tasks and every invitation answer", () => {
    expect(getOwnerLineageCopy("uk").claims.title).toBe("Заявки на походження");
    expect(getOwnerLineageCopy("uk").nav.questions).toBe("Запитання");
    expect(getOwnerLineageCopy("bg").invitation.handoff.retry).toBe("Нов опит");
    expect(getOwnerLineageCopy("ru").questions.title).toBe(
      "Вопросы о происхождении",
    );
    expect(getOwnerLineageCopy("ru").invitation.states.expiredTitle).toContain(
      "истёк",
    );
    // Distinct sentences, not one "unavailable, expired or already handled".
    const states = getOwnerLineageCopy("uk").invitation.states;
    const titles = [
      states.expiredTitle,
      states.invalidTitle,
      states.withdrawnTitle,
      states.confirmedByYouTitle,
      states.declinedByYouTitle,
      states.answeredByOtherTitle,
      states.ownTitle,
    ];
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("says what each answer changes, and that nothing moves between gardens", () => {
    for (const locale of LOCALES) {
      const copy = getOwnerLineageCopy(locale);
      // A confirmed claim is public only with public entries on both sides.
      expect(copy.claims.ifConfirm.length).toBeGreaterThan(60);
      // An invitation never makes anything public.
      expect(copy.invitation.ready.unchanged.length).toBeGreaterThan(60);
    }
    expect(getOwnerLineageCopy("uk").claims.unchanged).toContain(
      "не генетичний аналіз",
    );
    expect(getOwnerLineageCopy("uk").invitation.ready.unchanged).toContain(
      "Публічно не з'явиться нічого",
    );
    expect(getOwnerLineageCopy("bg").claims.unchanged).toContain(
      "не генетичен анализ",
    );
    expect(getOwnerLineageCopy("ru").claims.unchanged).toContain(
      "не генетический анализ",
    );
  });

  it("preserves authored object, variety, pending-identity, and question values", () => {
    const subject = "Cherokee Purple — Балкон № 3";
    const source = "Maria saved seeds";
    const sentence = formatOwnerLineageTemplate(
      getOwnerLineageCopy("bg").claims.cardTitle,
      { subject, source },
    );

    expect(sentence).toContain(subject);
    expect(sentence).toContain(source);
    expect(sentence).toContain("произхожда");
  });

  it("localizes dates and catalog-kind summaries without translating source values", () => {
    const value = new Date("2026-07-03T18:00:00.000Z");

    expect(formatOwnerLineageDate("bg", value)).toBe(
      new Intl.DateTimeFormat("bg-BG", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(value),
    );
    expect(getOwnerLineageCatalogKindLabel("uk", "plant_variety")).toBe(
      "Сорт рослини",
    );
    expect(getOwnerLineageCatalogKindLabel("bg", "breed")).toBe("Порода");
    expect(getOwnerLineageCatalogKindLabel("ru", null)).toBeNull();
  });

  it("contains no verified English owner-lineage fallback", () => {
    const forbidden =
      /\b(?:lineage claims|lineage invitation|back to journal|invited source|claimed object|proposed by|another gardener|claim and confirm|questions for you|followed lineage nodes|try again|preparing the private invitation|unknown variety)\b/i;

    for (const locale of LOCALES) {
      expect(
        flattenStrings(getOwnerLineageCopy(locale)).join("\n"),
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

function placeholderShape(value: unknown): unknown {
  if (typeof value === "string") {
    return [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)]
      .map((match) => match[1])
      .sort();
  }
  if (Array.isArray(value)) return value.map(placeholderShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        placeholderShape(nested),
      ]),
    );
  }
  return [];
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenStrings);
  }
  return [];
}
