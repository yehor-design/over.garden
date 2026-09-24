import { describe, expect, it } from "vitest";

import { getAtomicJournalCreateCopy } from "./atomic-journal-create-copy";

describe("atomic journal create copy", () => {
  it.each(["uk", "bg", "ru"] as const)(
    "describes one public Publish action without a draft or private-save promise in %s",
    (locale) => {
      const copy = Object.values(getAtomicJournalCreateCopy(locale)).join(" ");
      expect(copy).toMatch(/публ|публи/i);
      expect(copy).not.toMatch(/серверн.*черн|private record|приватн.*запис/i);
    },
  );

  it.each(["uk", "bg", "ru"] as const)(
    "names a photograph's remedy only for an entry that has one, in %s",
    (locale) => {
      // `OVE-478`: a text note that failed to publish was told to fix "the
      // marked photo" (heard with Orca).
      const copy = getAtomicJournalCreateCopy(locale);
      const photo = /фото|снимк/iu;
      expect(copy.failed).toMatch(photo);
      expect(copy.failedWithoutPhoto).not.toMatch(photo);
      // The same news first: the entry was not published.
      const first = (text: string) => text.slice(0, text.indexOf(".") + 1);
      expect(first(copy.failedWithoutPhoto)).toBe(first(copy.failed));
    },
  );
});
