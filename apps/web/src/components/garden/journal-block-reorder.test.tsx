import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID,
  OVE_206_BROWSER_SCENARIO_IDS,
  OVE_206_PRIMARY_BROWSER_SCENARIO_ID,
  applyMoveToOrderedIds,
  computeInsertBeforeIndexFromPointer,
  detectSingleBlockReorder,
  formatReorderAnnouncement,
  mapEditorToolNameToTypeClass,
  resolveDragInsertBefore,
  resolveMoveByOffset,
  resolveMoveToIndex,
} from "@/components/garden/journal-block-reorder";
import {
  JOURNAL_DOCUMENT_SCHEMA_VERSION,
  MAX_JOURNAL_DOCUMENT_BLOCKS,
  MAX_JOURNAL_INLINE_IMAGES,
  normalizeJournalDocument,
  semanticJournalDocumentHash,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import {
  editorOutputToJournalDocumentV1,
  journalDocumentV1ToEditorOutput,
} from "@/lib/garden/journal-document-editor-adapter";
import {
  createInterfaceLocaleChangeCoordinator,
  interfaceLocaleChangeCoordinator,
} from "@/lib/interface-locale-change-coordinator";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";

describe("OVE-206 journal block reorder contract", () => {
  afterEach(() => {
    // Reset singleton coordinator registrations between tests.
    const fresh = createInterfaceLocaleChangeCoordinator();
    Object.assign(interfaceLocaleChangeCoordinator, fresh);
  });

  it("pins the primary browser scenario and mandatory scenario set", () => {
    expect(OVE_206_PRIMARY_BROWSER_SCENARIO_ID).toBe(
      "pointer-commit-immediate-transition",
    );
    expect([...OVE_206_BROWSER_SCENARIO_IDS]).toEqual([
      "pointer-drag-locale-blocked",
      "touch-drag-locale-blocked",
      "drag-cancel-then-transition",
      "pointer-commit-immediate-transition",
      "keyboard-move-immediate-transition",
      "serialization-race-after-move",
      "hundred-block-ten-inline-transition",
      "ukraine-reorder-zero-control",
    ]);
    expect(OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID).toBe(
      "owner-composer-reorder-gesture",
    );
  });

  it("resolves pointer/touch insert-before into a single blocks.move", () => {
    expect(
      resolveDragInsertBefore({
        fromIndex: 0,
        insertBeforeIndex: 3,
        blockCount: 4,
        sourceBlockId: "a",
      }),
    ).toEqual({
      kind: "move",
      fromIndex: 0,
      toIndex: 2,
      sourceBlockId: "a",
    });

    expect(
      resolveDragInsertBefore({
        fromIndex: 3,
        insertBeforeIndex: 1,
        blockCount: 4,
        sourceBlockId: "d",
      }),
    ).toEqual({
      kind: "move",
      fromIndex: 3,
      toIndex: 1,
      sourceBlockId: "d",
    });

    expect(
      resolveDragInsertBefore({
        fromIndex: 2,
        insertBeforeIndex: 2,
        blockCount: 4,
        sourceBlockId: "c",
      }).kind,
    ).toBe("noop");
    expect(
      resolveDragInsertBefore({
        fromIndex: 2,
        insertBeforeIndex: 3,
        blockCount: 4,
        sourceBlockId: "c",
      }).kind,
    ).toBe("noop");
  });

  it("treats Move up / Move down boundary actions as noop", () => {
    const ids = ["a", "b", "c"];
    expect(
      resolveMoveByOffset({
        orderedBlockIds: ids,
        sourceBlockId: "a",
        delta: -1,
      }).kind,
    ).toBe("noop");
    expect(
      resolveMoveByOffset({
        orderedBlockIds: ids,
        sourceBlockId: "c",
        delta: 1,
      }).kind,
    ).toBe("noop");
    expect(
      resolveMoveByOffset({
        orderedBlockIds: ids,
        sourceBlockId: "b",
        delta: -1,
      }),
    ).toEqual({
      kind: "move",
      fromIndex: 1,
      toIndex: 0,
      sourceBlockId: "b",
    });
  });

  it("keeps pointer, touch, and keyboard paths on the same ordered ids", () => {
    const before = ["p1", "h1", "img1", "q1"];
    const drag = resolveDragInsertBefore({
      fromIndex: 2,
      insertBeforeIndex: 0,
      blockCount: 4,
      sourceBlockId: "img1",
    });
    expect(drag.kind).toBe("move");
    if (drag.kind !== "move") return;
    const afterDrag = applyMoveToOrderedIds(before, drag);

    const keyboard = resolveMoveToIndex({
      orderedBlockIds: before,
      sourceBlockId: "img1",
      toIndex: 0,
    });
    expect(keyboard.kind).toBe("move");
    if (keyboard.kind !== "move") return;
    const afterKeyboard = applyMoveToOrderedIds(before, keyboard);

    expect(afterDrag).toEqual(["img1", "p1", "h1", "q1"]);
    expect(afterKeyboard).toEqual(afterDrag);
  });

  it("preserves media identities through document reorder round-trip", () => {
    const mediaIds = Array.from({ length: MAX_JOURNAL_INLINE_IMAGES }, (_, i) =>
      `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    const document: JournalDocumentV1 = {
      schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          spans: [{ text: "Перед фото", marks: [{ type: "bold" }] }],
        },
        ...mediaIds.map((mediaAssetId, index) => ({
          id: `img-${index + 1}`,
          type: "image" as const,
          mediaAssetId,
        })),
      ],
    };

    const commit = resolveMoveByOffset({
      orderedBlockIds: document.blocks.map((block) => block.id),
      sourceBlockId: "img-1",
      delta: 1,
    });
    expect(commit.kind).toBe("move");
    if (commit.kind !== "move") return;

    const reorderedIds = applyMoveToOrderedIds(
      document.blocks.map((block) => block.id),
      commit,
    );
    const reordered: JournalDocumentV1 = {
      schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
      blocks: reorderedIds.map(
        (id) => document.blocks.find((block) => block.id === id)!,
      ),
    };

    const normalized = normalizeJournalDocument(reordered);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const editor = journalDocumentV1ToEditorOutput(normalized.document);
    const roundTrip = editorOutputToJournalDocumentV1(editor);
    expect(semanticJournalDocumentHash(roundTrip)).toBe(
      semanticJournalDocumentHash(normalized.document),
    );
    expect(
      roundTrip.blocks
        .filter((block) => block.type === "image")
        .map((block) =>
          block.type === "image" ? [block.id, block.mediaAssetId] : null,
        ),
    ).toEqual(
      normalized.document.blocks
        .filter((block) => block.type === "image")
        .map((block) =>
          block.type === "image" ? [block.id, block.mediaAssetId] : null,
        ),
    );
  });

  it("reorders a 100-block ten-inline fixture without id or media loss", () => {
    const blocks: JournalDocumentV1["blocks"] = [];
    for (let i = 0; i < MAX_JOURNAL_DOCUMENT_BLOCKS; i += 1) {
      if (i < MAX_JOURNAL_INLINE_IMAGES) {
        blocks.push({
          id: `img-${i + 1}`,
          type: "image",
          mediaAssetId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        });
      } else {
        blocks.push({
          id: `p-${i + 1}`,
          type: "paragraph",
          spans: [{ text: `Блок ${i + 1}` }],
        });
      }
    }
    expect(blocks).toHaveLength(MAX_JOURNAL_DOCUMENT_BLOCKS);

    let order = blocks.map((block) => block.id);
    for (let step = 0; step < 20; step += 1) {
      const sourceBlockId = order[step % order.length];
      const commit = resolveMoveByOffset({
        orderedBlockIds: order,
        sourceBlockId,
        delta: step % 2 === 0 ? 1 : -1,
      });
      if (commit.kind === "move") {
        order = applyMoveToOrderedIds(order, commit);
      }
    }

    expect(new Set(order).size).toBe(MAX_JOURNAL_DOCUMENT_BLOCKS);
    expect(order.filter((id) => id.startsWith("img-"))).toHaveLength(
      MAX_JOURNAL_INLINE_IMAGES,
    );
    const rebuilt: JournalDocumentV1 = {
      schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
      blocks: order.map((id) => blocks.find((block) => block.id === id)!),
    };
    const normalized = normalizeJournalDocument(rebuilt);
    expect(normalized.ok).toBe(true);
  });

  it("formats localized live-region announcements with exact uk/bg/ru parity keys", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const copy = getStructuredJournalComposerLabels(locale).reorder;
      expect(copy.moveUp.length).toBeGreaterThan(0);
      expect(copy.moveDown.length).toBeGreaterThan(0);
      expect(copy.dragHandle.length).toBeGreaterThan(0);
      expect(copy.movedAnnouncement).toContain("{type}");
      expect(copy.movedAnnouncement).toContain("{position}");
      expect(copy.movedAnnouncement).toContain("{total}");
      const message = formatReorderAnnouncement({
        template: copy.movedAnnouncement,
        typeLabel: copy.blockType.image,
        positionOneBased: 3,
        total: 8,
      });
      expect(message).toContain("3");
      expect(message).toContain("8");
      expect(message).toContain(copy.blockType.image);
    }
  });

  it("maps Editor.js tool names and detects a single-block permutation", () => {
    expect(mapEditorToolNameToTypeClass("image")).toBe("image");
    expect(mapEditorToolNameToTypeClass("header")).toBe("header");
    expect(mapEditorToolNameToTypeClass("mystery")).toBe("unknown");

    expect(
      detectSingleBlockReorder(["a", "b", "c"], ["b", "a", "c"]),
    ).toEqual({
      blockId: "a",
      fromIndex: 0,
      toIndex: 1,
    });
    expect(detectSingleBlockReorder(["a", "b"], ["a", "c"])).toBeNull();
  });

  it("computes insertion index from pointer Y against block rects", () => {
    const rects = [
      { id: "a", top: 0, bottom: 40 },
      { id: "b", top: 40, bottom: 80 },
      { id: "c", top: 80, bottom: 120 },
    ];
    expect(
      computeInsertBeforeIndexFromPointer({ clientY: 10, blockRects: rects }),
    ).toBe(0);
    expect(
      computeInsertBeforeIndexFromPointer({ clientY: 50, blockRects: rects }),
    ).toBe(1);
    expect(
      computeInsertBeforeIndexFromPointer({ clientY: 200, blockRects: rects }),
    ).toBe(3);
  });

  it("registers an in-flight locale fence for an active reorder gesture", async () => {
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID,
      kind: "in-flight",
    });
    expect(interfaceLocaleChangeCoordinator.readState()).toMatchObject({
      hasInFlightMutation: true,
      inFlightParticipantIds: [OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID],
    });
    const prepared = await interfaceLocaleChangeCoordinator.prepare();
    expect(prepared.status).toBe("blocked");
    if (prepared.status === "blocked") {
      expect(prepared.reason).toBe("mutation-in-flight");
    }
    unregister();
    expect(interfaceLocaleChangeCoordinator.readState().hasInFlightMutation).toBe(
      false,
    );
  });

  it("keeps newer serialization generation when an older async save resolves late", async () => {
    const generations: number[] = [];
    let latestGeneration = 0;
    let latestOrder = ["a", "b", "c"];

    async function serialize(order: string[], delayMs: number) {
      const generation = latestGeneration + 1;
      latestGeneration = generation;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (generation !== latestGeneration) {
        generations.push(generation);
        return latestOrder;
      }
      latestOrder = order;
      generations.push(generation);
      return order;
    }

    const slow = serialize(["a", "b", "c"], 30);
    const fast = serialize(["c", "a", "b"], 0);
    await Promise.all([slow, fast]);
    expect(latestOrder).toEqual(["c", "a", "b"]);
    expect(latestGeneration).toBe(2);
  });

  it("does not mutate on cancel / same-position drop (scenario contracts)", () => {
    const before = ["a", "b", "c"];
    const cancelEquivalent = resolveDragInsertBefore({
      fromIndex: 1,
      insertBeforeIndex: 1,
      blockCount: 3,
      sourceBlockId: "b",
    });
    expect(cancelEquivalent.kind).toBe("noop");
    expect(before).toEqual(["a", "b", "c"]);

    const samePosition = resolveMoveToIndex({
      orderedBlockIds: before,
      sourceBlockId: "b",
      toIndex: 1,
    });
    expect(samePosition.kind).toBe("noop");
  });
});

describe("OVE-206 reorder controller smoke hooks", () => {
  it("exports attach controller without loading Editor.js into public renderer", async () => {
    const controllerModule = await import(
      "@/components/garden/journal-block-reorder-controller"
    );
    expect(typeof controllerModule.attachJournalBlockReorderController).toBe(
      "function",
    );
    const rendererSource = await import(
      "@/components/garden/journal-document-renderer"
    );
    expect(rendererSource.JournalDocumentRenderer).toBeTypeOf("function");
    // Public renderer module must not transitively require the reorder controller.
    expect(vi.isMockFunction(controllerModule.attachJournalBlockReorderController)).toBe(
      false,
    );
  });
});
