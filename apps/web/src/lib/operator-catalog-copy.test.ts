import { describe, expect, it, vi } from "vitest";

import {
  CURATION_ITEM_TYPES,
  CURATION_RESULTS,
  type CurationBlock,
} from "@/lib/catalog/curation-queue";
import { catalogIdentifierSchemeName } from "@/lib/catalog/source-names";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  countOperatorCatalogUnit,
  describeCurationReason,
  getOperatorCatalogCopy,
  type CountForms,
} from "@/lib/operator-catalog-copy";

const LOCALES = [
  "uk",
  "bg",
  "ru",
] as const satisfies readonly InterfaceLocale[];

const BLOCKS: readonly CurationBlock[] = [
  "no_target",
  "target_inactive",
  "not_applied_here",
];

/**
 * Every key path, except inside a count's forms: those follow the language's
 * own plural rules rather than Ukrainian's — Bulgarian has no `few` and no
 * `many` — and are held to those rules by the test below instead.
 */
function copyShape(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (prefix === "units") return [path];
    return [path, ...copyShape(child, path)];
  });
}

function leaves(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (typeof value !== "object" || value === null) return [[prefix, value]];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]!).sort();
}

describe("the owner's catalogue copy in three languages (OVE-506)", () => {
  it("keeps the same key structure in uk, bg and ru", () => {
    const expected = copyShape(getOperatorCatalogCopy("uk")).sort();
    expect(expected.length).toBeGreaterThan(100);

    for (const locale of LOCALES) {
      expect(copyShape(getOperatorCatalogCopy(locale)).sort(), locale).toEqual(
        expected,
      );
    }
  });

  it("names every rule code the ladder writes in all three languages", () => {
    const codes = Object.keys(
      getOperatorCatalogCopy("uk").reasons.names,
    ).sort();
    expect(codes).toContain("shared_identifier");
    expect(codes).toContain("fuzzy_same_genus");

    for (const locale of LOCALES) {
      expect(
        Object.keys(getOperatorCatalogCopy(locale).reasons.names).sort(),
        locale,
      ).toEqual(codes);
    }
  });

  it("leaves no string empty in any language", () => {
    for (const locale of LOCALES) {
      for (const [path, value] of leaves(getOperatorCatalogCopy(locale))) {
        expect(typeof value, `${locale} ${path}`).toBe("string");
        expect(String(value).trim(), `${locale} ${path}`).not.toBe("");
      }
    }
  });

  it("names the same placeholders in every language, so no value is dropped", () => {
    const uk = new Map(leaves(getOperatorCatalogCopy("uk")));

    for (const locale of ["bg", "ru"] as const) {
      for (const [path, text] of leaves(getOperatorCatalogCopy(locale))) {
        const source = uk.get(path);
        if (typeof source !== "string") continue;
        expect(placeholders(String(text)), `${locale} ${path}`).toEqual(
          placeholders(source),
        );
      }
    }
  });

  it("has a form for every plural category each language counts with", () => {
    for (const locale of LOCALES) {
      const categories = new Intl.PluralRules(locale).resolvedOptions()
        .pluralCategories;
      for (const [unit, forms] of Object.entries(
        getOperatorCatalogCopy(locale).units,
      )) {
        for (const category of categories) {
          expect(
            forms[category as keyof CountForms],
            `${locale} ${unit} ${category}`,
          ).toBeTruthy();
        }
      }
    }
  });

  it("has words for every answer, item type and reason Accept is refused", () => {
    for (const locale of LOCALES) {
      const copy = getOperatorCatalogCopy(locale);
      for (const result of CURATION_RESULTS) {
        expect(copy.queue.outcome[result], `${locale} ${result}`).toBeTruthy();
      }
      for (const type of CURATION_ITEM_TYPES) {
        expect(copy.queue.itemTypes[type], `${locale} ${type}`).toBeTruthy();
      }
      for (const block of BLOCKS) {
        expect(copy.queue.blocked[block], `${locale} ${block}`).toBeTruthy();
      }
    }
  });

  it("gives every control's accessible name the words the control shows (WCAG 2.5.3)", () => {
    // A speech user says what they see. Each name is the visible label plus
    // the item it acts on, so the placeholder is set aside and the label must
    // be what is left, in any case.
    for (const locale of LOCALES) {
      const copy = getOperatorCatalogCopy(locale);
      const pairs = [
        [
          "health.makeQueueItemLabel",
          copy.health.makeQueueItemLabel,
          copy.health.makeQueueItem,
        ],
        ["queue.reviewLabel", copy.queue.reviewLabel, copy.queue.review],
        ["automatic.undoLabel", copy.automatic.undoLabel, copy.automatic.undo],
        [
          "sources.refreshLabel",
          copy.sources.refreshLabel,
          copy.sources.refresh,
        ],
      ] as const;
      for (const [key, template, visible] of pairs) {
        expect(placeholders(template), `${locale} ${key}`).toHaveLength(1);
        const name = template
          .replace(/\{\w+\}/gu, "")
          .toLocaleLowerCase(locale);
        expect(name, `${locale} ${key}`).toContain(
          visible.toLocaleLowerCase(locale),
        );
      }
    }
  });

  it("prints a measured figure as its value and its sample, with no word between", () => {
    for (const locale of LOCALES) {
      expect(getOperatorCatalogCopy(locale).health.measured, locale).toBe(
        "{value} · {sample}",
      );
    }
  });
});

