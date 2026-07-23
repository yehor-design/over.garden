/**
 * OVE-202 structured journal composer smoke.
 * Proves document contract, adapter round-trip, media limit, and package pins
 * without requiring a live browser session.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  editorOutputToJournalDocumentV1,
  journalDocumentV1ToEditorOutput,
} from "../src/lib/garden/journal-document-editor-adapter";
import {
  JOURNAL_DOCUMENT_SCHEMA_VERSION,
  MAX_JOURNAL_INLINE_IMAGES,
  journalDocumentImageCount,
  normalizeJournalDocument,
  semanticJournalDocumentHash,
  type JournalDocumentV1,
} from "../src/lib/garden/journal-document";
import { isStructuredJournalAuthoringEnabled } from "../src/server/structured-journal-authoring";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = require(path.join(root, "..", "package.json")) as {
  dependencies?: Record<string, string>;
};

const REQUIRED_PACKAGES: Record<string, string> = {
  "@editorjs/editorjs": "2.31.6",
  "@editorjs/header": "2.8.9",
  "@editorjs/list": "2.0.9",
  "@editorjs/quote": "2.7.6",
  "@editorjs/delimiter": "1.4.2",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  assert(
    isStructuredJournalAuthoringEnabled({
      ...process.env,
    }),
    "Structured authoring must default enabled.",
  );

  for (const [name, version] of Object.entries(REQUIRED_PACKAGES)) {
    const installed = pkg.dependencies?.[name];
    assert(
      installed === version,
      `${name} must be pinned to ${version}, found ${installed ?? "missing"}`,
    );
  }

  const mediaIds = Array.from({ length: MAX_JOURNAL_INLINE_IMAGES }, (_, i) =>
    `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );

  const document: JournalDocumentV1 = {
    schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
    blocks: [
      {
        id: "p1",
        type: "paragraph",
        spans: [{ text: "Полив сьогодні", marks: [{ type: "bold" }] }],
      },
      ...mediaIds.map((mediaAssetId, index) => ({
        id: `img-${index + 1}`,
        type: "image" as const,
        mediaAssetId,
      })),
    ],
  };

  const normalized = normalizeJournalDocument(document);
  assert(normalized.ok, "Document must normalize");
  assert(
    journalDocumentImageCount(normalized.document) === MAX_JOURNAL_INLINE_IMAGES,
    "Expected ten inline images",
  );

  const editor = journalDocumentV1ToEditorOutput(normalized.document);
  const roundTrip = editorOutputToJournalDocumentV1(editor);
  assert(
    semanticJournalDocumentHash(roundTrip) ===
      semanticJournalDocumentHash(normalized.document),
    "Editor adapter round-trip must preserve semantic hash",
  );

  const eleventh = normalizeJournalDocument({
    schemaVersion: 1,
    blocks: [
      ...document.blocks,
      {
        id: "img-11",
        type: "image",
        mediaAssetId: "00000000-0000-4000-8000-000000000099",
      },
    ],
  });
  assert(!eleventh.ok, "Eleventh image must fail closed");
  assert(
    !eleventh.ok && eleventh.code === "too_many_images",
    "Eleventh image must fail closed",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        issue: "OVE-202",
        schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
        inlineImages: MAX_JOURNAL_INLINE_IMAGES,
        packages: REQUIRED_PACKAGES,
        semanticHash: semanticJournalDocumentHash(normalized.document),
      },
      null,
      2,
    ),
  );
}

main();
