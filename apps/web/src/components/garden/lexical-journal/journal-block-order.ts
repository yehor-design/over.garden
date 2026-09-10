/**
 * The block-order commands: move, remove and duplicate one top-level block.
 * The gutter's UI lives in `journal-block-gutter.tsx`; this module is what the
 * editor extension registers and what the composer handle calls.
 */
"use client";

import {
  $addUpdateTag,
  $createParagraphNode,
  $createNodeSelection,
  $getRoot,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  HISTORY_PUSH_TAG,
  type LexicalCommand,
  type LexicalEditor,
} from "lexical";
import {
  $getJournalBlockId,
  $setJournalBlockId,
  createJournalBlockId,
} from "./journal-lexical-nodes";
import {
  $journalBlockToLexicalNode,
  $lexicalNodeToJournalBlock,
} from "@/lib/garden/journal-document-lexical-adapter";
export interface MoveJournalBlockPayload {
  blockId: string;
  toIndex: number;
}

export const MOVE_JOURNAL_BLOCK_COMMAND: LexicalCommand<MoveJournalBlockPayload> =
  createCommand("OVERGARDEN_MOVE_JOURNAL_BLOCK_COMMAND");

export const REMOVE_JOURNAL_BLOCK_COMMAND: LexicalCommand<{
  blockId: string;
}> = createCommand("OVERGARDEN_REMOVE_JOURNAL_BLOCK_COMMAND");

export const DUPLICATE_JOURNAL_BLOCK_COMMAND: LexicalCommand<{
  blockId: string;
}> = createCommand("OVERGARDEN_DUPLICATE_JOURNAL_BLOCK_COMMAND");

export function registerJournalNodeReorder(editor: LexicalEditor): () => void {
  const unregisterMove = editor.registerCommand(
    MOVE_JOURNAL_BLOCK_COMMAND,
    ({ blockId, toIndex }) => {
      const root = $getRoot();
      const children = root.getChildren();
      const source = children.find(
        (candidate) => $getJournalBlockId(candidate) === blockId,
      );
      if (!source) return false;

      const fromIndex = children.indexOf(source);
      const boundedToIndex = Math.max(
        0,
        Math.min(Math.trunc(toIndex), children.length - 1),
      );
      if (fromIndex === boundedToIndex) return false;

      const withoutSource = children.filter(
        (candidate) => candidate !== source,
      );
      if (boundedToIndex >= withoutSource.length) {
        withoutSource.at(-1)?.insertAfter(source);
      } else {
        withoutSource[boundedToIndex]?.insertBefore(source);
      }

      const selection = $createNodeSelection();
      selection.add(source.getKey());
      $setSelection(selection);
      $addUpdateTag(HISTORY_PUSH_TAG);
      return true;
    },
    COMMAND_PRIORITY_EDITOR,
  );
  const unregisterRemove = editor.registerCommand(
    REMOVE_JOURNAL_BLOCK_COMMAND,
    ({ blockId }) => {
      const root = $getRoot();
      const source = root
        .getChildren()
        .find((candidate) => $getJournalBlockId(candidate) === blockId);
      // Image removal must retain the media-aware cleanup callback owned by its
      // decorator, so the generic semantic-block command cannot remove it.
      if (!source || source.getType() === "overgarden-image") return false;

      const focusTarget =
        source.getNextSibling() ?? source.getPreviousSibling();
      source.remove();
      if (root.isEmpty()) {
        const paragraph = $setJournalBlockId(
          $createParagraphNode(),
          createJournalBlockId(),
        );
        root.append(paragraph);
        paragraph.selectStart();
      } else if (focusTarget) {
        const selection = $createNodeSelection();
        selection.add(focusTarget.getKey());
        $setSelection(selection);
      }
      $addUpdateTag(HISTORY_PUSH_TAG);
      return true;
    },
    COMMAND_PRIORITY_EDITOR,
  );
  const unregisterDuplicate = editor.registerCommand(
    DUPLICATE_JOURNAL_BLOCK_COMMAND,
    ({ blockId }) => {
      const source = $getRoot()
        .getChildren()
        .find((candidate) => $getJournalBlockId(candidate) === blockId);
      // A photo may appear once in a document, so an image block has nothing
      // to duplicate into.
      if (!source || source.getType() === "overgarden-image") return false;

      let copy;
      try {
        const block = $lexicalNodeToJournalBlock(source);
        copy = $journalBlockToLexicalNode({
          ...block,
          id: createJournalBlockId(),
        });
      } catch {
        // A block the contract cannot express cannot be copied either.
        return false;
      }
      source.insertAfter(copy);
      $addUpdateTag(HISTORY_PUSH_TAG);
      return true;
    },
    COMMAND_PRIORITY_EDITOR,
  );
  return () => {
    unregisterDuplicate();
    unregisterRemove();
    unregisterMove();
  };
}

export function duplicateJournalBlockById(
  editor: LexicalEditor,
  blockId: string,
): "duplicated" | "noop" {
  let duplicated = false;
  editor.update(
    () => {
      duplicated = editor.dispatchCommand(DUPLICATE_JOURNAL_BLOCK_COMMAND, {
        blockId,
      });
    },
    { discrete: true, tag: HISTORY_PUSH_TAG },
  );
  return duplicated ? "duplicated" : "noop";
}

export function moveJournalBlockToIndex(
  editor: LexicalEditor,
  payload: MoveJournalBlockPayload,
): "moved" | "noop" {
  let moved = false;
  editor.update(
    () => {
      moved = editor.dispatchCommand(MOVE_JOURNAL_BLOCK_COMMAND, payload);
    },
    { discrete: true, tag: HISTORY_PUSH_TAG },
  );
  return moved ? "moved" : "noop";
}

export function moveJournalBlockById(
  editor: LexicalEditor,
  blockId: string,
  delta: -1 | 1,
): "moved" | "noop" {
  let index = -1;
  let count = 0;
  editor.getEditorState().read(() => {
    const children = $getRoot().getChildren();
    count = children.length;
    index = children.findIndex(
      (candidate) => $getJournalBlockId(candidate) === blockId,
    );
  });
  if (index < 0) return "noop";
  const toIndex = index + delta;
  if (toIndex < 0 || toIndex >= count) return "noop";
  return moveJournalBlockToIndex(editor, {
    blockId,
    toIndex,
  });
}

export function removeJournalBlockById(
  editor: LexicalEditor,
  blockId: string,
): "removed" | "noop" {
  let removed = false;
  editor.update(
    () => {
      removed = editor.dispatchCommand(REMOVE_JOURNAL_BLOCK_COMMAND, {
        blockId,
      });
    },
    { discrete: true, tag: HISTORY_PUSH_TAG },
  );
  return removed ? "removed" : "noop";
}
