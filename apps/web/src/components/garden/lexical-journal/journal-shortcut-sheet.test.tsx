import { describe, expect, it } from "vitest";

import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";
import { PUBLIC_LOCALES } from "@/lib/public-localization";

import {
  JOURNAL_BLOCK_INPUT_RULES,
  JOURNAL_INLINE_INPUT_RULES,
} from "./journal-input-rules";
import { JOURNAL_SHORTCUTS } from "./journal-shortcuts";
import {
  journalBlockRuleRows,
  journalInlineRuleRows,
  journalModifierLabel,
  journalShortcutRows,
} from "./journal-shortcut-sheet";

const labels = getStructuredJournalComposerLabels("uk");

describe("the composer's shortcut sheet", () => {
  it("lists every block input rule, grouped by what it produces", () => {
    const rows = journalBlockRuleRows(labels);
    const commands = new Set(
      JOURNAL_BLOCK_INPUT_RULES.map((rule) => rule.commandId),
    );
    expect(rows).toHaveLength(commands.size);
    // `- `, `* ` and `+ ` are one rule with three spellings, on one row.
    const bullet = rows.find(
      (row) => row.label === labels.blocks.commands.bulletList,
    );
    expect(bullet?.keys).toBe("- · * · +");
    // Not one row names a trigger the editor does not implement.
    const triggers = new Set(
      JOURNAL_BLOCK_INPUT_RULES.map((rule) => rule.trigger.trimEnd()),
    );
    for (const row of rows) {
      for (const spelling of row.keys.split(" · ")) {
        expect(triggers.has(spelling), spelling).toBe(true);
      }
    }
  });

  it("lists every inline rule with the delimiter around it", () => {
    const rows = journalInlineRuleRows(labels);
    expect(rows).toHaveLength(JOURNAL_INLINE_INPUT_RULES.length);
    expect(rows.map((row) => row.keys)).toContain("**…**");
    expect(rows.map((row) => row.label)).toContain(labels.tools.bold);
  });

  it("lists every registered shortcut, and the three pointer-free paths", () => {
    const rows = journalShortcutRows(labels, "Ctrl");
    for (const shortcut of JOURNAL_SHORTCUTS) {
      const expected = `Ctrl${shortcut.shift ? " + Shift" : ""} + ${shortcut.key.toUpperCase()}`;
      expect(
        rows.some((row) => row.keys === expected),
        expected,
      ).toBe(true);
    }
    expect(rows.map((row) => row.keys)).toContain("/");
    expect(rows.map((row) => row.keys)).toContain("Ctrl + Shift + M");
    expect(rows.map((row) => row.keys)).toContain("↑ ↓");
  });

  it("spells the modifier the way this reader's keyboard does", () => {
    expect(journalModifierLabel("MacIntel")).toBe("⌘");
    expect(journalModifierLabel("iPhone")).toBe("⌘");
    expect(journalModifierLabel("Win32")).toBe("Ctrl");
    expect(journalModifierLabel("")).toBe("Ctrl");
  });

  it("names every row in every locale", () => {
    for (const locale of PUBLIC_LOCALES) {
      const localized = getStructuredJournalComposerLabels(locale);
      const rows = [
        ...journalBlockRuleRows(localized),
        ...journalInlineRuleRows(localized),
        ...journalShortcutRows(localized, "Ctrl"),
      ];
      for (const row of rows) {
        expect(row.label.length, `${locale}: ${row.keys}`).toBeGreaterThan(0);
        expect(row.keys.length, `${locale}: ${row.label}`).toBeGreaterThan(0);
      }
    }
  });
});
