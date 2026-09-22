import { describe, expect, it } from "vitest";

import { getEntryActionsCopy, withEntryTitle } from "@/lib/entry-actions-copy";

/**
 * OVE-353 / AC-03, carried into the entry's own menu by `OVE-488`: the owner
 * can predict that delete is final before confirming it. Every market names
 * the entry, the seven-day technical window and irreversibility, and offers
 * no archive or restore wording.
 */
describe("the entry's menu and its deletion", () => {
  it("states the irreversible seven-day deletion contract in every locale", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const copy = getEntryActionsCopy(locale);
      expect(copy.deleteBody, locale).toContain("7");
      expect(copy.deleteTitle, locale).toContain("{title}");
      expect(copy.menu, locale).toContain("{title}");
      expect(copy.deleted, locale).toContain("{title}");
      expect(copy.delete.endsWith("…"), locale).toBe(true);
      expect(copy.deleteBody, locale).not.toMatch(
        /архів|архив|відновити|възстанов|восстановить/iu,
      );
    }
  });

  it("names the entry, and never an empty one", () => {
    const copy = getEntryActionsCopy("uk");
    expect(withEntryTitle(copy.deleteTitle, " Перші квіти ")).toBe(
      "Видалити «Перші квіти»?",
    );
    expect(withEntryTitle(copy.deleteTitle, "  ")).toBe("Видалити «—»?");
  });
});
