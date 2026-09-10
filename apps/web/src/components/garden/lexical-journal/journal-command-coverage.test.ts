import { describe, expect, it } from "vitest";

import {
  JOURNAL_BLOCK_COMMANDS,
  JOURNAL_BLOCK_COMMAND_IDS,
} from "./journal-block-commands";
import { JOURNAL_BLOCK_INPUT_RULES } from "./journal-input-rules";
import { JOURNAL_SELECTION_FORMATS } from "./journal-selection-toolbar";
import {
  JOURNAL_SHORTCUTS,
  JOURNAL_SHORTCUT_COMMAND_IDS,
} from "./journal-shortcuts";
import { journalMarkRank } from "@/lib/garden/journal-document";

/**
 * The button row is gone (ADR-0028 D6). These are the debts that removing a
 * control surface owes back: nothing may be reachable by pointer alone, and
 * nothing the contract allows may be unreachable.
 */
describe("composer command coverage", () => {
  const CONTRACT_MARKS = [
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "code",
  ] as const;

  it("offers every mark the contract allows, and only those", () => {
    expect(
      [...JOURNAL_SELECTION_FORMATS.map((entry) => entry.format)].sort(),
    ).toEqual([...CONTRACT_MARKS].sort());
    // A link is a mark too, but it carries an href and has its own control.
    expect(journalMarkRank("link")).toBeGreaterThanOrEqual(0);
  });

  it("gives every mark a keyboard route", () => {
    // Lexical's core maps these three itself; the rest are ours.
    const core = new Set(["bold", "italic", "underline"]);
    for (const mark of CONTRACT_MARKS) {
      if (core.has(mark)) continue;
      const bound = JOURNAL_SHORTCUTS.some((shortcut) =>
        mark === "strikethrough"
          ? shortcut.key === "s" && shortcut.shift
          : shortcut.key === "e" && !shortcut.shift,
      );
      expect(bound, mark).toBe(true);
    }
  });

  it("keeps every block reachable without a pointer", () => {
    // The slash menu is the universal keyboard route, and it lists every
    // command in the registry — including the callout, which like Notion's has
    // no markdown trigger and no chord of its own.
    expect(JOURNAL_BLOCK_COMMANDS.map((command) => command.id)).toEqual([
      ...JOURNAL_BLOCK_COMMAND_IDS,
    ]);
    for (const rule of JOURNAL_BLOCK_INPUT_RULES) {
      expect(JOURNAL_BLOCK_COMMAND_IDS, rule.trigger).toContain(rule.commandId);
    }
    for (const id of JOURNAL_SHORTCUT_COMMAND_IDS) {
      expect(JOURNAL_BLOCK_COMMAND_IDS).toContain(id);
    }
    // A photo is the one block a keystroke cannot finish: it needs a file.
    expect(
      JOURNAL_BLOCK_INPUT_RULES.some((rule) => rule.commandId === "image"),
    ).toBe(false);
  });
});
