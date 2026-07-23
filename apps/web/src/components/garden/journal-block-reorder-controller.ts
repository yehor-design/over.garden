/**
 * First-party pointer/touch/keyboard reorder chrome for Editor.js blocks.
 * Does not treat DOM order as canonical — only commits via blocks.move.
 */

import type EditorJS from "@editorjs/editorjs";

import {
  OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID,
  applyMoveToOrderedIds,
  computeInsertBeforeIndexFromPointer,
  formatReorderAnnouncement,
  mapEditorToolNameToTypeClass,
  resolveDragInsertBefore,
  resolveMoveByOffset,
  type JournalBlockReorderCopy,
} from "@/components/garden/journal-block-reorder";
import { interfaceLocaleChangeCoordinator } from "@/lib/interface-locale-change-coordinator";

export interface JournalBlockReorderControllerOptions {
  editor: EditorJS;
  holder: HTMLElement;
  getCopy: () => JournalBlockReorderCopy;
  disabled?: boolean;
  onCommittedMove: () => Promise<void>;
  onAnnouncement: (message: string) => void;
}

export interface JournalBlockReorderController {
  sync(): void;
  isReordering(): boolean;
  destroy(): void;
  moveBlockById(
    sourceBlockId: string,
    delta: -1 | 1,
  ): Promise<"moved" | "noop">;
}

const CONTROLS_ATTR = "data-og-reorder-controls";
const HANDLE_ATTR = "data-og-reorder-handle";
const INDICATOR_ATTR = "data-og-reorder-indicator";
const BLOCK_SELECTOR = ".ce-block";

