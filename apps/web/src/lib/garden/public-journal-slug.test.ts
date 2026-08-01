import { describe, expect, it } from "vitest";

import {
  isValidPublicJournalSlug,
  normalizePublicJournalSlug,
} from "./public-journal-slug";

describe("public journal slug contract", () => {
  it("accepts the canonical decoded slug in Cyrillic", () => {
    expect(isValidPublicJournalSlug("избрана-корица")).toBe(true);
    expect(normalizePublicJournalSlug("избрана-корица")).toBe(
      "избрана-корица",
    );
  });

  it("decodes a route segment before applying the canonical slug policy", () => {
    expect(normalizePublicJournalSlug("%D0%B8%D0%B7%D0%B1%D1%80%D0%B0%D0%BD%D0%B0-%D0%BA%D0%BE%D1%80%D0%B8%D1%86%D0%B0")).toBe(
      "избрана-корица",
    );
  });

  it.each(["safe%2Fsegment", "%E0%A4%A", "safe%20slug"]) (
    "rejects an unsafe or malformed encoded segment: %s",
    (slug) => {
      expect(normalizePublicJournalSlug(slug)).toBeNull();
    },
  );
});
