import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  formSlugFromDenomination,
  isCatalogSlug,
  resolveSlugCollision,
  romanizeBulgarian,
  romanizeUkrainian,
  speciesSlugFromScientificName,
  type SlugLanguage,
} from "./slugs";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../contracts/catalog/form-slug.fixture.json",
);

interface Fixture {
  version: string;
  cases: Array<{ denomination: string; language: SlugLanguage; slug: string }>;
}

describe("catalog slugs (ADR-0026 D8)", () => {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;

  it("holds at least fifty denominations", () => {
    expect(fixture.version).toBe("ove388.form-slug.v1");
    expect(fixture.cases.length).toBeGreaterThanOrEqual(50);
  });

  it.each(fixture.cases.map((entry) => [entry.denomination, entry.language, entry.slug] as const))(
    "romanizes %s (%s) as %s",
    (denomination, language, slug) => {
      expect(formSlugFromDenomination(denomination, language)).toBe(slug);
      expect(isCatalogSlug(slug)).toBe(true);
    },
  );

  it("keeps letter case while romanizing and applies the positional rules", () => {
    expect(romanizeUkrainian("Юрій Їжакевич")).toBe("Yurii Yizhakevych");
    expect(romanizeUkrainian("Знам'янка")).toBe("Znamianka");
    expect(romanizeUkrainian("Згурський")).toBe("Zghurskyi");
    expect(romanizeBulgarian("София")).toBe("Sofia");
    expect(romanizeBulgarian("Щастливец")).toBe("Shtastlivets");
  });

  it("builds a species slug from the scientific name without authorship", () => {
    expect(speciesSlugFromScientificName("Solanum lycopersicum")).toBe(
      "solanum-lycopersicum",
    );
    expect(speciesSlugFromScientificName("Fragaria × ananassa")).toBe(
      "fragaria-x-ananassa",
    );
    expect(speciesSlugFromScientificName("Apis mellifera")).toBe("apis-mellifera");
  });

  it("appends -2, -3 on a collision and never reuses a slug the history holds", () => {
    const taken = new Set(["de-barao", "de-barao-2"]);
    expect(resolveSlugCollision("de-barao", taken)).toBe("de-barao-3");
    expect(resolveSlugCollision("promin", taken)).toBe("promin");
    expect(() => resolveSlugCollision("Not A Slug", taken)).toThrow(/Not a catalog slug/u);
  });
});