export function attachJournalBlockReorderController(
  options: JournalBlockReorderControllerOptions,
): JournalBlockReorderController {
  const { editor, holder } = options;
  let destroyed = false;
  let reordering = false;
  let unregisterInFlight: (() => void) | null = null;
  let indicator: HTMLDivElement | null = null;
  let autoScrollFrame: number | null = null;
  let lastPointerY = 0;
  let gesture: {
    sourceBlockId: string;
    fromIndex: number;
    pointerId: number;
    insertBeforeIndex: number;
  } | null = null;

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function readOrderedBlockIds(): string[] {
    const count = editor.blocks.getBlocksCount();
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const block = editor.blocks.getBlockByIndex(i);
      if (block?.id) ids.push(block.id);
    }
    return ids;
  }

  function announceForCommit(sourceBlockId: string, toIndex: number, total: number) {
    const block = editor.blocks.getById(sourceBlockId);
    const typeClass = mapEditorToolNameToTypeClass(block?.name);
    const copy = options.getCopy();
    options.onAnnouncement(
      formatReorderAnnouncement({
        template: copy.movedAnnouncement,
        typeLabel: copy.blockType[typeClass],
        positionOneBased: toIndex + 1,
        total,
      }),
    );
  }

  async function commitMove(params: {
    fromIndex: number;
    toIndex: number;
    sourceBlockId: string;
    focusControl?: "handle" | "move-up" | "move-down" | "block";
  }): Promise<"moved" | "noop"> {
    if (params.fromIndex === params.toIndex) return "noop";
    const before = readOrderedBlockIds();
    editor.blocks.move(params.toIndex, params.fromIndex);
    await options.onCommittedMove();
    const after = readOrderedBlockIds();
    const expected = applyMoveToOrderedIds(before, {
      kind: "move",
      fromIndex: params.fromIndex,
      toIndex: params.toIndex,
      sourceBlockId: params.sourceBlockId,
    });
    if (
      after.length === expected.length &&
      after.every((id, index) => id === expected[index])
    ) {
      announceForCommit(params.sourceBlockId, params.toIndex, after.length);
    }
    focusAfterMove(params.sourceBlockId, params.focusControl ?? "handle");
    return "moved";
  }

  function focusAfterMove(
    sourceBlockId: string,
    control: "handle" | "move-up" | "move-down" | "block",
  ) {
    const block = editor.blocks.getById(sourceBlockId);
    if (!block) return;
    if (control === "block") {
      editor.caret.setToBlock(block, "start");
      return;
    }
    const root = block.holder.querySelector(`[${CONTROLS_ATTR}]`);
    const selector =
      control === "move-up"
        ? '[data-og-reorder-action="up"]'
        : control === "move-down"
          ? '[data-og-reorder-action="down"]'
          : `[${HANDLE_ATTR}]`;
    const target = root?.querySelector<HTMLElement>(selector);
    target?.focus();
  }

  function ensureIndicator(): HTMLDivElement {
    if (indicator) return indicator;
    indicator = document.createElement("div");
    indicator.setAttribute(INDICATOR_ATTR, "true");
    indicator.className = "og-reorder-indicator";
    indicator.hidden = true;
    holder.appendChild(indicator);
    return indicator;
  }

  function placeIndicator(insertBeforeIndex: number) {
    const el = ensureIndicator();
    const blocks = [...holder.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)];
    if (blocks.length === 0) {
      el.hidden = true;
      return;
    }
    const holderRect = holder.getBoundingClientRect();
    let top: number;
    if (insertBeforeIndex <= 0) {
      top = blocks[0].getBoundingClientRect().top - holderRect.top;
    } else if (insertBeforeIndex >= blocks.length) {
      const last = blocks[blocks.length - 1].getBoundingClientRect();
      top = last.bottom - holderRect.top;
    } else {
      top =
        blocks[insertBeforeIndex].getBoundingClientRect().top - holderRect.top;
    }
    el.hidden = false;
    el.style.transform = reducedMotion ? `translateY(${top}px)` : `translateY(${top}px)`;
  }

  function clearIndicator() {
    if (!indicator) return;
    indicator.hidden = true;
  }

  function beginInFlight() {
    if (unregisterInFlight) return;
    unregisterInFlight = interfaceLocaleChangeCoordinator.register({
      id: OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID,
      kind: "in-flight",
    });
  }

  function endInFlight() {
    unregisterInFlight?.();
    unregisterInFlight = null;
  }

  function stopAutoScroll() {
    if (autoScrollFrame !== null) {
      window.cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }
  }

  function tickAutoScroll() {
    autoScrollFrame = null;
    if (!gesture) return;
    const edge = 48;
    const viewportHeight = window.innerHeight;
    let delta = 0;
    if (lastPointerY < edge) delta = -12;
    else if (lastPointerY > viewportHeight - edge) delta = 12;
    if (delta !== 0) {
      window.scrollBy({ top: delta, behavior: reducedMotion ? "auto" : "smooth" });
      updateInsertFromY(lastPointerY);
    }
    autoScrollFrame = window.requestAnimationFrame(tickAutoScroll);
  }

  function updateInsertFromY(clientY: number) {
    if (!gesture) return;
    const blocks = [...holder.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)];
    const rects = blocks.map((node) => {
      const rect = node.getBoundingClientRect();
      const id =
        editor.blocks.getBlockByElement(node)?.id ??
        node.getAttribute("data-id") ??
        "";
      return { id, top: rect.top, bottom: rect.bottom };
    });
    gesture.insertBeforeIndex = computeInsertBeforeIndexFromPointer({
      clientY,
      blockRects: rects,
    });
    placeIndicator(gesture.insertBeforeIndex);
  }

  function cancelGesture() {
    if (!gesture) return;
    gesture = null;
    reordering = false;
    stopAutoScroll();
    clearIndicator();
    endInFlight();
    holder.classList.remove("og-reorder-active");
  }

  async function finishGesture(commit: boolean) {
    const active = gesture;
    if (!active) return;
    const { sourceBlockId, fromIndex, insertBeforeIndex } = active;
    gesture = null;
    reordering = false;
    stopAutoScroll();
    clearIndicator();
    endInFlight();
    holder.classList.remove("og-reorder-active");

    if (!commit) return;
    const resolution = resolveDragInsertBefore({
      fromIndex,
      insertBeforeIndex,
      blockCount: editor.blocks.getBlocksCount(),
      sourceBlockId,
    });
    if (resolution.kind === "noop") return;
    await commitMove({
      fromIndex: resolution.fromIndex,
      toIndex: resolution.toIndex,
      sourceBlockId: resolution.sourceBlockId,
      focusControl: "handle",
    });
  }

  function onPointerDown(event: PointerEvent) {
    if (options.disabled || destroyed) return;
    const handle = (event.target as HTMLElement | null)?.closest?.(
      `[${HANDLE_ATTR}]`,
    );
    if (!handle || !(handle instanceof HTMLElement)) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;

    const blockEl = handle.closest(BLOCK_SELECTOR);
    if (!blockEl || !(blockEl instanceof HTMLElement)) return;
    const block = editor.blocks.getBlockByElement(blockEl);
    if (!block?.id) return;

    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture(event.pointerId);

    const fromIndex = editor.blocks.getBlockIndex(block.id);
    gesture = {
      sourceBlockId: block.id,
      fromIndex,
      pointerId: event.pointerId,
      insertBeforeIndex: fromIndex,
    };
    reordering = true;
    beginInFlight();
    holder.classList.add("og-reorder-active");
    lastPointerY = event.clientY;
    placeIndicator(fromIndex);
    autoScrollFrame = window.requestAnimationFrame(tickAutoScroll);
  }

  function onPointerMove(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    lastPointerY = event.clientY;
    updateInsertFromY(event.clientY);
  }

  function onPointerUp(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    void finishGesture(true);
  }

  function onPointerCancel(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    cancelGesture();
  }

  function onLostCapture(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    cancelGesture();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!gesture) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelGesture();
    }
  }

  async function onControlsClick(event: MouseEvent) {
    if (options.disabled || destroyed || reordering) return;
    const button = (event.target as HTMLElement | null)?.closest?.(
      "[data-og-reorder-action]",
    );
    if (!button || !(button instanceof HTMLButtonElement)) return;
    if (button.disabled) return;
    const action = button.dataset.ogReorderAction;
    if (action !== "up" && action !== "down") return;
    const blockEl = button.closest(BLOCK_SELECTOR);
    if (!blockEl || !(blockEl instanceof HTMLElement)) return;
    const block = editor.blocks.getBlockByElement(blockEl);
    if (!block?.id) return;
    event.preventDefault();
    event.stopPropagation();
    await controller.moveBlockById(block.id, action === "up" ? -1 : 1);
  }

  function syncControlsForBlock(blockEl: HTMLElement, index: number, total: number) {
    let controls = blockEl.querySelector<HTMLElement>(`[${CONTROLS_ATTR}]`);
    const copy = options.getCopy();
    const block = editor.blocks.getBlockByElement(blockEl);
    const typeClass = mapEditorToolNameToTypeClass(block?.name);
    const typeLabel = copy.blockType[typeClass];
    const position = index + 1;

    if (!controls) {
      controls = document.createElement("div");
      controls.setAttribute(CONTROLS_ATTR, "true");
      controls.className = "og-reorder-controls";
      controls.innerHTML = `
        <button type="button" class="og-reorder-handle" ${HANDLE_ATTR}="true" aria-grabbed="false"></button>
        <button type="button" class="og-reorder-btn" data-og-reorder-action="up"></button>
        <button type="button" class="og-reorder-btn" data-og-reorder-action="down"></button>
      `;
      blockEl.prepend(controls);
    }

    const handle = controls.querySelector<HTMLButtonElement>(`[${HANDLE_ATTR}]`);
    const up = controls.querySelector<HTMLButtonElement>(
      '[data-og-reorder-action="up"]',
    );
    const down = controls.querySelector<HTMLButtonElement>(
      '[data-og-reorder-action="down"]',
    );
    if (handle) {
      handle.textContent = "⋮⋮";
      handle.setAttribute(
        "aria-label",
        `${copy.dragHandle}: ${typeLabel}, ${position} / ${total}`,
      );
      handle.disabled = Boolean(options.disabled);
    }
    if (up) {
      up.textContent = "↑";
      up.setAttribute(
        "aria-label",
        `${copy.moveUp}: ${typeLabel}, ${position} / ${total}`,
      );
      up.disabled = Boolean(options.disabled) || index === 0;
    }
    if (down) {
      down.textContent = "↓";
      down.setAttribute(
        "aria-label",
        `${copy.moveDown}: ${typeLabel}, ${position} / ${total}`,
      );
      down.disabled = Boolean(options.disabled) || index >= total - 1;
    }
  }

  function sync() {
    if (destroyed) return;
    const blocks = [...holder.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)];
    const total = blocks.length;
    blocks.forEach((blockEl, index) => {
      syncControlsForBlock(blockEl, index, total);
    });
  }

  const observer = new MutationObserver(() => {
    if (destroyed || reordering) return;
    sync();
  });
  observer.observe(holder, { childList: true, subtree: true });

  holder.addEventListener("pointerdown", onPointerDown, true);
  holder.addEventListener("pointermove", onPointerMove, true);
  holder.addEventListener("pointerup", onPointerUp, true);
  holder.addEventListener("pointercancel", onPointerCancel, true);
  holder.addEventListener("lostpointercapture", onLostCapture, true);
  holder.addEventListener("click", onControlsClick, true);
  window.addEventListener("keydown", onKeyDown, true);

  const controller: JournalBlockReorderController = {
    sync,
    isReordering: () => reordering,
    destroy() {
      destroyed = true;
      cancelGesture();
      observer.disconnect();
      holder.removeEventListener("pointerdown", onPointerDown, true);
      holder.removeEventListener("pointermove", onPointerMove, true);
      holder.removeEventListener("pointerup", onPointerUp, true);
      holder.removeEventListener("pointercancel", onPointerCancel, true);
      holder.removeEventListener("lostpointercapture", onLostCapture, true);
      holder.removeEventListener("click", onControlsClick, true);
      window.removeEventListener("keydown", onKeyDown, true);
      indicator?.remove();
      indicator = null;
      holder
        .querySelectorAll(`[${CONTROLS_ATTR}]`)
        .forEach((node) => node.remove());
    },
    async moveBlockById(sourceBlockId, delta) {
      const ordered = readOrderedBlockIds();
      const resolution = resolveMoveByOffset({
        orderedBlockIds: ordered,
        sourceBlockId,
        delta,
      });
      if (resolution.kind === "noop") return "noop";
      beginInFlight();
      try {
        return await commitMove({
          fromIndex: resolution.fromIndex,
          toIndex: resolution.toIndex,
          sourceBlockId: resolution.sourceBlockId,
          focusControl: delta === -1 ? "move-up" : "move-down",
        });
      } finally {
        endInFlight();
      }
    },
  };

  sync();
  return controller;
}
