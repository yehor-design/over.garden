import { describe, expect, it } from "vitest";

import {
  JOURNAL_BLOCK_COMMANDS,
  JOURNAL_BLOCK_COMMAND_IDS,
} from "@/components/garden/lexical-journal/journal-block-commands";
import { JOURNAL_SHORTCUTS } from "@/components/garden/lexical-journal/journal-shortcuts";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";
import { PUBLIC_LOCALES } from "@/lib/public-localization";

describe("structured journal composer copy", () => {
  it("names every block command in every locale", () => {
    for (const locale of PUBLIC_LOCALES) {
      const labels = getStructuredJournalComposerLabels(locale);
      for (const id of JOURNAL_BLOCK_COMMAND_IDS) {
        const label = labels.blocks.commands[id];
        expect(label, `${locale}/${id}`).toBeTruthy();
        expect(label.trim(), `${locale}/${id}`).toBe(label);
      }
      // Two commands sharing a name would make the slash menu ambiguous.
      const names = JOURNAL_BLOCK_COMMAND_IDS.map(
        (id) => labels.blocks.commands[id],
      );
      expect(new Set(names).size, locale).toBe(names.length);
      for (const key of [
        "add",
        "menu",
        "turnInto",
        "duplicate",
        "duplicatedAnnouncement",
        "noResults",
        "placeholder",
        "placeholderFirst",
      ] as const) {
        expect(labels.blocks[key], `${locale}/${key}`).toBeTruthy();
      }
    }
  });

  it("gives every command a latin alias, so `/h2` finds it in any locale", () => {
    for (const command of JOURNAL_BLOCK_COMMANDS) {
      expect(command.aliases.length, command.id).toBeGreaterThan(0);
      for (const alias of command.aliases) {
        expect(alias, command.id).toMatch(/^[a-z0-9]+$/);
      }
    }
  });

  it("binds each shortcut once", () => {
    const keys = JOURNAL_SHORTCUTS.map(
      (shortcut) => `${shortcut.shift ? "shift+" : ""}${shortcut.key}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