describe("a reason code in words (OVE-506, OG-UX-039)", () => {
  const uk = getOperatorCatalogCopy("uk");
  const ukScheme = (scheme: string) =>
    catalogIdentifierSchemeName(scheme, "uk");

  it("names a known rule and keeps its code", () => {
    expect(describeCurationReason(uk, "denomination_equal", ukScheme)).toEqual({
      label: "Та сама назва сорту чи породи",
      code: "denomination_equal",
    });
  });

  it("names the scheme a shared identifier is shared in", () => {
    const schemeName = vi.fn(ukScheme);

    expect(
      describeCurationReason(uk, "shared_identifier:gbif", schemeName),
    ).toEqual({
      label: "Той самий ідентифікатор GBIF",
      code: "shared_identifier:gbif",
    });
    expect(schemeName).toHaveBeenCalledWith("gbif");

    // Without a scheme it is the rule's own name.
    expect(describeCurationReason(uk, "shared_identifier", ukScheme)).toEqual({
      label: "Спільний зовнішній ідентифікатор",
      code: "shared_identifier",
    });
  });

  it("names the scheme of an identifier another card already holds", () => {
    const schemeName = vi.fn(ukScheme);

    expect(
      describeCurationReason(uk, "wikidata_identifier_conflict", schemeName),
    ).toEqual({
      label: "Ідентифікатор Wikidata уже має інша картка",
      code: "wikidata_identifier_conflict",
    });
    expect(schemeName).toHaveBeenCalledWith("wikidata");
  });

  it("names a scored rule without its score, and keeps the score in the code", () => {
    const reason = describeCurationReason(
      uk,
      "fuzzy_same_genus:0.95",
      ukScheme,
    );

    expect(reason).toEqual({
      label: "Майже та сама назва в тому ж роді",
      code: "fuzzy_same_genus:0.95",
    });
    expect(reason.label).not.toContain("0.95");
  });

  it("falls back to a rule without a name, never to the code as the headline", () => {
    expect(describeCurationReason(uk, "brand_new_rule", ukScheme)).toEqual({
      label: uk.reasons.unknown,
      code: "brand_new_rule",
    });
    expect(uk.reasons.unknown).toBe("Правило без назви");
    expect(describeCurationReason(uk, "brand_new_rule:0.7", ukScheme)).toEqual({
      label: "Правило без назви",
      code: "brand_new_rule:0.7",
    });
  });

  it.each([
    [
      "bg",
      "Същият идентификатор от GBIF",
      "Почти същото име в същия род",
      "Правило без име",
    ],
    [
      "ru",
      "Тот же идентификатор GBIF",
      "Почти то же название в том же роде",
      "Правило без названия",
    ],
  ] as const)("says the same in %s", (locale, shared, fuzzy, unknown) => {
    const copy = getOperatorCatalogCopy(locale);
    const scheme = (value: string) =>
      catalogIdentifierSchemeName(value, locale);

    expect(
      describeCurationReason(copy, "shared_identifier:gbif", scheme).label,
    ).toBe(shared);
    expect(
      describeCurationReason(copy, "fuzzy_same_genus:0.95", scheme).label,
    ).toBe(fuzzy);
    expect(describeCurationReason(copy, "brand_new_rule", scheme).label).toBe(
      unknown,
    );
  });

  it.each([
    ["uk", "Об'єднання, запропоноване на картці"],
    ["bg", "Сливане, предложено от картата"],
    ["ru", "Объединение, предложенное на карточке"],
  ] as const)(
    "names a merge proposed from a card in %s, rather than as a rule without a name",
    (locale, label) => {
      const copy = getOperatorCatalogCopy(locale);
      const reason = describeCurationReason(copy, "merge_from_card", (value) =>
        catalogIdentifierSchemeName(value, locale),
      );

      expect(reason).toEqual({ label, code: "merge_from_card" });
      expect(reason.label).not.toBe(copy.reasons.unknown);
    },
  );
});

describe("a count in the reader's grammar (OVE-506)", () => {
  it.each([
    [1, "1 об'єкт"],
    [2, "2 об'єкти"],
    [5, "5 об'єктів"],
    [21, "21 об'єкт"],
  ])("uk: %i", (count, expected) => {
    expect(
      countOperatorCatalogUnit(
        "uk",
        count,
        getOperatorCatalogCopy("uk").units.objects,
      ),
    ).toBe(expected);
  });

  it.each([
    [1, "1 обект"],
    [2, "2 обекта"],
  ])("bg: %i", (count, expected) => {
    expect(
      countOperatorCatalogUnit(
        "bg",
        count,
        getOperatorCatalogCopy("bg").units.objects,
      ),
    ).toBe(expected);
  });

  it.each([
    [1, "1 объект"],
    [3, "3 объекта"],
    [5, "5 объектов"],
  ])("ru: %i", (count, expected) => {
    expect(
      countOperatorCatalogUnit(
        "ru",
        count,
        getOperatorCatalogCopy("ru").units.objects,
      ),
    ).toBe(expected);
  });

  it("groups the digits of a large count the way the language does", () => {
    expect(
      countOperatorCatalogUnit(
        "uk",
        13007,
        getOperatorCatalogCopy("uk").units.records,
      ),
    ).toBe("13 007 записів");
  });

  it("falls back to the general form where a language has no special one", () => {
    const forms: CountForms = { one: "one", other: "other" };
    expect(countOperatorCatalogUnit("uk", 2, forms)).toBe("2 other");
    expect(countOperatorCatalogUnit("ru", 5, forms)).toBe("5 other");
  });
});
