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
  registerList,
} from "@lexical/list";
import { HeadingNode, registerRichText } from "@lexical/rich-text";
import { $getNearestNodeOfType } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  HISTORY_MERGE_TAG,
  INDENT_CONTENT_COMMAND,
  mergeRegister,
  ParagraphNode,
  type EditorThemeClasses,
  type LexicalNode,
} from "lexical";

import {
  $getJournalBlockId,
  $setJournalBlockId,
  createJournalBlockId,
  JOURNAL_LIST_NODE_REPLACEMENT,
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
  heading: {
    h2: "text-xl font-semibold leading-7",
    h3: "text-lg font-semibold leading-7",
  },
  image: "my-3",
  link: "underline underline-offset-2",
  list: {
    listitem: "ml-6",
    nested: { listitem: "ml-5" },
    ol: "list-decimal space-y-1",
    ul: "list-disc space-y-1",
  },
  paragraph: "min-h-6 leading-7",
  quote: "border-l-2 border-border pl-4 italic",
  quoteAttribution: "mt-2 block text-sm not-italic text-muted-foreground",
  quoteBody: "leading-7",
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
        registerJournalNodeReorder(editor),
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
      );
      return mergeRegister(...registrations);
    },
  });
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
