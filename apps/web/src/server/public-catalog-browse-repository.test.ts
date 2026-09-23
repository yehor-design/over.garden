import { describe, expect, it } from "vitest";

import { normalizeCatalogName } from "@/lib/catalog/normalize-name";
import { normalizedSearchPrefix } from "./public-catalog-browse-repository";

describe("the catalogue listing's search prefix", () => {
  it("is in the form every stored name is in", () => {
    // `OVE-496`: the listing lower-cased the query and nothing else, while
    // every stored name is `catalog_normalize_name`'s output. A typographic
    // apostrophe, ё or ґ typed one way then found nothing stored the other.
    for (const [typed, stored] of [
      ["М’ята", "м'ята"],
      ["мʼята", "м'ята"],
      ["Помидор жёлтый", "помидор желтый"],
      ["Ґрунт", "грунт"],
      ["Tomaté", "tomate"],
    ] as const) {
      expect(normalizedSearchPrefix(typed), typed).toBe(stored);
      expect(normalizedSearchPrefix(typed)).toBe(normalizeCatalogName(stored));
    }
  });

  it("cannot widen itself into a wildcard", () => {
    expect(normalizedSearchPrefix("to%ma_to")).toBe("tomato");
    expect(normalizedSearchPrefix("  %  ")).toBe("");
  });

  it("stays within the listing's bound", () => {
    expect(normalizedSearchPrefix("а".repeat(500))).toHaveLength(120);
  });
});
