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

  it("localizes claims, invitation handoff, questions, and every consent state", () => {
    expect(getOwnerLineageCopy("uk").claims.title).toBe(
      "Запити щодо походження",
    );
    expect(getOwnerLineageCopy("bg").invitation.handoff.retry).toBe("Нов опит");
    expect(getOwnerLineageCopy("ru").updates.questionsTitle).toBe(
      "Вопросы для вас",
    );
    expect(getOwnerLineageCopy("uk").states.confirmed).toContain(
      "підтверджено",
    );
    expect(getOwnerLineageCopy("bg").states.declined).toContain("отказан");
    expect(getOwnerLineageCopy("ru").states.expired).toContain("истёк");
  });

  it("preserves authored object, variety, pending-identity, and question values", () => {
    const subject = "Cherokee Purple — Балкон № 3";
    const source = "Maria saved seeds";
    const sentence = formatOwnerLineageTemplate(
      getOwnerLineageCopy("bg").claims.claimTitle,
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
