"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  type NodeKey,
} from "lexical";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
  $journalBlockCommandIdOf,
  $journalQuoteHasAttribution,
  $replaceJournalBlockWithDelimiter,
  $toggleJournalQuoteAttribution,
  $turnJournalBlockInto,
  JOURNAL_BLOCK_COMMANDS,
  JOURNAL_TURN_INTO_COMMAND_IDS,
  type JournalBlockCommandId,
} from "./journal-block-commands";
import {
  $getJournalBlockId,
  $setJournalBlockId,
  createJournalBlockId,
} from "./journal-lexical-nodes";
import {
  duplicateJournalBlockById,
  moveJournalBlockToIndex,
  removeJournalBlockById,
} from "./journal-block-order";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
} from "@/components/ui/menu";
import type {
  JournalBlockCommandCopy,
  JournalBlockReorderCopy,
  StructuredJournalComposerLabels,
} from "@/components/garden/structured-journal-composer";
import { COMPOSER_PHOTO_ACCEPT } from "@/lib/garden/composer-photo-selection";
import { $createParagraphNode } from "lexical";

/** Notion's handle is 24 px tall; it is centred on the block's first line. */
const HANDLE_SIZE = 24;
/** A pointer must travel this far before a press on the handle becomes a drag. */
const DRAG_THRESHOLD = 4;

interface GutterItem {
  blockId: string;
  key: NodeKey;
  type: keyof JournalBlockReorderCopy["blockType"];
  /** null for a block "turn into" cannot produce, such as a delimiter. */
  commandId: JournalBlockCommandId | null;
  /** Only a quote can carry one, and only the block menu can toggle it. */
  hasQuoteAttribution: boolean;
}

interface PointerGesture {
  blockId: string;
  fromIndex: number;
  pointerId: number;
  startY: number;
  insertBeforeIndex: number;
  dragging: boolean;
}

export interface JournalBlockGutterProps {
  containerRef: RefObject<HTMLDivElement | null>;
  copy: JournalBlockCommandCopy;
  reorderCopy: JournalBlockReorderCopy;
  tools: StructuredJournalComposerLabels["tools"];
  disabled: boolean;
  onReorderingChange(value: boolean, options?: { serialize?: boolean }): void;
  onAnnouncement(message: string): void;
  onChooseImage(file: File): Promise<void>;
}

/**
 * Notion's left gutter: on the hovered or focused block, an add button and a
 * drag handle. Lexical's committed root children stay the only ordering
 * authority — DOM rectangles are read for pointer geometry and for nothing
 * else (ADR-0028 D3).
 */
