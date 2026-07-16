import { describe, expect, it } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerObjectTemplate,
  getOwnerObjectCopy,
} from "@/lib/owner-object-copy";

const LOCALES = [
  "uk",
  "bg",
  "ru",
] as const satisfies readonly InterfaceLocale[];

describe("owner object copy", () => {
  it("keeps exact recursive key parity across every supported locale", () => {
    const expectedShape = copyShape(getOwnerObjectCopy("uk"));
    const expectedPlaceholders = placeholderShape(getOwnerObjectCopy("uk"));

    for (const locale of LOCALES) {
      expect(copyShape(getOwnerObjectCopy(locale))).toEqual(expectedShape);
      expect(placeholderShape(getOwnerObjectCopy(locale))).toEqual(
        expectedPlaceholders,
      );
    }
  });

  it("localizes representative follow-up, privacy, catalog, provenance, and lifecycle states", () => {
    expect(getOwnerObjectCopy("uk").composer.fields.whatChanged).toBe(
      "Що змінилося?",
    );
    expect(getOwnerObjectCopy("bg").privacy.title).toBe(
      "Поверителност на местоположението",
    );
    expect(getOwnerObjectCopy("ru").catalog.save).toBe(
      "Сохранить соответствие каталогу",
    );
    expect(getOwnerObjectCopy("bg").entryActions.archivedTitle).toBe(
      "Архивирано като частно",
    );
    expect(getOwnerObjectCopy("ru").provenance.consent.confirmed).toBe(
      "Происхождение подтверждено",
    );
  });

  it("preserves user, catalog, and source values inside localized templates", () => {
    const objectName = "Apis mellifera — Кошер № 7";
    const sourceName = "Official Journal of the European Union / EUR-Lex";
    const copy = getOwnerObjectCopy("bg");

    expect(
      formatOwnerObjectTemplate(copy.composer.updating, { objectName }),
    ).toContain(objectName);
    expect(
      formatOwnerObjectTemplate(copy.source.summary, { sourceName }),
    ).toContain(sourceName);
    expect(copy.source.euLegalCaveat).toContain(
      "Official Journal of the European Union",
    );
    expect(
      formatOwnerObjectTemplate("{objectName} · {state}", {
        objectName: "Нотатка {state}",
        state: "private",
      }),
    ).toBe("Нотатка {state} · private");
  });

  it("contains no verified English owner-object fallback in authored locale copy", () => {
    const forbidden =
      /\b(?:add dated entry|owner controls|location privacy|match this object|quick private check-in|your plant progress|archive public entry|open public page|record private source|feedback could not be saved)\b/i;

    for (const locale of LOCALES) {
      expect(flattenStrings(getOwnerObjectCopy(locale)).join("\n")).not.toMatch(
        forbidden,
      );
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

function placeholderShape(value: unknown): unknown {
  if (typeof value === "string") {
    return [...value.matchAll(/\{([^{}]+)\}/gu)]
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
