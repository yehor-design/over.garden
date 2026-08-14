"use client";

import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/extension";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $createListItemNode,
  $createListNode,
  $getListDepth,
  $isListNode,
  ListNode,
} from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalFocusManagerRef } from "@lexical/react/useLexicalFocusManagerRef";
import { useLexicalRovingTabIndexRef } from "@lexical/react/useLexicalRovingTabIndexRef";
import { $createHeadingNode, $isHeadingNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $getNearestNodeOfType } from "@lexical/utils";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  type ElementNode,
  type LexicalNode,
  type RangeSelection,
} from "lexical";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  $createOverGardenQuoteBodyNode,
  $createOverGardenQuoteAttributionNode,
  $createOverGardenQuoteNode,
  $getJournalBlockId,
  $isOverGardenQuoteAttributionNode,
  $isOverGardenQuoteBodyNode,
  $isOverGardenQuoteNode,
  $setJournalBlockId,
  createJournalBlockId,
} from "./journal-lexical-nodes";
import type { StructuredJournalComposerLabels } from "@/components/garden/structured-journal-composer";
import { COMPOSER_PHOTO_ACCEPT } from "@/lib/garden/composer-photo-selection";
import { cn } from "@/lib/utils";

export interface JournalLexicalToolbarProps {
  labels: StructuredJournalComposerLabels;
  disabled: boolean;
  onChooseImage(file: File): Promise<void>;
}

type BlockKind =
  | "paragraph"
  | "h2"
  | "h3"
  | "unordered-list"
  | "ordered-list"
  | "quote"
  | "other";

