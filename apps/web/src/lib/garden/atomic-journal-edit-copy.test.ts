import { describe, expect, it } from "vitest";

import { getAtomicJournalEditCopy } from "./atomic-journal-edit-copy";

describe("atomic journal edit copy", () => {
  it.each(["uk", "bg", "ru"] as const)(
    "provides complete gardener-facing %s copy without provider vocabulary",
    (locale) => {
      const copy = getAtomicJournalEditCopy(locale);
      expect(
        Object.values(copy).every((value) => value.trim().length > 0),
      ).toBe(true);
      expect(Object.values(copy).join(" ")).not.toMatch(
        /R2|staging|receipt|generation|quarantine|worker/i,
      );
    },
  );
});
