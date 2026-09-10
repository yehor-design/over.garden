"use client";

import {
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
} from "lexical";

import {
  $turnJournalBlockInto,
  type JournalBlockCommandId,
} from "./journal-block-commands";

/**
 * The shortcuts Lexical's core does not already map. Core handles Cmd/Ctrl+B,
 * I and U; these are the rest of what the retired button row could do, so no
 * command is reachable by pointer alone (ADR-0028 D6).
 */
export interface JournalShortcut {
  /** Lower-case `event.key`. */
  key: string;
  shift: boolean;
  run: (editor: LexicalEditor) => void;
}

const HEADING_BY_DIGIT: Record<string, JournalBlockCommandId> = {
  "1": "heading1",
  "2": "heading2",
  "3": "heading3",
  "0": "paragraph",
};

/** The blocks a shortcut alone can reach, for the coverage test. */
export const JOURNAL_SHORTCUT_COMMAND_IDS: readonly JournalBlockCommandId[] =
  Object.values(HEADING_BY_DIGIT);

export const JOURNAL_SHORTCUTS: readonly JournalShortcut[] = [
  {
    key: "s",
    shift: true,
    run: (editor) =>
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough"),
  },
  {
    key: "e",
    shift: false,
    run: (editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code"),
  },
  ...Object.entries(HEADING_BY_DIGIT).map(([digit, commandId]) => ({
    key: digit,
    shift: true,
    run: (editor: LexicalEditor) => {
      editor.update(
        () => {
          $turnJournalBlockInto(commandId);
        },
        { discrete: true },
      );
    },
  })),
];

export function registerJournalShortcuts(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      if (!event.metaKey && !event.ctrlKey) return false;
      const shortcut = JOURNAL_SHORTCUTS.find(
        (candidate) =>
          candidate.key === event.key.toLowerCase() &&
          candidate.shift === event.shiftKey,
      );
      if (!shortcut) return false;
      event.preventDefault();
      shortcut.run(editor);
      return true;
    },
    COMMAND_PRIORITY_HIGH,
  );
}