export function JournalLexicalToolbar({
  labels,
  disabled,
  onChooseImage,
}: JournalLexicalToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const focusManagerRef = useLexicalFocusManagerRef();
  const rovingRef = useLexicalRovingTabIndexRef({ orientation: "horizontal" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedLinkSelectionRef = useRef<RangeSelection | null>(null);
  const [blockKind, setBlockKind] = useState<BlockKind>("paragraph");
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [quoteHasAttribution, setQuoteHasAttribution] = useState(false);
  const [listDepth, setListDepth] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [mediaBusy, setMediaBusy] = useState(false);

  const syncSelection = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        setBlockKind("other");
        setBold(false);
        setItalic(false);
        setQuoteHasAttribution(false);
        setListDepth(0);
        return;
      }
      setBold(selection.hasFormat("bold"));
      setItalic(selection.hasFormat("italic"));
      const top = selection.anchor.getNode().getTopLevelElement();
      if (!top) {
        setBlockKind("other");
      } else if (top.getType() === "paragraph") {
        setBlockKind("paragraph");
      } else if ($isHeadingNode(top)) {
        setBlockKind(top.getTag() === "h2" ? "h2" : "h3");
      } else if ($isListNode(top)) {
        setBlockKind(
          top.getListType() === "number" ? "ordered-list" : "unordered-list",
        );
        const selectedList = $getNearestNodeOfType(
          selection.anchor.getNode(),
          ListNode,
        );
        setListDepth(selectedList ? $getListDepth(selectedList) : 1);
      } else if (top.getType() === "overgarden-quote") {
        setBlockKind("quote");
        setQuoteHasAttribution(
          $isOverGardenQuoteNode(top) &&
            top.getChildren().some($isOverGardenQuoteAttributionNode),
        );
      } else {
        setBlockKind("other");
        setQuoteHasAttribution(false);
        setListDepth(0);
      }
    });
  }, [editor]);

  useEffect(
    () =>
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          syncSelection();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, syncSelection],
  );

  useEffect(() => {
    syncSelection();
    return editor.registerUpdateListener(syncSelection);
  }, [editor, syncSelection]);

  useEffect(() => {
    if (!disabled) return;
    savedLinkSelectionRef.current = null;
  }, [disabled]);

  useEffect(
    () =>
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (value) => {
          setCanUndo(value);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  useEffect(
    () =>
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (value) => {
          setCanRedo(value);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  const combinedToolbarRef = useCallback(
    (node: HTMLDivElement | null) => {
      focusManagerRef(node);
      rovingRef(node);
    },
    [focusManagerRef, rovingRef],
  );

  function formatBlock(kind: "paragraph" | "h2" | "h3") {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(
        selection,
        () =>
          kind === "paragraph"
            ? $createParagraphNode()
            : $createHeadingNode(kind),
        (previous, next) => {
          const id = $getJournalBlockId(previous) || createJournalBlockId();
          $setJournalBlockId(next, id);
          next.setDirection(previous.getDirection());
          next.setFormat(previous.getFormatType());
          next.setIndent(previous.getIndent());
        },
      );
    });
  }

  function formatList(style: "bullet" | "number") {
    editor.update(() => {
      $formatSelectedJournalBlockAsList(style);
    });
  }

  function formatQuote() {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const top = selection.anchor.getNode().getTopLevelElement();
      if (!top || top.getType() === "overgarden-quote") return;
      if (!isTextualElement(top)) return;
      const id = $getJournalBlockId(top) || createJournalBlockId();
      const quote = $createOverGardenQuoteNode(id);
      const body = $createOverGardenQuoteBodyNode();
      body.append(...top.getChildren());
      quote.append(body);
      top.replace(quote);
      body.selectEnd();
    });
  }

  function toggleQuoteAttribution() {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const top = selection.anchor.getNode().getTopLevelElement();
      if (!$isOverGardenQuoteNode(top)) return;
      const existing = top
        .getChildren()
        .find($isOverGardenQuoteAttributionNode);
      if (existing) {
        const body = top.getFirstChild();
        existing.remove();
        if ($isOverGardenQuoteBodyNode(body)) body.selectEnd();
        return;
      }
      const attribution = $createOverGardenQuoteAttributionNode();
      top.append(attribution);
      attribution.selectStart();
    });
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled || mediaBusy) return;
    setMediaBusy(true);
    try {
      await onChooseImage(file);
    } finally {
      setMediaBusy(false);
    }
  }

  function applyLink() {
    editor.update(
      () => {
        const saved = savedLinkSelectionRef.current;
        if (!saved) return;
        $setSelection(saved.clone());
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkValue.trim() || null);
      },
      { discrete: true },
    );
    savedLinkSelectionRef.current = null;
    setLinkOpen(false);
    setLinkValue("");
    editor.focus();
  }

  const controls = [
    {
      label: labels.tools.paragraph,
      value: "P",
      active: blockKind === "paragraph",
      unavailable: !isParagraphOrHeading(blockKind),
      action: () => formatBlock("paragraph"),
    },
    {
      label: labels.tools.heading2,
      value: "H2",
      active: blockKind === "h2",
      unavailable: !isParagraphOrHeading(blockKind),
      action: () => formatBlock("h2"),
    },
    {
      label: labels.tools.heading3,
      value: "H3",
      active: blockKind === "h3",
      unavailable: !isParagraphOrHeading(blockKind),
      action: () => formatBlock("h3"),
    },
    {
      label: labels.tools.unorderedList,
      value: "•",
      active: blockKind === "unordered-list",
      unavailable:
        !isParagraphOrHeading(blockKind) &&
        blockKind !== "unordered-list" &&
        blockKind !== "ordered-list",
      action: () => formatList("bullet"),
    },
    {
      label: labels.tools.orderedList,
      value: "1.",
      active: blockKind === "ordered-list",
      unavailable:
        !isParagraphOrHeading(blockKind) &&
        blockKind !== "unordered-list" &&
        blockKind !== "ordered-list",
      action: () => formatList("number"),
    },
    ...(blockKind === "unordered-list" || blockKind === "ordered-list"
      ? [
          {
            label: labels.tools.indentList,
            value: "→",
            active: false,
            unavailable: listDepth >= 2,
            action: () =>
              editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined),
          },
          {
            label: labels.tools.outdentList,
            value: "←",
            active: false,
            unavailable: listDepth <= 1,
            action: () =>
              editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined),
          },
        ]
      : []),
    {
      label: labels.tools.quote,
      value: "❝",
      active: blockKind === "quote",
      unavailable: !isParagraphOrHeading(blockKind) && blockKind !== "quote",
      action: formatQuote,
    },
    ...(blockKind === "quote"
      ? [
          {
            label: quoteHasAttribution
              ? labels.tools.removeQuoteAttribution
              : labels.tools.quoteAttribution,
            value: "— A",
            active: quoteHasAttribution,
            unavailable: false,
            action: toggleQuoteAttribution,
          },
        ]
      : []),
    {
      label: labels.tools.delimiter,
      value: "—",
      active: false,
      unavailable: !isParagraphOrHeading(blockKind),
      action: () => {
        editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
      },
    },
    {
      label: labels.tools.bold,
      value: "B",
      active: bold,
      unavailable: blockKind === "other",
      action: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"),
    },
    {
      label: labels.tools.italic,
      value: "I",
      active: italic,
      unavailable: blockKind === "other",
      action: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"),
    },
  ];

  return (
    <div className="grid gap-2">
      <div
        ref={combinedToolbarRef}
        role="toolbar"
        aria-label={labels.tools.toolbar}
        className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/20 p-1"
      >
        {controls.map((control) => (
          <ToolbarButton
            key={control.label}
            label={control.label}
            active={control.active}
            disabled={disabled || control.unavailable}
            onClick={control.action}
          >
            {control.value}
          </ToolbarButton>
        ))}
        <ToolbarButton
          label={labels.tools.link}
          active={linkOpen}
          disabled={disabled || blockKind === "other"}
          onClick={() => {
            if (linkOpen) {
              savedLinkSelectionRef.current = null;
              setLinkOpen(false);
              return;
            }
            editor.getEditorState().read(() => {
              const selection = $getSelection();
              savedLinkSelectionRef.current = $isRangeSelection(selection)
                ? selection.clone()
                : null;
            });
            setLinkOpen(true);
          }}
        >
          🔗
        </ToolbarButton>
        <ToolbarButton
          label={labels.tools.image}
          active={mediaBusy}
          disabled={disabled || mediaBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          {mediaBusy ? "…" : "+▧"}
        </ToolbarButton>
        <ToolbarButton
          label={labels.tools.undo}
          active={false}
          disabled={disabled || !canUndo}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          label={labels.tools.redo}
          active={false}
          disabled={disabled || !canRedo}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        >
          ↷
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept={COMPOSER_PHOTO_ACCEPT}
          disabled={disabled || mediaBusy}
          className="sr-only"
          tabIndex={-1}
          onChange={onFileChange}
          aria-label={labels.imageChoose}
        />
      </div>
      {linkOpen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
          <input
            type="url"
            value={linkValue}
            disabled={disabled}
            onChange={(event) => setLinkValue(event.target.value)}
            aria-label={labels.tools.link}
            className="h-11 min-w-56 flex-1 rounded border border-input bg-background px-3 text-sm"
            autoFocus
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              setLinkOpen(false);
              setLinkValue("");
              savedLinkSelectionRef.current = null;
              editor.focus();
            }}
          />
          <button
            type="button"
            disabled={disabled}
            className="min-h-11 rounded border border-border px-3 text-sm"
            onClick={applyLink}
          >
            {labels.tools.applyLink}
          </button>
          <button
            type="button"
            disabled={disabled}
            className="min-h-11 rounded px-3 text-sm"
            onClick={() => {
              setLinkOpen(false);
              setLinkValue("");
              savedLinkSelectionRef.current = null;
              editor.focus();
            }}
          >
            {labels.tools.cancelLink}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick(): void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      data-roving-item="true"
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded border px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-40",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function isTextualElement(node: LexicalNode): node is ElementNode {
  return node.getType() === "paragraph" || $isHeadingNode(node);
}

/**
 * Converts only the selected top-level domain block. Lexical's generic list
 * helper intentionally merges adjacent lists, which would collapse distinct
 * JournalDocumentV1 block IDs and is therefore not valid at this boundary.
 */
export function $formatSelectedJournalBlockAsList(
  style: "bullet" | "number",
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const top = selection.anchor.getNode().getTopLevelElement();
  if (!top) return false;
  const id = $getJournalBlockId(top) || createJournalBlockId();

  if ($isListNode(top)) {
    if (top.getListType() === style) return false;
    const replacement = $setJournalBlockId($createListNode(style), id);
    replacement.append(...top.getChildren());
    top.replace(replacement);
    return true;
  }
  if (!isTextualElement(top)) return false;

  const item = $createListItemNode();
  const wasEmpty = top.isEmpty();
  item.append(...top.getChildren());
  const list = $setJournalBlockId($createListNode(style), id);
  list.append(item);
  top.replace(list);
  if (wasEmpty) item.selectStart();
  return true;
}

function isParagraphOrHeading(blockKind: BlockKind): boolean {
  return blockKind === "paragraph" || blockKind === "h2" || blockKind === "h3";
}
