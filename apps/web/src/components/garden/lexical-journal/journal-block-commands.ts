"use client";

import { $createHorizontalRuleNode } from "@lexical/extension";
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListType,
} from "@lexical/list";
import { $createHeadingNode, $isHeadingNode } from "@lexical/rich-text";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
} from "lexical";

import {
  $createOverGardenCalloutNode,
  $createOverGardenCodeNode,
  $createOverGardenQuoteBodyNode,
  $createOverGardenQuoteNode,
  $getJournalBlockId,
  $isOverGardenCalloutNode,
  $isOverGardenCodeNode,
  $isOverGardenQuoteAttributionNode,
  $isOverGardenQuoteNode,
  $setJournalBlockId,
  createJournalBlockId,
} from "./journal-lexical-nodes";
import {
  DEFAULT_JOURNAL_CALLOUT_ICON,
  DEFAULT_JOURNAL_CODE_LANGUAGE,
} from "@/lib/garden/journal-document";

/**
 * One registry of the blocks a gardener can reach. The gutter's add button, the
 * block menu's "turn into" and the slash menu all read this list, so the three
 * of them cannot drift apart (ADR-0028 D3).
 */
export const JOURNAL_BLOCK_COMMAND_IDS = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulletList",
  "numberList",
  "todoList",
  "quote",
  "callout",
  "code",
  "delimiter",
  "image",
] as const;

export type JournalBlockCommandId = (typeof JOURNAL_BLOCK_COMMAND_IDS)[number];

/** The commands that replace the block the caret is in. */
export const JOURNAL_TURN_INTO_COMMAND_IDS = JOURNAL_BLOCK_COMMAND_IDS.filter(
  (id): id is Exclude<JournalBlockCommandId, "delimiter" | "image"> =>
    id !== "delimiter" && id !== "image",
);

export interface JournalBlockCommandDescriptor {
  id: JournalBlockCommandId;
  group: "text" | "list" | "block" | "media";
  /** Latin aliases every locale can type, beside the localized label. */
  aliases: readonly string[];
}

export const JOURNAL_BLOCK_COMMANDS: readonly JournalBlockCommandDescriptor[] =
  [
    { id: "paragraph", group: "text", aliases: ["text", "p", "plain"] },
    { id: "heading1", group: "text", aliases: ["h1", "title", "heading"] },
    { id: "heading2", group: "text", aliases: ["h2", "subtitle", "heading"] },
    { id: "heading3", group: "text", aliases: ["h3", "heading"] },
    { id: "bulletList", group: "list", aliases: ["ul", "bullet", "list"] },
    { id: "numberList", group: "list", aliases: ["ol", "number", "list"] },
    {
      id: "todoList",
      group: "list",
      aliases: ["todo", "task", "check", "list"],
    },
    { id: "quote", group: "block", aliases: ["quote", "cite"] },
    { id: "callout", group: "block", aliases: ["callout", "note", "info"] },
    { id: "code", group: "block", aliases: ["code", "pre"] },
    { id: "delimiter", group: "block", aliases: ["divider", "hr", "rule"] },
    { id: "image", group: "media", aliases: ["image", "photo", "picture"] },
  ];

const LIST_TYPE_BY_COMMAND: Partial<Record<JournalBlockCommandId, ListType>> = {
  bulletList: "bullet",
  numberList: "number",
  todoList: "check",
};

const HEADING_TAG_BY_COMMAND: Partial<
  Record<JournalBlockCommandId, "h1" | "h2" | "h3">
> = {
  heading1: "h1",
  heading2: "h2",
  heading3: "h3",
};

/**
 * The command id matching the block the caret sits in, or null when the
 * selection is not in a top-level block this registry owns.
 */
export function $activeJournalBlockCommandId(): JournalBlockCommandId | null {
  const top = $selectedJournalTopLevelBlock();
  return top ? $journalBlockCommandIdOf(top) : null;
}

export function $journalBlockCommandIdOf(
  block: ElementNode,
): JournalBlockCommandId | null {
  if ($isHeadingNode(block)) {
    const tag = block.getTag();
    if (tag === "h1") return "heading1";
    if (tag === "h2") return "heading2";
    if (tag === "h3") return "heading3";
    return null;
  }
  if ($isListNode(block)) {
    const listType = block.getListType();
    if (listType === "bullet") return "bulletList";
    if (listType === "number") return "numberList";
    if (listType === "check") return "todoList";
    return null;
  }
  if ($isOverGardenQuoteNode(block)) return "quote";
  if ($isOverGardenCalloutNode(block)) return "callout";
  if ($isOverGardenCodeNode(block)) return "code";
  if (block.getType() === "paragraph") return "paragraph";
  return null;
}

export function $selectedJournalTopLevelBlock(): ElementNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  return selection.anchor.getNode().getTopLevelElement();
}

/**
 * Replaces the block the caret is in with the requested one. Nothing is
 * dropped on the way: a list becomes one block per item, a quote keeps its
 * attribution as a further run, and a code block becomes one block per line.
 */
