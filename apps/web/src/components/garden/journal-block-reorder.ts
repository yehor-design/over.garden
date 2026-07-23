/**
 * OVE-206 accessible JournalDocumentV1 block reorder.
 * Canonical commit primitive: Editor.js `blocks.move(toIndex, fromIndex)`.
 */

export const OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID =
  "owner-composer-reorder-gesture";

export const OVE_206_BROWSER_SCENARIO_IDS = [
  "pointer-drag-locale-blocked",
  "touch-drag-locale-blocked",
  "drag-cancel-then-transition",
  "pointer-commit-immediate-transition",
  "keyboard-move-immediate-transition",
  "serialization-race-after-move",
  "hundred-block-ten-inline-transition",
  "ukraine-reorder-zero-control",
] as const;

export type Ove206BrowserScenarioId =
  (typeof OVE_206_BROWSER_SCENARIO_IDS)[number];

export const OVE_206_PRIMARY_BROWSER_SCENARIO_ID =
  "pointer-commit-immediate-transition" as const satisfies Ove206BrowserScenarioId;

export type JournalReorderBlockTypeClass =
  | "paragraph"
  | "header"
  | "list"
  | "quote"
  | "delimiter"
  | "image"
  | "unknown";

export interface JournalBlockReorderCopy {
  moveUp: string;
  moveDown: string;
  dragHandle: string;
  deleteBlock: string;
  /** Placeholders: {type}, {position}, {total} */
  movedAnnouncement: string;
  blockType: Record<JournalReorderBlockTypeClass, string>;
}

export type BlockMoveCommit =
  | {
      kind: "move";
      fromIndex: number;
      toIndex: number;
      sourceBlockId: string;
    }
  | {
      kind: "noop";
      reason: "same-position" | "missing-source" | "out-of-range";
    };

/**
 * Resolve Editor.js `blocks.move(toIndex, fromIndex)` for a drag that shows an
 * insertion line *before* `insertBeforeIndex` while the source is still at
 * `fromIndex`.
 */
export function resolveDragInsertBefore(params: {
  fromIndex: number;
  insertBeforeIndex: number;
  blockCount: number;
  sourceBlockId: string;
}): BlockMoveCommit {
  const { fromIndex, insertBeforeIndex, blockCount, sourceBlockId } = params;
  if (
    fromIndex < 0 ||
    fromIndex >= blockCount ||
    insertBeforeIndex < 0 ||
    insertBeforeIndex > blockCount
  ) {
    return { kind: "noop", reason: "out-of-range" };
  }
  if (
    insertBeforeIndex === fromIndex ||
    insertBeforeIndex === fromIndex + 1
  ) {
    return { kind: "noop", reason: "same-position" };
  }
  const toIndex =
    insertBeforeIndex > fromIndex ? insertBeforeIndex - 1 : insertBeforeIndex;
  if (toIndex === fromIndex) {
    return { kind: "noop", reason: "same-position" };
  }
  return {
    kind: "move",
    fromIndex,
    toIndex,
    sourceBlockId,
  };
}

export function resolveMoveByOffset(params: {
  orderedBlockIds: readonly string[];
  sourceBlockId: string;
  delta: -1 | 1;
}): BlockMoveCommit {
  const fromIndex = params.orderedBlockIds.indexOf(params.sourceBlockId);
  if (fromIndex < 0) {
    return { kind: "noop", reason: "missing-source" };
  }
  const toIndex = fromIndex + params.delta;
  if (toIndex < 0 || toIndex >= params.orderedBlockIds.length) {
    return { kind: "noop", reason: "out-of-range" };
  }
  return {
    kind: "move",
    fromIndex,
    toIndex,
    sourceBlockId: params.sourceBlockId,
  };
}

export function resolveMoveToIndex(params: {
  orderedBlockIds: readonly string[];
  sourceBlockId: string;
  toIndex: number;
}): BlockMoveCommit {
  const fromIndex = params.orderedBlockIds.indexOf(params.sourceBlockId);
  if (fromIndex < 0) {
    return { kind: "noop", reason: "missing-source" };
  }
  if (
    params.toIndex < 0 ||
    params.toIndex >= params.orderedBlockIds.length
  ) {
    return { kind: "noop", reason: "out-of-range" };
  }
  if (params.toIndex === fromIndex) {
    return { kind: "noop", reason: "same-position" };
  }
  return {
    kind: "move",
    fromIndex,
    toIndex: params.toIndex,
    sourceBlockId: params.sourceBlockId,
  };
}

export function mapEditorToolNameToTypeClass(
  toolName: string | null | undefined,
): JournalReorderBlockTypeClass {
  switch (toolName) {
    case "paragraph":
      return "paragraph";
    case "header":
      return "header";
    case "list":
      return "list";
    case "quote":
      return "quote";
    case "delimiter":
      return "delimiter";
    case "image":
      return "image";
    default:
      return "unknown";
  }
}

export function formatReorderAnnouncement(params: {
  template: string;
  typeLabel: string;
  positionOneBased: number;
  total: number;
}): string {
  return params.template
    .replaceAll("{type}", params.typeLabel)
    .replaceAll("{position}", String(params.positionOneBased))
    .replaceAll("{total}", String(params.total));
}

/**
 * Detect a single-block permutation. Returns null when the sequences differ by
 * more than a move (insert/delete/replace) or when nothing moved.
 */
export function detectSingleBlockReorder(
  before: readonly string[],
  after: readonly string[],
): { blockId: string; fromIndex: number; toIndex: number } | null {
  if (before.length !== after.length || before.length === 0) return null;
  if (before.every((id, index) => id === after[index])) return null;

  const beforeSorted = [...before].sort();
  const afterSorted = [...after].sort();
  if (
    beforeSorted.length !== afterSorted.length ||
    beforeSorted.some((id, index) => id !== afterSorted[index])
  ) {
    return null;
  }

  const fromCandidates: number[] = [];
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] !== after[i]) fromCandidates.push(i);
  }
  if (fromCandidates.length === 0) return null;

  // Prefer the id that left its old index and landed elsewhere.
  for (const fromIndex of fromCandidates) {
    const blockId = before[fromIndex];
    if (after[fromIndex] === blockId) continue;
    const toIndex = after.indexOf(blockId);
    if (toIndex < 0 || toIndex === fromIndex) continue;
    const simulated = [...before];
    const [moved] = simulated.splice(fromIndex, 1);
    simulated.splice(toIndex, 0, moved);
    if (simulated.every((id, index) => id === after[index])) {
      return { blockId, fromIndex, toIndex };
    }
  }
  return null;
}

export function computeInsertBeforeIndexFromPointer(params: {
  clientY: number;
  blockRects: ReadonlyArray<{ id: string; top: number; bottom: number }>;
}): number {
  if (params.blockRects.length === 0) return 0;
  for (let i = 0; i < params.blockRects.length; i += 1) {
    const rect = params.blockRects[i];
    const mid = (rect.top + rect.bottom) / 2;
    if (params.clientY < mid) return i;
  }
  return params.blockRects.length;
}

export function applyMoveToOrderedIds(
  orderedBlockIds: readonly string[],
  commit: Extract<BlockMoveCommit, { kind: "move" }>,
): string[] {
  const next = [...orderedBlockIds];
  const [moved] = next.splice(commit.fromIndex, 1);
  next.splice(commit.toIndex, 0, moved);
  return next;
}
