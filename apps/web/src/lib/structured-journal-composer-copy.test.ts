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

  it("names the tool row, every photograph and the readiness line in every locale", () => {
    for (const locale of PUBLIC_LOCALES) {
      const labels = getStructuredJournalComposerLabels(locale);
      for (const value of [
        labels.composerTools.label,
        labels.composerTools.addPhoto,
        labels.composerTools.blocks,
        labels.imageMoveUp,
        labels.imageMoveDown,
        labels.imageReady,
      ]) {
        expect(value, locale).toBeTruthy();
      }
      expect(labels.imageName, locale).toContain("{index}");
      expect(labels.imageActionName, locale).toContain("{action}");
      expect(labels.imageActionName, locale).toContain("{photo}");
      expect(labels.imageLimit, locale).toContain("{max}");
      expect(labels.readiness.preparing, locale).toContain("{ready}");
      expect(labels.readiness.preparing, locale).toContain("{total}");
      expect(labels.readiness.ready, locale).toContain("{total}");
      expect(labels.readiness.failed, locale).toContain("{photos}");
      // A failed editor keeps the text on the screen; there is no draft to
      // have saved (ADR-0022 D3), so the copy may not claim one.
      expect(labels.failureBody, locale).not.toMatch(
        /чернетк|чернов|збережено|запазен|сохранён/iu,
      );
      // Text first: the first line does not open with the slash command.
      expect(labels.blocks.placeholderFirst, locale).not.toContain("/");
    }
  });
});
