"use client";

import {
  AriaLiveRegionExtension,
  FocusManagerExtension,
  RovingTabIndexExtension,
} from "@lexical/a11y";
import {
  configExtension,
  defineExtension,
  HorizontalRuleExtension,
  HorizontalRuleNode,
  InitialStateExtension,
} from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { $toggleLink, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $getListDepth,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
  registerCheckList,
  registerList,
} from "@lexical/list";
import { HeadingNode, registerRichText } from "@lexical/rich-text";
import { $getNearestNodeOfType } from "@lexical/utils";
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  HISTORY_MERGE_TAG,
  INDENT_CONTENT_COMMAND,
  KEY_ENTER_COMMAND,
  mergeRegister,
  ParagraphNode,
  type EditorThemeClasses,
  type ElementNode,
  type LexicalNode,
  type RangeSelection,
} from "lexical";

import {
  $getJournalBlockId,
  $isOverGardenCodeNode,
  $setJournalBlockId,
  createJournalBlockId,
  JOURNAL_LIST_NODE_REPLACEMENT,
  OverGardenCalloutNode,
  OverGardenCodeNode,
  OverGardenImageNode,
  OverGardenListNode,
  OverGardenQuoteAttributionNode,
  OverGardenQuoteBodyNode,
  OverGardenQuoteNode,
} from "./journal-lexical-nodes";
import { registerJournalNodeReorder } from "./journal-node-reorder-plugin";
import {
  $hydrateJournalDocumentV1,
  JOURNAL_HYDRATION_TAG,
} from "@/lib/garden/journal-document-lexical-adapter";
import {
  normalizeJournalDocumentOrThrow,
  normalizeSafeHref,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";

export interface CreateJournalLexicalExtensionOptions {
  initialDocument: JournalDocumentV1;
  editable?: boolean;
  onError?: (error: Error) => void;
}

const JOURNAL_THEME: EditorThemeClasses = {
  callout:
    "journal-callout my-3 flex gap-3 rounded-md border border-border bg-muted/40 p-3",
  code: "my-3 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-sm leading-6 whitespace-pre-wrap",
  heading: {
    h1: "text-2xl font-semibold leading-8",
    h2: "text-xl font-semibold leading-7",
    h3: "text-lg font-semibold leading-7",
  },
  image: "my-3",
  link: "underline underline-offset-2",
  list: {
    checklist: "grid list-none gap-1 pl-0",
    listitem: "ml-6",
    listitemChecked: "journal-checklist-item",
    listitemUnchecked: "journal-checklist-item",
    nested: { listitem: "ml-5" },
    ol: "list-decimal space-y-1",
    ul: "list-disc space-y-1",
  },
  paragraph: "min-h-6 leading-7",
  quote: "border-l-2 border-border pl-4 italic",
  quoteAttribution: "mt-2 block text-sm not-italic text-muted-foreground",
  quoteBody: "leading-7",
  text: {
    bold: "font-semibold",
    code: "rounded bg-muted px-1 py-0.5 font-mono",
    italic: "italic",
    strikethrough: "line-through",
    underline: "underline underline-offset-2",
  },
};

export function createJournalLexicalExtension({
  initialDocument,
  editable = true,
  onError,
}: CreateJournalLexicalExtensionOptions) {
  const normalized = normalizeJournalDocumentOrThrow(initialDocument);
  return defineExtension({
    name: "overgarden/journal",
    namespace: "OverGardenJournal",
    editable,
    theme: JOURNAL_THEME,
    nodes: () => [
      HeadingNode,
      OverGardenListNode,
      JOURNAL_LIST_NODE_REPLACEMENT,
      ListItemNode,
      LinkNode,
      OverGardenImageNode,
      OverGardenQuoteNode,
      OverGardenQuoteBodyNode,
      OverGardenQuoteAttributionNode,
      OverGardenCalloutNode,
      OverGardenCodeNode,
    ],
    dependencies: [
      configExtension(InitialStateExtension, {
        setOptions: { tag: HISTORY_MERGE_TAG },
        updateOptions: { discrete: true, tag: HISTORY_MERGE_TAG },
      }),
      HorizontalRuleExtension,
      configExtension(HistoryExtension, {
        disabled: false,
        maxDepth: 100,
      }),
      AriaLiveRegionExtension,
      FocusManagerExtension,
      RovingTabIndexExtension,
    ],
    $initialEditorState: () => {
      $hydrateJournalDocumentV1(normalized);
    },
    onError: (error) => {
      onError?.(error);
      if (!onError) throw error;
    },
    register(editor) {
      const registrations: Array<() => void> = [
        registerRichText(editor),
        registerList(editor),
        registerCheckList(editor),
        registerJournalNodeReorder(editor),
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) => $handleJournalCodeEnter(event),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          TOGGLE_LINK_COMMAND,
          (payload) => {
            if (payload === null) {
              $toggleLink(null);
              return true;
            }
            const url = typeof payload === "string" ? payload : payload.url;
            try {
              $toggleLink(normalizeSafeHref(url), { rel: null });
              return true;
            } catch {
              return false;
            }
          },
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          INDENT_CONTENT_COMMAND,
          () => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return false;
            const selectedItems = selection
              .getNodes()
              .map((node) => $getNearestNodeOfType(node, ListItemNode))
              .filter((node): node is ListItemNode => node !== null);
            if (selectedItems.length === 0) return false;
            return selectedItems.some((item) => {
              const list = $getNearestNodeOfType(item, ListNode);
              return list ? $getListDepth(list) >= 2 : false;
            });
          },
          COMMAND_PRIORITY_HIGH,
        ),
      ];

      registrations.push(
        editor.registerNodeTransform(ParagraphNode, (node) => {
          $ensureUniqueTopLevelBlockId(node);
        }),
        editor.registerNodeTransform(HeadingNode, (node) => {
          $ensureUniqueTopLevelBlockId(node);
        }),
        editor.registerNodeTransform(OverGardenListNode, (node) => {
          $ensureUniqueTopLevelBlockId(node);
          $updateJournalListItemValues(node);
        }),
        editor.registerNodeTransform(HorizontalRuleNode, (node) => {
          $ensureUniqueTopLevelBlockId(node);
        }),
        editor.registerNodeTransform(OverGardenImageNode, (node) => {
          $ensureUniqueTopLevelBlockId(node);
        }),
        editor.registerNodeTransform(OverGardenQuoteNode, (node) => {
          $ensureUniqueTopLevelBlockId(node);
        }),
        editor.registerNodeTransform(OverGardenCalloutNode, (node) => {
          $ensureUniqueTopLevelBlockId(node);
        }),
        editor.registerNodeTransform(OverGardenCodeNode, (node) => {
          $ensureUniqueTopLevelBlockId(node);
          $flattenJournalCodeChildren(node);
        }),
      );
      return mergeRegister(...registrations);
    },
  });
}

