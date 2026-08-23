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
});