export function JournalBlockGutter({
  containerRef,
  copy,
  reorderCopy,
  tools,
  disabled,
  onReorderingChange,
  onAnnouncement,
  onChooseImage,
}: JournalBlockGutterProps) {
  const [editor] = useLexicalComposerContext();
  const [items, setItems] = useState<GutterItem[]>([]);
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
  const [caretBlockId, setCaretBlockId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const addRef = useRef<HTMLButtonElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const gestureRef = useRef<PointerGesture | null>(null);
  const frameRef = useRef<number | null>(null);
  const destroyedRef = useRef(false);

  const activeBlockId = hoverBlockId ?? caretBlockId;
  const activeIndex = items.findIndex((item) => item.blockId === activeBlockId);
  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;
  const pinned = menuOpen || insertOpen || dragging;

  const readItems = useCallback((): GutterItem[] => {
    const next: GutterItem[] = [];
    editor.getEditorState().read(() => {
      for (const node of $getRoot().getChildren()) {
        const blockId = $getJournalBlockId(node);
        if (!blockId) continue;
        next.push({
          blockId,
          key: node.getKey(),
          type: mapLexicalNodeType(node.getType()),
          commandId: $isElementNode(node)
            ? $journalBlockCommandIdOf(node)
            : null,
          hasQuoteAttribution:
            $isElementNode(node) && $journalQuoteHasAttribution(node),
        });
      }
    });
    return next;
  }, [editor]);

  const positionGutter = useCallback(() => {
    if (destroyedRef.current) return;
    const container = containerRef.current;
    const gutter = gutterRef.current;
    if (!container || !gutter || !activeItem) return;
    const element = editor.getElementByKey(activeItem.key);
    if (!element) return;
    const containerRect = container.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const firstLine = Number.parseFloat(style.lineHeight) || HANDLE_SIZE;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    // Centred on the block's first line, the way Notion aligns its handle, so
    // the control does not drift down a tall heading or a long paragraph.
    const offset = paddingTop + Math.max(0, (firstLine - HANDLE_SIZE) / 2);
    gutter.style.transform = `translateY(${rect.top - containerRect.top + offset}px)`;
  }, [activeItem, containerRef, editor]);

  const schedulePosition = useCallback(() => {
    if (destroyedRef.current || frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      positionGutter();
    });
  }, [positionGutter]);

  const onReorderingChangeRef = useRef(onReorderingChange);
  useEffect(() => {
    onReorderingChangeRef.current = onReorderingChange;
  }, [onReorderingChange]);

  useEffect(() => {
    destroyedRef.current = false;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const sync = () => {
      setItems(readItems());
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const top = selection.anchor.getNode().getTopLevelElement();
        setCaretBlockId(top ? $getJournalBlockId(top) : null);
      });
      schedulePosition();
    };
    sync();
    return editor.registerUpdateListener(sync);
  }, [editor, readItems, schedulePosition]);

  useEffect(() => {
    schedulePosition();
  }, [activeBlockId, items, schedulePosition]);

  useEffect(() => {
    const container = containerRef.current;
    const root = editor.getRootElement();
    if (!container || !root) return;
    const observer = new ResizeObserver(schedulePosition);
    observer.observe(container);
    observer.observe(root);
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
    };
  }, [containerRef, editor, schedulePosition]);

  // Teardown runs on unmount only. Keying it on the callback would make React
  // cancel the pending frame every time the callback's identity changed, and a
  // cancelled frame whose id is left in the ref stops every later reposition —
  // which is exactly what a development double-mount used to do here.
  useEffect(
    () => () => {
      destroyedRef.current = true;
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      onReorderingChangeRef.current(false, { serialize: false });
    },
    [],
  );

  // Hover decides which block owns the gutter while the pointer is inside the
  // canvas; the caret decides it otherwise, so a keyboard user is never left
  // without the control.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;
    const onPointerMove = (event: PointerEvent) => {
      if (pinned) return;
      setHoverBlockId(blockIdAtClientY(editor, items, event.clientY));
    };
    const onPointerLeave = () => {
      if (!pinned) setHoverBlockId(null);
    };
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [containerRef, disabled, editor, items, pinned]);

  useEffect(() => {
    const indicator = indicatorRef.current;
    if (!indicator || indicatorTop === null) return;
    indicator.style.transform = `translateY(${indicatorTop}px)`;
  }, [indicatorTop]);

  // The block menu has a keyboard route, because the gutter's own buttons sit
  // outside the editor's tab order (ADR-0028 D6).
  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (
            disabled ||
            event.key.toLowerCase() !== "m" ||
            !event.shiftKey ||
            !(event.metaKey || event.ctrlKey)
          ) {
            return false;
          }
          event.preventDefault();
          setHoverBlockId(null);
          setMenuOpen(true);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [disabled, editor],
  );

  function announce(message: string) {
    onAnnouncement(message);
  }

  function announceMove(item: GutterItem, toIndex: number) {
    announce(
      reorderCopy.movedAnnouncement
        .replaceAll("{type}", reorderCopy.blockType[item.type])
        .replaceAll("{position}", String(toIndex + 1))
        .replaceAll("{total}", String(items.length)),
    );
  }

  function withReordering<T>(run: () => T): T {
    onReorderingChange(true);
    try {
      return run();
    } finally {
      onReorderingChange(false);
    }
  }

  function moveBy(delta: -1 | 1) {
    if (!activeItem || activeIndex < 0) return;
    const toIndex = activeIndex + delta;
    if (toIndex < 0 || toIndex >= items.length) return;
    withReordering(() => {
      if (
        moveJournalBlockToIndex(editor, {
          blockId: activeItem.blockId,
          toIndex,
        }) === "moved"
      ) {
        announceMove(activeItem, toIndex);
      }
    });
  }

  function duplicate() {
    if (!activeItem) return;
    withReordering(() => {
      if (duplicateJournalBlockById(editor, activeItem.blockId) !== "noop") {
        announce(
          copy.duplicatedAnnouncement.replaceAll(
            "{type}",
            reorderCopy.blockType[activeItem.type],
          ),
        );
      }
    });
  }

  function remove() {
    if (!activeItem || activeItem.type === "image") return;
    withReordering(() => {
      if (removeJournalBlockById(editor, activeItem.blockId) !== "removed") {
        return;
      }
      announce(
        reorderCopy.deletedAnnouncement.replaceAll(
          "{type}",
          reorderCopy.blockType[activeItem.type],
        ),
      );
      setHoverBlockId(null);
      window.requestAnimationFrame(() => editor.focus());
    });
  }

  function toggleQuoteAttribution() {
    if (!activeItem) return;
    withReordering(() => {
      editor.update(
        () => {
          const block = $getRoot()
            .getChildren()
            .find(
              (candidate) =>
                $getJournalBlockId(candidate) === activeItem.blockId,
            );
          if ($isElementNode(block)) $toggleJournalQuoteAttribution(block);
        },
        { discrete: true },
      );
    });
    window.requestAnimationFrame(() => editor.focus());
  }

  function turnInto(commandId: JournalBlockCommandId) {
    if (!activeItem) return;
    withReordering(() => {
      editor.update(
        () => {
          const block = $getRoot()
            .getChildren()
            .find(
              (candidate) =>
                $getJournalBlockId(candidate) === activeItem.blockId,
            );
          if (block && "getChildren" in block) {
            $turnJournalBlockInto(
              commandId,
              block as Parameters<typeof $turnJournalBlockInto>[1],
            );
          }
        },
        { discrete: true },
      );
    });
    window.requestAnimationFrame(() => editor.focus());
  }

  function insertBelow(commandId: JournalBlockCommandId) {
    if (!activeItem) return;
    if (commandId === "image") {
      fileInputRef.current?.click();
      return;
    }
    withReordering(() => {
      editor.update(
        () => {
          const block = $getRoot()
            .getChildren()
            .find(
              (candidate) =>
                $getJournalBlockId(candidate) === activeItem.blockId,
            );
          if (!block) return;
          const paragraph = $setJournalBlockId(
            $createParagraphNode(),
            createJournalBlockId(),
          );
          block.insertAfter(paragraph);
          paragraph.selectStart();
          if (commandId === "delimiter") {
            $replaceJournalBlockWithDelimiter(paragraph);
          } else if (commandId !== "paragraph") {
            $turnJournalBlockInto(commandId, paragraph);
          }
        },
        { discrete: true },
      );
    });
    window.requestAnimationFrame(() => editor.focus());
  }

  function pointerInsertIndex(clientY: number): number {
    for (let index = 0; index < items.length; index += 1) {
      const element = editor.getElementByKey(items[index]!.key);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (clientY < (rect.top + rect.bottom) / 2) return index;
    }
    return items.length;
  }

  function updateIndicator(insertBeforeIndex: number) {
    const container = containerRef.current;
    if (!container || items.length === 0) {
      setIndicatorTop(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const target =
      insertBeforeIndex >= items.length
        ? editor.getElementByKey(items.at(-1)!.key)
        : editor.getElementByKey(items[Math.max(0, insertBeforeIndex)]!.key);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    setIndicatorTop(
      (insertBeforeIndex >= items.length ? rect.bottom : rect.top) -
        containerRect.top,
    );
  }

  function setDraggedElementDimmed(key: NodeKey, dimmed: boolean) {
    // The attribute lives on the editor's own DOM for the length of one
    // gesture, during which no editor update runs, so the reconciler never
    // sees it.
    const element = editor.getElementByKey(key);
    if (!element) return;
    if (dimmed) element.setAttribute("data-journal-block-dragging", "true");
    else element.removeAttribute("data-journal-block-dragging");
  }

  function onHandlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled || gestureRef.current || !activeItem || activeIndex < 0)
      return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      blockId: activeItem.blockId,
      fromIndex: activeIndex,
      pointerId: event.pointerId,
      startY: event.clientY,
      insertBeforeIndex: activeIndex,
      dragging: false,
    };
  }

  function onHandlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (
      !gesture.dragging &&
      Math.abs(event.clientY - gesture.startY) < DRAG_THRESHOLD
    ) {
      return;
    }
    if (!gesture.dragging) {
      gesture.dragging = true;
      setDragging(true);
      onReorderingChange(true);
      const item = items[gesture.fromIndex];
      if (item) setDraggedElementDimmed(item.key, true);
    }
    event.preventDefault();
    gesture.insertBeforeIndex = pointerInsertIndex(event.clientY);
    updateIndicator(gesture.insertBeforeIndex);
    const edge = 48;
    if (event.clientY < edge) window.scrollBy({ top: -12, behavior: "auto" });
    if (event.clientY > window.innerHeight - edge) {
      window.scrollBy({ top: 12, behavior: "auto" });
    }
  }

  function endGesture(commit: boolean) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    const item = items[gesture.fromIndex];
    if (item) setDraggedElementDimmed(item.key, false);
    setIndicatorTop(null);
    if (!gesture.dragging) {
      // A press that never travelled is a click: open the block menu.
      setDragging(false);
      if (commit) setMenuOpen(true);
      return;
    }
    setDragging(false);
    try {
      const raw = gesture.insertBeforeIndex;
      const toIndex = raw > gesture.fromIndex ? raw - 1 : raw;
      if (!commit || !item || toIndex === gesture.fromIndex) return;
      const bounded = Math.max(0, Math.min(toIndex, items.length - 1));
      if (
        moveJournalBlockToIndex(editor, {
          blockId: item.blockId,
          toIndex: bounded,
        }) === "moved"
      ) {
        announceMove(item, bounded);
      }
    } finally {
      onReorderingChange(false);
    }
  }

  const showGutter = !disabled && Boolean(activeItem);
  const activeLabel = activeItem
    ? reorderCopy.blockType[activeItem.type]
    : reorderCopy.blockType.unknown;
  const position = activeIndex >= 0 ? activeIndex + 1 : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div
        ref={indicatorRef}
        data-lexical-reorder-indicator="true"
        className="pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-primary motion-reduce:transition-none forced-colors:border-t-2"
        hidden={indicatorTop === null}
      />
      <div
        ref={gutterRef}
        data-journal-block-gutter="true"
        data-block-id={activeItem?.blockId}
        className="pointer-events-auto absolute left-0 flex items-start gap-0.5"
        hidden={!showGutter}
      >
        <button
          ref={addRef}
          type="button"
          data-journal-gutter-action="add"
          aria-label={copy.add}
          aria-haspopup="menu"
          aria-expanded={insertOpen}
          disabled={disabled}
          className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/canvas:opacity-100 hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 data-expanded:opacity-100 motion-reduce:transition-none"
          data-expanded={insertOpen || undefined}
          onClick={() => setInsertOpen(true)}
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
        <button
          ref={handleRef}
          type="button"
          data-journal-gutter-action="handle"
          data-lexical-reorder-action="handle"
          aria-label={`${reorderCopy.dragHandle}: ${activeLabel}, ${position} / ${items.length}`}
          aria-grabbed={dragging}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={disabled}
          className="flex size-6 touch-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/canvas:opacity-100 hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 data-expanded:opacity-100 motion-reduce:transition-none"
          data-expanded={menuOpen || dragging || undefined}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={() => endGesture(true)}
          onPointerCancel={() => endGesture(false)}
          onLostPointerCapture={() => endGesture(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveBy(-1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              moveBy(1);
            } else if (event.key === "Escape") {
              event.preventDefault();
              endGesture(false);
              editor.focus();
            }
          }}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      </div>

      <Menu open={insertOpen} onOpenChange={setInsertOpen} modal={false}>
        <MenuContent
          anchor={addRef}
          align="start"
          side="bottom"
          aria-label={copy.add}
          className="max-h-80 overflow-y-auto"
        >
          {JOURNAL_BLOCK_COMMANDS.map((command) => (
            <MenuItem
              key={command.id}
              onClick={() => insertBelow(command.id)}
              data-journal-insert-command={command.id}
            >
              {copy.commands[command.id]}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>

      <Menu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <MenuContent
          anchor={handleRef}
          align="start"
          side="bottom"
          aria-label={copy.menu}
          className="max-h-96 overflow-y-auto"
        >
          {activeItem?.commandId === "quote" ? (
            <MenuItem onClick={toggleQuoteAttribution}>
              {activeItem.hasQuoteAttribution
                ? tools.removeQuoteAttribution
                : tools.quoteAttribution}
            </MenuItem>
          ) : null}
          <MenuItem onClick={duplicate} disabled={activeItem?.type === "image"}>
            <Copy aria-hidden="true" className="size-4" />
            {copy.duplicate}
          </MenuItem>
          <MenuItem onClick={() => moveBy(-1)} disabled={activeIndex <= 0}>
            <ChevronUp aria-hidden="true" className="size-4" />
            {reorderCopy.moveUp}
          </MenuItem>
          <MenuItem
            onClick={() => moveBy(1)}
            disabled={activeIndex < 0 || activeIndex >= items.length - 1}
          >
            <ChevronDown aria-hidden="true" className="size-4" />
            {reorderCopy.moveDown}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={remove} disabled={activeItem?.type === "image"}>
            <Trash2 aria-hidden="true" className="size-4" />
            {reorderCopy.deleteBlock}
          </MenuItem>
          <MenuSeparator />
          {/* A flat group rather than a submenu: base-ui closes the parent menu
              with reason `sibling-open` when a nested root opens inside a
              controlled, trigger-less menu, and one list is simpler anyway. */}
          <MenuGroup>
            <MenuGroupLabel>{copy.turnInto}</MenuGroupLabel>
            {JOURNAL_TURN_INTO_COMMAND_IDS.map((commandId) => (
              <MenuItem
                key={commandId}
                onClick={() => turnInto(commandId)}
                data-journal-turn-into={commandId}
                disabled={activeItem?.commandId === commandId}
              >
                {copy.commands[commandId]}
              </MenuItem>
            ))}
          </MenuGroup>
        </MenuContent>
      </Menu>

      <input
        ref={fileInputRef}
        type="file"
        accept={COMPOSER_PHOTO_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        aria-label={copy.commands.image}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void onChooseImage(file);
        }}
      />
    </div>
  );
}

function blockIdAtClientY(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  items: readonly GutterItem[],
  clientY: number,
): string | null {
  let nearest: { blockId: string; distance: number } | null = null;
  for (const item of items) {
    const element = editor.getElementByKey(item.key);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) return item.blockId;
    const distance =
      clientY < rect.top ? rect.top - clientY : clientY - rect.bottom;
    if (!nearest || distance < nearest.distance) {
      nearest = { blockId: item.blockId, distance };
    }
  }
  // Beyond the last block the gutter still belongs to the nearest one, so the
  // control never disappears in the padding around the text.
  return nearest && nearest.distance < 48 ? nearest.blockId : null;
}

function mapLexicalNodeType(
  type: string,
): keyof JournalBlockReorderCopy["blockType"] {
  switch (type) {
    case "paragraph":
      return "paragraph";
    case "heading":
      return "header";
    case "list":
    case "overgarden-list":
      return "list";
    case "overgarden-quote":
      return "quote";
    case "overgarden-callout":
      return "callout";
    case "overgarden-code":
      return "code";
    case "horizontalrule":
      return "delimiter";
    case "overgarden-image":
      return "image";
    default:
      return "unknown";
  }
}
