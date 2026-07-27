/**
 * OVE-234 — structured journal traversal for the precise-location firewall.
 *
 * Every textual carrier of a `JournalDocumentV1` is checked individually
 * (spans, nested list items, quote attribution, link hrefs) and again as the
 * joined block text, so a coordinate cannot hide by being split across inline
 * marks. Traversal is read-only: the canonical document shape is never
 * rewritten by this module.
 */

import type {
  JournalDocumentBlock,
  JournalDocumentV1,
  JournalListItem,
  JournalTextSpan,
} from "@/lib/garden/journal-document";
import {
  assertNoPreciseLocationTextInValues,
  findPreciseLocationTextInValues,
  type PreciseLocationTextFinding,
  type PreciseLocationTextSurface,
} from "@/lib/privacy/precise-location-text";

function spanValues(spans: readonly JournalTextSpan[] | undefined): string[] {
  if (!spans?.length) return [];
  const values: string[] = [];
  for (const span of spans) {
    if (typeof span?.text === "string") values.push(span.text);
    for (const mark of span?.marks ?? []) {
      if (mark.type === "link" && typeof mark.href === "string") {
        values.push(mark.href);
      }
    }
  }
  // The joined form catches coordinates split across bold/italic/link spans.
  values.push(spans.map((span) => span?.text ?? "").join(""));
  return values;
}

function listItemValues(items: readonly JournalListItem[] | undefined) {
  const values: string[] = [];
  for (const item of items ?? []) {
    values.push(...spanValues(item?.spans));
    values.push(...listItemValues(item?.items));
  }
  return values;
}

function blockValues(block: JournalDocumentBlock): string[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return spanValues(block.spans);
    case "quote":
      return [
        ...spanValues(block.spans),
        ...spanValues(block.attributionSpans),
      ];
    case "list":
      return listItemValues(block.items);
    default:
      return [];
  }
}

/** Every textual value carried by the document, in document order. */
export function listJournalDocumentTextValues(
  document: JournalDocumentV1,
): string[] {
  const values: string[] = [];
  for (const block of document.blocks ?? []) {
    values.push(...blockValues(block));
  }
  return values;
}

export function findPreciseLocationInJournalDocument(
  document: JournalDocumentV1,
): PreciseLocationTextFinding | null {
  return findPreciseLocationTextInValues(
    listJournalDocumentTextValues(document),
  );
}

export function assertNoPreciseLocationInJournalDocument(
  document: JournalDocumentV1,
  surface: PreciseLocationTextSurface = "journal_document",
): void {
  assertNoPreciseLocationTextInValues(
    listJournalDocumentTextValues(document),
    surface,
  );
}
