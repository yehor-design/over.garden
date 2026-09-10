"use client";

import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type TextFormatType,
  type TextNode,
} from "lexical";

import {
  $journalBlockCommandIdOf,
  $replaceJournalBlockWithDelimiter,
  $selectedJournalTopLevelBlock,
  $turnJournalBlockInto,
  type JournalBlockCommandId,
} from "./journal-block-commands";

/**
 * Our own bounded set of input rules. ADR-0015 forbids `@lexical/markdown` and
 * mdast, and ADR-0028 D5 keeps that: these are typing conveniences over the
 * node tree, not a markdown parser. The document is never parsed from or
 * serialized to markdown, and one undo restores the characters that were typed.
 */
export const JOURNAL_INPUT_RULES_TAG = "overgarden-journal-input-rule";

interface BlockRule {
  /** The exact text between the block's start and the caret. */
  trigger: string;
  commandId: JournalBlockCommandId;
  /** A to-do rule may pre-check the item it creates. */
  checked?: boolean;
}

export const JOURNAL_BLOCK_INPUT_RULES: readonly BlockRule[] = [
  { trigger: "# ", commandId: "heading1" },
  { trigger: "## ", commandId: "heading2" },
  { trigger: "### ", commandId: "heading3" },
  { trigger: "- ", commandId: "bulletList" },
  { trigger: "* ", commandId: "bulletList" },
  { trigger: "+ ", commandId: "bulletList" },
  { trigger: "1. ", commandId: "numberList" },
  { trigger: "1) ", commandId: "numberList" },
  { trigger: "[] ", commandId: "todoList" },
  { trigger: "[ ] ", commandId: "todoList" },
  { trigger: "[x] ", commandId: "todoList", checked: true },
  { trigger: "> ", commandId: "quote" },
  { trigger: "``` ", commandId: "code" },
  { trigger: "--- ", commandId: "delimiter" },
];

interface InlineRule {
  delimiter: string;
  format: TextFormatType;
}

/** Longest delimiter first, so `**` is never read as two `*`. */
export const JOURNAL_INLINE_INPUT_RULES: readonly InlineRule[] = [
  { delimiter: "**", format: "bold" },
  { delimiter: "~~", format: "strikethrough" },
  { delimiter: "*", format: "italic" },
  { delimiter: "`", format: "code" },
];

export function registerJournalInputRules(editor: LexicalEditor): () => void {
  return editor.registerUpdateListener(({ tags, dirtyLeaves }) => {
    if (tags.has(JOURNAL_INPUT_RULES_TAG) || dirtyLeaves.size === 0) return;
    editor.update(
      () => {
        // The tag makes the rewrite its own history entry, so one undo puts
        // the typed characters back exactly as they were.
        if ($runJournalInputRules()) $addUpdateTag(HISTORY_PUSH_TAG);
      },
      { discrete: true, tag: JOURNAL_INPUT_RULES_TAG },
    );
  });
}

export function $runJournalInputRules(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const node = selection.anchor.getNode();
  if (!$isTextNode(node)) return false;
  const block = $selectedJournalTopLevelBlock();
  if (!block) return false;
  // A code block takes its text literally; nothing inside one is a trigger.
  if ($journalBlockCommandIdOf(block) === "code") return false;

  const offset = selection.anchor.offset;
  const before = node.getTextContent().slice(0, offset);

  if (node.getPreviousSibling() === null && block.getFirstChild() === node) {
    const rule = JOURNAL_BLOCK_INPUT_RULES.find(
      (candidate) => before === candidate.trigger,
    );
    if (rule) return $applyBlockRule(rule, node, offset);
  }

  return $applyInlineRule(node, before, offset);
}

function $applyBlockRule(
  rule: BlockRule,
  node: TextNode,
  offset: number,
): boolean {
  node.spliceText(0, offset, "", true);
  if (rule.commandId === "delimiter") {
    return $replaceJournalBlockWithDelimiter();
  }
  if (!$turnJournalBlockInto(rule.commandId)) return false;
  if (rule.checked) $checkFirstTodoItem();
  return true;
}

function $checkFirstTodoItem(): void {
  const block = $selectedJournalTopLevelBlock();
  if (!block) return;
  const item = block.getFirstChild();
  if (item && "setChecked" in item) {
    (item as { setChecked(checked: boolean): unknown }).setChecked(true);
  }
}

function $applyInlineRule(
  node: TextNode,
  before: string,
  offset: number,
): boolean {
  for (const rule of JOURNAL_INLINE_INPUT_RULES) {
    const { delimiter } = rule;
    if (!before.endsWith(delimiter)) continue;
    const closeStart = offset - delimiter.length;
    const openIndex = before.lastIndexOf(delimiter, closeStart - 1);
    if (openIndex < 0) continue;
    // A delimiter that is part of a longer run belongs to the longer rule.
    // Without this, the first `*` of a closing `**` would be read as the
    // italic rule closing against the second `*` of the opening pair.
    if (openIndex > 0 && before[openIndex - 1] === delimiter[0]) continue;
    const inner = before.slice(openIndex + delimiter.length, closeStart);
    if (
      inner.length === 0 ||
      inner.includes(delimiter) ||
      inner !== inner.trim()
    ) {
      continue;
    }

    node.spliceText(closeStart, delimiter.length, "");
    node.spliceText(openIndex, delimiter.length, "");
    const parts = node.splitText(openIndex, openIndex + inner.length);
    const innerNode = openIndex === 0 ? parts[0] : parts[1];
    if (!innerNode) return false;
    if (!innerNode.hasFormat(rule.format)) innerNode.toggleFormat(rule.format);
    innerNode.select(inner.length, inner.length);
    // The caret inherits the run's format; flip it off so the next character
    // is plain, the way every editor with these shortcuts behaves.
    const next = $getSelection();
    if ($isRangeSelection(next) && next.hasFormat(rule.format)) {
      next.toggleFormat(rule.format);
    }
    return true;
  }
  return false;
}