export function $turnJournalBlockInto(
  commandId: JournalBlockCommandId,
  block: ElementNode | null = $selectedJournalTopLevelBlock(),
): boolean {
  if (!block || commandId === "delimiter" || commandId === "image") {
    return false;
  }
  // Turning a block into what it already is changes nothing and must not push
  // an undo step.
  if ($journalBlockCommandIdOf(block) === commandId) return false;

  const runs = $journalBlockRuns(block);
  const blockId = $getJournalBlockId(block) || createJournalBlockId();
  const replacements = $buildJournalBlocks(commandId, runs, blockId);
  if (replacements.length === 0) return false;

  const [first, ...rest] = replacements;
  block.replace(first!);
  let previous: LexicalNode = first!;
  for (const node of rest) {
    previous.insertAfter(node);
    previous = node;
  }
  $selectJournalBlockEnd(first!);
  return true;
}

/**
 * A divider replaces the block it was asked for and leaves the caret in a
 * fresh paragraph under it — the way Notion behaves, and the reason this does
 * not go through `INSERT_HORIZONTAL_RULE_COMMAND`, which would leave the empty
 * block standing above the rule.
 */
export function $replaceJournalBlockWithDelimiter(
  block: ElementNode | null = $selectedJournalTopLevelBlock(),
): boolean {
  if (!block) return false;
  const rule = $setJournalBlockId(
    $createHorizontalRuleNode(),
    $getJournalBlockId(block) || createJournalBlockId(),
  );
  const paragraph = $setJournalBlockId(
    $createParagraphNode(),
    createJournalBlockId(),
  );
  block.replace(rule);
  rule.insertAfter(paragraph);
  paragraph.selectStart();
  return true;
}

/**
 * The inline runs a block carries, in reading order. One run becomes one block
 * when the block is turned into something else.
 */
function $journalBlockRuns(block: ElementNode): LexicalNode[][] {
  if ($isOverGardenCodeNode(block)) {
    // Code is the one block whose runs are its lines: Notion splits it the
    // same way, and a soft break has no meaning inside plain text.
    const runs: LexicalNode[][] = [[]];
    for (const child of block.getChildren()) {
      if ($isLineBreakNode(child)) runs.push([]);
      else runs.at(-1)!.push(child);
    }
    return runs;
  }
  if ($isOverGardenQuoteNode(block)) {
    return block
      .getChildren()
      .filter($isElementNode)
      .map((part) => part.getChildren())
      .filter((run, index) => index === 0 || run.length > 0);
  }
  if ($isListNode(block)) {
    const runs: LexicalNode[][] = [];
    $collectJournalListRuns(block, runs);
    return runs.length > 0 ? runs : [[]];
  }
  return [block.getChildren()];
}

function $collectJournalListRuns(
  list: ElementNode,
  runs: LexicalNode[][],
): void {
  for (const item of list.getChildren()) {
    if (!$isListItemNode(item)) continue;
    const inline = item.getChildren().filter((child) => !$isListNode(child));
    if (inline.length > 0) runs.push(inline);
    for (const nested of item.getChildren()) {
      if ($isListNode(nested)) $collectJournalListRuns(nested, runs);
    }
  }
}

function $buildJournalBlocks(
  commandId: JournalBlockCommandId,
  runs: LexicalNode[][],
  firstBlockId: string,
): ElementNode[] {
  const listType = LIST_TYPE_BY_COMMAND[commandId];
  if (listType) {
    const list = $setJournalBlockId($createListNode(listType), firstBlockId);
    for (const run of runs) {
      const item =
        listType === "check"
          ? $createListItemNode(false)
          : $createListItemNode();
      item.append(...run);
      list.append(item);
    }
    if (list.getChildrenSize() === 0) list.append($createListItemNode());
    return [list];
  }

  if (commandId === "quote") {
    const quote = $createOverGardenQuoteNode(firstBlockId);
    const body = $createOverGardenQuoteBodyNode();
    runs.forEach((run, index) => {
      if (index > 0) body.append($createLineBreakNode());
      body.append(...run);
    });
    quote.append(body);
    return [quote];
  }

  if (commandId === "code") {
    const code = $createOverGardenCodeNode(
      firstBlockId,
      DEFAULT_JOURNAL_CODE_LANGUAGE,
    );
    runs.forEach((run, index) => {
      if (index > 0) code.append($createLineBreakNode());
      // A code block holds plain text: the run's characters survive, its marks
      // do not, which is what the code transform would enforce anyway.
      const text = run.map((node) => node.getTextContent()).join("");
      if (text) code.append($createTextNode(text));
    });
    return [code];
  }

  const headingTag = HEADING_TAG_BY_COMMAND[commandId];
  return runs.map((run, index) => {
    const id = index === 0 ? firstBlockId : createJournalBlockId();
    const node = headingTag
      ? $createHeadingNode(headingTag)
      : commandId === "callout"
        ? $createOverGardenCalloutNode(id, DEFAULT_JOURNAL_CALLOUT_ICON)
        : $createParagraphNode();
    if (!$isOverGardenCalloutNode(node)) $setJournalBlockId(node, id);
    node.append(...run);
    return node;
  });
}

function $selectJournalBlockEnd(block: ElementNode): void {
  if ($isOverGardenQuoteNode(block)) {
    const body = block.getFirstChild();
    if ($isElementNode(body) && !$isOverGardenQuoteAttributionNode(body)) {
      body.selectEnd();
      return;
    }
  }
  if ($isListNode(block)) {
    const item = block.getChildren().find($isListItemNode);
    if (item) {
      item.selectEnd();
      return;
    }
  }
  block.selectEnd();
}
