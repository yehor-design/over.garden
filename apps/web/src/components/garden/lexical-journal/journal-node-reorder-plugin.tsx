"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
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
  type NodeKey,
} from "lexical";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
  $getJournalBlockId,
  $setJournalBlockId,
  createJournalBlockId,
} from "./journal-lexical-nodes";
import type { JournalBlockReorderCopy } from "@/components/garden/structured-journal-composer";
import { interfaceLocaleChangeCoordinator } from "@/lib/interface-locale-change-coordinator";

export const OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID =
  "owner-composer-reorder-gesture";

export interface MoveJournalBlockPayload {
  blockId: string;
  toIndex: number;
}

export const MOVE_JOURNAL_BLOCK_COMMAND: LexicalCommand<MoveJournalBlockPayload> =
  createCommand("OVERGARDEN_MOVE_JOURNAL_BLOCK_COMMAND");

export const REMOVE_JOURNAL_BLOCK_COMMAND: LexicalCommand<{
  blockId: string;
}> = createCommand("OVERGARDEN_REMOVE_JOURNAL_BLOCK_COMMAND");

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
  return () => {
    unregisterRemove();
    unregisterMove();
  };
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

interface ReorderItem {
  blockId: string;
  key: NodeKey;
  type: keyof JournalBlockReorderCopy["blockType"];
}

interface PointerGesture {
  blockId: string;
  fromIndex: number;
  pointerId: number;
  insertBeforeIndex: number;
}

export interface JournalNodeReorderPluginProps {
  containerRef: RefObject<HTMLDivElement | null>;
  copy: JournalBlockReorderCopy;
  disabled: boolean;
  onReorderingChange(value: boolean, options?: { serialize?: boolean }): void;
  onAnnouncement(message: string): void;
}

/**
 * First-party top-level reorder UI. Lexical's committed root children are the
 * only ordering authority; DOM rectangles are read solely for pointer geometry.
 */
