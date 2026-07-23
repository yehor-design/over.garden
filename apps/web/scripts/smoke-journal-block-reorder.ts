/**
 * OVE-206 accessible journal block reorder smoke.
 * Proves move resolution, 100-block/10-image identity, cancel/noop, copy parity,
 * and that the public renderer module does not import Editor.js or reorder chrome.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID,
  OVE_206_BROWSER_SCENARIO_IDS,
  OVE_206_PRIMARY_BROWSER_SCENARIO_ID,
  applyMoveToOrderedIds,
  resolveDragInsertBefore,
  resolveMoveByOffset,
} from "../src/components/garden/journal-block-reorder";
import {
  JOURNAL_DOCUMENT_SCHEMA_VERSION,
  MAX_JOURNAL_DOCUMENT_BLOCKS,
  MAX_JOURNAL_INLINE_IMAGES,
  normalizeJournalDocument,
  semanticJournalDocumentHash,
  type JournalDocumentV1,
} from "../src/lib/garden/journal-document";
import {
  editorOutputToJournalDocumentV1,
  journalDocumentV1ToEditorOutput,
} from "../src/lib/garden/journal-document-editor-adapter";
import { getStructuredJournalComposerLabels } from "../src/lib/structured-journal-composer-copy";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(root, "..");
const pkg = require(path.join(webRoot, "package.json")) as {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  assert(
    pkg.scripts?.["smoke:journal-block-reorder"]?.includes(
      "smoke-journal-block-reorder.ts",
    ),
    "package.json must expose smoke:journal-block-reorder",
  );
  assert(
    pkg.dependencies?.["@editorjs/editorjs"] === "2.31.6",
    "@editorjs/editorjs must stay pinned at 2.31.6",
  );
  assert(
    OVE_206_PRIMARY_BROWSER_SCENARIO_ID === "pointer-commit-immediate-transition",
    "Primary OVE-206 browser scenario mismatch",
  );
  assert(
    OVE_206_BROWSER_SCENARIO_IDS.length === 8,
    "OVE-206 mandatory browser scenarios must stay complete",
  );
  assert(
    OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID ===
      "owner-composer-reorder-gesture",
    "Locale in-flight participant id mismatch",
  );

  for (const locale of ["uk", "bg", "ru"] as const) {
    const reorder = getStructuredJournalComposerLabels(locale).reorder;
    assert(reorder.moveUp && reorder.moveDown && reorder.dragHandle, locale);
    assert(reorder.movedAnnouncement.includes("{position}"), locale);
  }

  const ids = ["a", "b", "c", "d"];
  const drag = resolveDragInsertBefore({
    fromIndex: 0,
    insertBeforeIndex: 4,
    blockCount: 4,
    sourceBlockId: "a",
  });
  assert(drag.kind === "move", "drag commit expected");
  const afterDrag = applyMoveToOrderedIds(ids, drag);
  assert(
    afterDrag.join(",") === "b,c,d,a",
    `unexpected drag order ${afterDrag.join(",")}`,
  );

  const keyboard = resolveMoveByOffset({
    orderedBlockIds: ids,
    sourceBlockId: "a",
    delta: 1,
  });
  assert(keyboard.kind === "move", "keyboard commit expected");
  assert(
    applyMoveToOrderedIds(ids, keyboard).join(",") === "b,a,c,d",
    "keyboard move mismatch",
  );

  const noop = resolveDragInsertBefore({
    fromIndex: 1,
    insertBeforeIndex: 2,
    blockCount: 4,
    sourceBlockId: "b",
  });
  assert(noop.kind === "noop", "same-position drop must be noop");

  const blocks: JournalDocumentV1["blocks"] = [];
  for (let i = 0; i < MAX_JOURNAL_DOCUMENT_BLOCKS; i += 1) {
    if (i < MAX_JOURNAL_INLINE_IMAGES) {
      blocks.push({
        id: `img-${i + 1}`,
        type: "image",
        mediaAssetId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      });
    } else if (i % 5 === 0) {
      blocks.push({
        id: `h-${i + 1}`,
        type: "heading",
        level: 2,
        spans: [{ text: `H ${i + 1}` }],
      });
    } else {
      blocks.push({
        id: `p-${i + 1}`,
        type: "paragraph",
        spans: [{ text: `P ${i + 1}` }],
      });
    }
  }

  let order = blocks.map((block) => block.id);
  const firstImageCommit = resolveMoveByOffset({
    orderedBlockIds: order,
    sourceBlockId: "img-1",
    delta: 1,
  });
  assert(firstImageCommit.kind === "move", "image move required");
  order = applyMoveToOrderedIds(order, firstImageCommit);

  const document: JournalDocumentV1 = {
    schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
    blocks: order.map((id) => blocks.find((block) => block.id === id)!),
  };
  const normalized = normalizeJournalDocument(document);
  assert(normalized.ok, "100-block document must normalize");
  const editor = journalDocumentV1ToEditorOutput(normalized.document);
  const roundTrip = editorOutputToJournalDocumentV1(editor);
  assert(
    semanticJournalDocumentHash(roundTrip) ===
      semanticJournalDocumentHash(normalized.document),
    "Reorder round-trip must preserve semantic hash",
  );
  assert(
    roundTrip.blocks.filter((block) => block.type === "image").length ===
      MAX_JOURNAL_INLINE_IMAGES,
    "Ten inline images must survive reorder",
  );

  const publicRenderer = readFileSync(
    path.join(webRoot, "src/components/garden/journal-document-renderer.tsx"),
    "utf8",
  );
  assert(
    !publicRenderer.includes("@editorjs") &&
      !publicRenderer.includes("journal-block-reorder"),
    "Public renderer must not import Editor.js or reorder chrome",
  );

  const composer = readFileSync(
    path.join(webRoot, "src/components/garden/structured-journal-composer.tsx"),
    "utf8",
  );
  assert(
    composer.includes("attachJournalBlockReorderController"),
    "Owner composer must attach reorder controller",
  );
  assert(
    composer.includes('blocks.move'),
    "Owner composer must commit via blocks.move",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        issue: "OVE-206",
        primaryScenario: OVE_206_PRIMARY_BROWSER_SCENARIO_ID,
        scenarios: OVE_206_BROWSER_SCENARIO_IDS,
        blocks: MAX_JOURNAL_DOCUMENT_BLOCKS,
        inlineImages: MAX_JOURNAL_INLINE_IMAGES,
        semanticHash: semanticJournalDocumentHash(normalized.document),
        inFlightParticipantId: OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID,
      },
      null,
      2,
    ),
  );
}

main();