/**
 * Enter inside a code block inserts a line break. The one exception is the
 * Enter that follows an already-empty last line: that leaves the block, taking
 * the trailing break with it, so a code block at the end of an entry never
 * traps the caret.
 */
function $handleJournalCodeEnter(event: KeyboardEvent | null): boolean {
  if (event?.shiftKey) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const code = selection.anchor.getNode().getTopLevelElement();
  if (!$isOverGardenCodeNode(code)) return false;

  event?.preventDefault();
  const lastChild = code.getLastChild();
  if ($journalCaretAtBlockEnd(selection, code) && $isLineBreakNode(lastChild)) {
    lastChild.remove();
    const paragraph = $setJournalBlockId(
      $createParagraphNode(),
      createJournalBlockId(),
    );
    code.insertAfter(paragraph);
    paragraph.selectStart();
    return true;
  }
  selection.insertLineBreak();
  return true;
}

function $journalCaretAtBlockEnd(
  selection: RangeSelection,
  block: ElementNode,
): boolean {
  const point = selection.anchor;
  const node = point.getNode();
  if (node === block) return point.offset === block.getChildrenSize();
  if (node.getParent() !== block || node.getNextSibling() !== null) {
    return false;
  }
  return $isTextNode(node) ? point.offset === node.getTextContentSize() : true;
}

/**
 * A code block carries plain text and line breaks and nothing else. Anything a
 * paste, a shortcut or a stray transform managed to put there becomes plain
 * text, so the canonical `code` block cannot hold marks it has no field for.
 */
function $flattenJournalCodeChildren(code: OverGardenCodeNode): void {
  for (const child of code.getChildren()) {
    if ($isTextNode(child)) {
      if (child.getFormat() !== 0) child.setFormat(0);
      if (child.getStyle() !== "") child.setStyle("");
      if (child.getDetail() !== 0) child.setDetail(0);
      if (child.getMode() !== "normal") child.setMode("normal");
      continue;
    }
    if ($isLineBreakNode(child)) continue;
    child.replace($createTextNode(child.getTextContent()));
  }
}

function $ensureUniqueTopLevelBlockId(node: LexicalNode): void {
  const parent = node.getParent();
  if (!parent || parent.getType() !== "root") return;
  const currentId = $getJournalBlockId(node);
  const duplicateBefore = node
    .getPreviousSiblings()
    .some((candidate) => $getJournalBlockId(candidate) === currentId);
  if (!currentId || duplicateBefore) {
    $setJournalBlockId(node, createJournalBlockId());
  }
}

function $updateJournalListItemValues(list: OverGardenListNode): void {
  let value = list.getStart();
  for (const child of list.getChildren()) {
    if (!$isListItemNode(child)) continue;
    if (child.getValue() !== value) child.setValue(value);
    if (!$isListNode(child.getFirstChild())) value += 1;
  }
}

export { JOURNAL_HYDRATION_TAG };