export function JournalNodeReorderPlugin({
  containerRef,
  copy,
  disabled,
  onReorderingChange,
  onAnnouncement,
}: JournalNodeReorderPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const gestureRef = useRef<PointerGesture | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const unregisterInFlightRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<number | null>(null);
  const destroyedRef = useRef(false);

  const readItems = useCallback((): ReorderItem[] => {
    const next: ReorderItem[] = [];
    editor.getEditorState().read(() => {
      for (const node of $getRoot().getChildren()) {
        const blockId = $getJournalBlockId(node);
        if (!blockId) continue;
        next.push({
          blockId,
          key: node.getKey(),
          type: mapLexicalNodeType(node.getType()),
        });
      }
    });
    return next;
  }, [editor]);

  const measure = useCallback(() => {
    if (destroyedRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    for (const item of readItems()) {
      const element = editor.getElementByKey(item.key);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      const control = container.querySelector<HTMLElement>(
        `[data-lexical-reorder-key="${CSS.escape(item.key)}"]`,
      );
      if (!control) continue;
      control.style.transform = `translateY(${rect.top - containerRect.top}px)`;
      control.style.opacity = "1";
    }
  }, [containerRef, editor, readItems]);

  const scheduleMeasure = useCallback(() => {
    if (destroyedRef.current || frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    destroyedRef.current = false;
    const syncTree = () => {
      setItems(readItems());
      scheduleMeasure();
    };
    syncTree();
    return editor.registerUpdateListener(syncTree);
  }, [editor, readItems, scheduleMeasure]);

  useEffect(() => {
    scheduleMeasure();
  }, [items, scheduleMeasure]);

  useEffect(() => {
    const indicator = indicatorRef.current;
    if (!indicator || indicatorTop === null) return;
    indicator.style.transform = `translateY(${indicatorTop}px)`;
  }, [indicatorTop]);

  useEffect(() => {
    const container = containerRef.current;
    const root = editor.getRootElement();
    if (!container || !root) return;
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(container);
    observer.observe(root);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    scheduleMeasure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
    };
  }, [containerRef, editor, scheduleMeasure]);

  useEffect(
    () => () => {
      destroyedRef.current = true;
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      unregisterInFlightRef.current?.();
      unregisterInFlightRef.current = null;
      onReorderingChange(false, { serialize: false });
    },
    [onReorderingChange],
  );

  function beginInFlight() {
    if (unregisterInFlightRef.current) return;
    unregisterInFlightRef.current = interfaceLocaleChangeCoordinator.register({
      id: OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID,
      kind: "in-flight",
    });
    onReorderingChange(true);
  }

  function endInFlight() {
    unregisterInFlightRef.current?.();
    unregisterInFlightRef.current = null;
    onReorderingChange(false);
  }

  function announce(item: ReorderItem, toIndex: number) {
    onAnnouncement(
      copy.movedAnnouncement
        .replaceAll("{type}", copy.blockType[item.type])
        .replaceAll("{position}", String(toIndex + 1))
        .replaceAll("{total}", String(items.length)),
    );
  }

  function focusControl(blockId: string, action: "handle" | "up" | "down") {
    window.requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector<HTMLElement>(
          `[data-lexical-reorder-block="${CSS.escape(blockId)}"] [data-lexical-reorder-action="${action}"]`,
        )
        ?.focus();
    });
  }

  function commitMove(
    item: ReorderItem,
    toIndex: number,
    focusAction: "handle" | "up" | "down",
  ): "moved" | "noop" {
    const result = moveJournalBlockToIndex(editor, {
      blockId: item.blockId,
      toIndex,
    });
    if (result === "moved") {
      announce(item, toIndex);
      focusControl(item.blockId, focusAction);
    }
    return result;
  }

  function cancelGesture() {
    if (!gestureRef.current) return;
    gestureRef.current = null;
    setActiveBlockId(null);
    setIndicatorTop(null);
    endInFlight();
  }

  function pointerInsertIndex(clientY: number): number {
    for (let index = 0; index < items.length; index += 1) {
      const element = editor.getElementByKey(items[index].key);
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
        : editor.getElementByKey(items[Math.max(0, insertBeforeIndex)].key);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    setIndicatorTop(
      (insertBeforeIndex >= items.length ? rect.bottom : rect.top) -
        containerRect.top,
    );
  }

  function onPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    item: ReorderItem,
    fromIndex: number,
  ) {
    if (disabled || gestureRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      blockId: item.blockId,
      fromIndex,
      pointerId: event.pointerId,
      insertBeforeIndex: fromIndex,
    };
    setActiveBlockId(item.blockId);
    beginInFlight();
    updateIndicator(fromIndex);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    gesture.insertBeforeIndex = pointerInsertIndex(event.clientY);
    updateIndicator(gesture.insertBeforeIndex);
    const edge = 48;
    if (event.clientY < edge) window.scrollBy({ top: -12, behavior: "auto" });
    if (event.clientY > window.innerHeight - edge) {
      window.scrollBy({ top: 12, behavior: "auto" });
    }
  }

  function finishPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const item = items.find(
      (candidate) => candidate.blockId === gesture.blockId,
    );
    const rawTarget = gesture.insertBeforeIndex;
    const toIndex = rawTarget > gesture.fromIndex ? rawTarget - 1 : rawTarget;
    gestureRef.current = null;
    setActiveBlockId(null);
    setIndicatorTop(null);
    try {
      if (!item || toIndex === gesture.fromIndex) return;
      commitMove(
        item,
        Math.max(0, Math.min(toIndex, items.length - 1)),
        "handle",
      );
    } finally {
      endInFlight();
    }
  }

  function moveBy(
    item: ReorderItem,
    index: number,
    delta: -1 | 1,
    focusAction: "handle" | "up" | "down" = delta === -1 ? "up" : "down",
  ) {
    const toIndex = index + delta;
    if (toIndex < 0 || toIndex >= items.length) return;
    beginInFlight();
    try {
      commitMove(item, toIndex, focusAction);
    } finally {
      endInFlight();
    }
  }

  function removeItem(item: ReorderItem, index: number) {
    if (item.type === "image") return;
    beginInFlight();
    try {
      const result = removeJournalBlockById(editor, item.blockId);
      if (result !== "removed") return;
      onAnnouncement(
        copy.deletedAnnouncement.replaceAll(
          "{type}",
          copy.blockType[item.type],
        ),
      );
      const focusTarget = items[index + 1] ?? items[index - 1];
      if (focusTarget) focusControl(focusTarget.blockId, "handle");
      else window.requestAnimationFrame(() => editor.focus());
    } finally {
      endInFlight();
    }
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10"
      aria-hidden="false"
    >
      {items.map((item, index) => {
        const label = copy.blockType[item.type];
        return (
          <div
            key={item.key}
            data-lexical-reorder-block={item.blockId}
            data-lexical-reorder-key={item.key}
            className="group pointer-events-auto absolute left-1 flex gap-1 opacity-0"
          >
            <button
              type="button"
              data-lexical-reorder-action="handle"
              aria-label={`${copy.dragHandle}: ${label}, ${index + 1} / ${items.length}`}
              aria-grabbed={activeBlockId === item.blockId}
              disabled={disabled}
              className="min-h-11 min-w-11 touch-none rounded border border-border bg-background text-sm focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-40"
              onPointerDown={(event) => onPointerDown(event, item, index)}
              onPointerMove={onPointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={cancelGesture}
              onLostPointerCapture={cancelGesture}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelGesture();
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveBy(item, index, -1, "handle");
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveBy(item, index, 1, "handle");
                }
              }}
            >
              ⋮⋮
            </button>
            <span className="absolute top-0 left-11 hidden gap-1 group-focus-within:flex group-hover:flex">
              <button
                type="button"
                data-lexical-reorder-action="up"
                aria-label={`${copy.moveUp}: ${label}, ${index + 1} / ${items.length}`}
                disabled={disabled || index === 0}
                className="min-h-11 min-w-11 rounded border border-border bg-background focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-40"
                onClick={() => moveBy(item, index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                data-lexical-reorder-action="down"
                aria-label={`${copy.moveDown}: ${label}, ${index + 1} / ${items.length}`}
                disabled={disabled || index === items.length - 1}
                className="min-h-11 min-w-11 rounded border border-border bg-background focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-40"
                onClick={() => moveBy(item, index, 1)}
              >
                ↓
              </button>
              {item.type !== "image" ? (
                <button
                  type="button"
                  data-lexical-reorder-action="delete"
                  aria-label={`${copy.deleteBlock}: ${label}, ${index + 1} / ${items.length}`}
                  disabled={disabled}
                  className="min-h-11 min-w-11 rounded border border-border bg-background focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-40"
                  onClick={() => removeItem(item, index)}
                >
                  ×
                </button>
              ) : null}
            </span>
          </div>
        );
      })}
      <div
        ref={indicatorRef}
        data-lexical-reorder-indicator="true"
        className="pointer-events-none absolute right-1 left-1 h-0.5 bg-foreground motion-reduce:transition-none forced-colors:border-t-2"
        hidden={indicatorTop === null}
      />
    </div>
  );
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
    case "horizontalrule":
      return "delimiter";
    case "overgarden-image":
      return "image";
    default:
      return "unknown";
  }
}
