/**
 * Application-owned JournalDocumentV1 contract (OVE-202).
 * Editor engine state is transient UI state and is never the persistence boundary.
 */

export const JOURNAL_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_JOURNAL_DOCUMENT_SCHEMA_VERSIONS = [1] as const;

export const MAX_JOURNAL_INLINE_IMAGES = 10;
export const MAX_JOURNAL_DOCUMENT_BYTES = 64 * 1024;
export const MAX_JOURNAL_DOCUMENT_BLOCKS = 100;
export const MAX_JOURNAL_PLAIN_TEXT_CHARS = 20_000;
export const MAX_JOURNAL_LIST_DEPTH = 2;
export const MAX_JOURNAL_LINK_CHARS = 2048;
export const MAX_JOURNAL_BLOCK_ID_CHARS = 64;
export const JOURNAL_BLOCK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_JOURNAL_MEDIA_ALT_CHARS = 300;
export const MAX_JOURNAL_MEDIA_CAPTION_CHARS = 500;
export type JournalInlineMarkType = "bold" | "italic" | "link";

export interface JournalTextSpan {
  text: string;
  marks?: JournalInlineMark[];
}

export interface JournalBoldMark {
  type: "bold";
}

export interface JournalItalicMark {
  type: "italic";
}

export interface JournalLinkMark {
  type: "link";
  href: string;
}

export type JournalInlineMark =
  | JournalBoldMark
  | JournalItalicMark
  | JournalLinkMark;

export interface JournalParagraphBlock {
  id: string;
  type: "paragraph";
  spans: JournalTextSpan[];
}

export interface JournalHeadingBlock {
  id: string;
  type: "heading";
  level: 2 | 3;
  spans: JournalTextSpan[];
}

export interface JournalListItem {
  spans: JournalTextSpan[];
  items?: JournalListItem[];
}

export interface JournalListBlock {
  id: string;
  type: "list";
  style: "unordered" | "ordered";
  items: JournalListItem[];
}

export interface JournalQuoteBlock {
  id: string;
  type: "quote";
  spans: JournalTextSpan[];
  attributionSpans?: JournalTextSpan[];
}

export interface JournalDelimiterBlock {
  id: string;
  type: "delimiter";
}

export interface JournalImageBlock {
  id: string;
  type: "image";
  mediaAssetId: string;
}

export type JournalDocumentBlock =
  | JournalParagraphBlock
  | JournalHeadingBlock
  | JournalListBlock
  | JournalQuoteBlock
  | JournalDelimiterBlock
  | JournalImageBlock;

export interface JournalDocumentV1 {
  schemaVersion: typeof JOURNAL_DOCUMENT_SCHEMA_VERSION;
  blocks: JournalDocumentBlock[];
}

export type JournalDocumentNormalizeResult =
  | { ok: true; document: JournalDocumentV1 }
  | { ok: false; error: string; code: JournalDocumentErrorCode };

export type JournalDocumentErrorCode =
  | "invalid_shape"
  | "unsupported_version"
  | "oversized"
  | "too_many_blocks"
  | "too_many_images"
  | "duplicate_block_id"
  | "invalid_block_id"
  | "invalid_block"
  | "unsafe_link"
  | "plain_text_too_long"
  | "empty_document"
  | "duplicate_media"
  | "unknown_field";

export class JournalDocumentValidationError extends Error {
  readonly code: JournalDocumentErrorCode;

  constructor(code: JournalDocumentErrorCode, message: string) {
    super(message);
    this.name = "JournalDocumentValidationError";
    this.code = code;
  }
}

export function isSupportedJournalDocumentSchemaVersion(
  version: unknown,
): version is (typeof SUPPORTED_JOURNAL_DOCUMENT_SCHEMA_VERSIONS)[number] {
  return (
    typeof version === "number" &&
    (SUPPORTED_JOURNAL_DOCUMENT_SCHEMA_VERSIONS as readonly number[]).includes(
      version,
    )
  );
}

export function createEmptyJournalDocument(): JournalDocumentV1 {
  return {
    schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
    blocks: [],
  };
}

export function legacyBodyToJournalDocumentV1(body: string): JournalDocumentV1 {
  const text = body.normalize("NFC").replace(/\r\n/g, "\n").trimEnd();
  if (!text.trim()) {
    return createEmptyJournalDocument();
  }

  const paragraphs = text.split(/\n{2,}/);
  const blocks: JournalDocumentBlock[] = paragraphs.map((paragraph, index) => {
    const spans = softBreakSpans(paragraph.replace(/^\n+|\n+$/g, ""));
    return {
      id: `legacy-p-${index + 1}`,
      type: "paragraph",
      spans: spans.length > 0 ? spans : [{ text: "" }],
    };
  });

  const normalized = normalizeJournalDocument({
    schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
    blocks,
  });
  if (normalized.ok) {
    return normalized.document;
  }

  return {
    schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
    blocks: [
      {
        id: "legacy-p-1",
        type: "paragraph",
        spans: [{ text: text.slice(0, MAX_JOURNAL_PLAIN_TEXT_CHARS) }],
      },
    ],
  };
}

export function normalizeJournalDocument(
  input: unknown,
): JournalDocumentNormalizeResult {
  try {
    const document = normalizeJournalDocumentOrThrow(input);
    return { ok: true, document };
  } catch (error) {
    if (error instanceof JournalDocumentValidationError) {
      return { ok: false, error: error.message, code: error.code };
    }
    return {
      ok: false,
      error: "Document is invalid.",
      code: "invalid_shape",
    };
  }
}

export function normalizeJournalDocumentOrThrow(
  input: unknown,
): JournalDocumentV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new JournalDocumentValidationError(
      "invalid_shape",
      "Document must be an object.",
    );
  }

  const record = input as Record<string, unknown>;
  const allowedRootKeys = new Set(["schemaVersion", "blocks"]);
  for (const key of Object.keys(record)) {
    if (!allowedRootKeys.has(key)) {
      throw new JournalDocumentValidationError(
        "unknown_field",
        `Unknown document field: ${key}.`,
      );
    }
  }

  if (!isSupportedJournalDocumentSchemaVersion(record.schemaVersion)) {
    throw new JournalDocumentValidationError(
      "unsupported_version",
      "Unsupported journal document schema version.",
    );
  }

  if (!Array.isArray(record.blocks)) {
    throw new JournalDocumentValidationError(
      "invalid_shape",
      "Document blocks must be an array.",
    );
  }

  if (record.blocks.length > MAX_JOURNAL_DOCUMENT_BLOCKS) {
    throw new JournalDocumentValidationError(
      "too_many_blocks",
      `Document may contain at most ${MAX_JOURNAL_DOCUMENT_BLOCKS} blocks.`,
    );
  }

  const seenIds = new Set<string>();
  const seenMedia = new Set<string>();
  const blocks: JournalDocumentBlock[] = [];

  for (const rawBlock of record.blocks) {
    const block = normalizeBlock(rawBlock, seenIds, seenMedia);
    blocks.push(block);
  }

  const document: JournalDocumentV1 = {
    schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
    blocks,
  };

  const serialized = stableSerializeJournalDocument(document);
  if (byteLengthUtf8(serialized) > MAX_JOURNAL_DOCUMENT_BYTES) {
    throw new JournalDocumentValidationError(
      "oversized",
      `Document exceeds ${MAX_JOURNAL_DOCUMENT_BYTES} bytes.`,
    );
  }

  const plainText = extractJournalDocumentPlainText(document);
  if (plainText.length > MAX_JOURNAL_PLAIN_TEXT_CHARS) {
    throw new JournalDocumentValidationError(
      "plain_text_too_long",
      `Derived plain text exceeds ${MAX_JOURNAL_PLAIN_TEXT_CHARS} characters.`,
    );
  }

  return document;
}

export function assertMeaningfulJournalDocument(
  document: JournalDocumentV1,
): void {
  if (!journalDocumentHasMeaningfulBody(document)) {
    throw new JournalDocumentValidationError(
      "empty_document",
      "Entry needs meaningful text or a photo with a caption.",
    );
  }
}

export function journalDocumentHasMeaningfulBody(
  document: JournalDocumentV1,
  options: { imageCaptionByMediaId?: ReadonlyMap<string, string | null> } = {},
): boolean {
  for (const block of document.blocks) {
    switch (block.type) {
      case "paragraph":
      case "heading":
        if (spansHaveMeaningfulText(block.spans)) return true;
        break;
      case "quote":
        if (
          spansHaveMeaningfulText(block.spans) ||
          spansHaveMeaningfulText(block.attributionSpans ?? [])
        ) {
          return true;
        }
        break;
      case "list":
        if (listItemsHaveMeaningfulText(block.items)) return true;
        break;
      case "image": {
        const caption = options.imageCaptionByMediaId?.get(block.mediaAssetId);
        if (typeof caption === "string" && caption.trim().length > 0) {
          return true;
        }
        // Image alone is not enough without caption for body presence when
        // captions are known; when captions are unknown (client draft), treat
        // a referenced image as meaningful so create can proceed after claim.
        if (!options.imageCaptionByMediaId) return true;
        break;
      }
      case "delimiter":
        break;
      default: {
        const _exhaustive: never = block;
        void _exhaustive;
        break;
      }
    }
  }
  return false;
}

export function extractJournalDocumentPlainText(
  document: JournalDocumentV1,
  options: {
    imageCaptionByMediaId?: ReadonlyMap<string, string | null>;
    includeImageCaptions?: boolean;
  } = {},
): string {
  const includeCaptions = options.includeImageCaptions !== false;
  const parts: string[] = [];

  for (const block of document.blocks) {
    switch (block.type) {
      case "paragraph":
      case "heading":
        parts.push(spansToPlainText(block.spans));
        break;
      case "quote": {
        const quote = spansToPlainText(block.spans);
        const attribution = spansToPlainText(block.attributionSpans ?? []);
        parts.push(attribution ? `${quote}\n${attribution}` : quote);
        break;
      }
      case "list":
        parts.push(listItemsToPlainText(block.items));
        break;
      case "image":
        if (includeCaptions) {
          const caption = options.imageCaptionByMediaId?.get(
            block.mediaAssetId,
          );
          if (typeof caption === "string" && caption.trim()) {
            parts.push(caption.trim());
          }
        }
        break;
      case "delimiter":
        parts.push("");
        break;
      default: {
        const _exhaustive: never = block;
        void _exhaustive;
        break;
      }
    }
  }

  return parts
    .map((part) => part.replace(/[ \t]+\n/g, "\n").trimEnd())
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function listJournalDocumentImageMediaIds(
  document: JournalDocumentV1,
): string[] {
  const ids: string[] = [];
  for (const block of document.blocks) {
    if (block.type === "image") {
      ids.push(block.mediaAssetId);
    }
  }
  return ids;
}

export function remapJournalDocumentMediaAssetIds(
  document: JournalDocumentV1,
  mediaIdMap: ReadonlyMap<string, string>,
): JournalDocumentV1 {
  if (mediaIdMap.size === 0) return document;
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.type !== "image") return block;
      const nextId = mediaIdMap.get(block.mediaAssetId);
      return nextId ? { ...block, mediaAssetId: nextId } : block;
    }),
  };
}

export function journalDocumentImageCount(document: JournalDocumentV1): number {
  return listJournalDocumentImageMediaIds(document).length;
}

export function journalDocumentHasFormatting(
  document: JournalDocumentV1,
): boolean {
  for (const block of document.blocks) {
    switch (block.type) {
      case "heading":
      case "list":
      case "quote":
      case "delimiter":
        return true;
      case "paragraph":
        if (spansHaveMarks(block.spans)) return true;
        break;
      case "image":
        break;
      default: {
        const _exhaustive: never = block;
        void _exhaustive;
        break;
      }
    }
  }
  return false;
}

export function photoCountBucket(
  count: number,
): "none" | "one" | "two_to_three" | "four_to_six" | "seven_to_ten" {
  if (count <= 0) return "none";
  if (count === 1) return "one";
  if (count <= 3) return "two_to_three";
  if (count <= 6) return "four_to_six";
  return "seven_to_ten";
}

export function blockCountBucket(
  count: number,
): "one" | "two_to_five" | "six_to_twenty" | "twenty_one_plus" {
  if (count <= 1) return "one";
  if (count <= 5) return "two_to_five";
  if (count <= 20) return "six_to_twenty";
  return "twenty_one_plus";
}

export function stableSerializeJournalDocument(
  document: JournalDocumentV1,
): string {
  return JSON.stringify(document);
}

export function semanticJournalDocumentHash(
  document: JournalDocumentV1,
): string {
  return fnv1aHex(stableSerializeJournalDocument(document));
}

export function compareMeaningfulBlockIds(
  liveMeaningfulIds: readonly string[],
  serializedDocument: JournalDocumentV1,
): { ok: true } | { ok: false; missingIds: string[] } {
  const serializedIds = new Set(
    serializedDocument.blocks
      .filter((block) => blockIsMeaningfulWithoutCaption(block))
      .map((block) => block.id),
  );
  const missingIds = liveMeaningfulIds.filter((id) => !serializedIds.has(id));
  if (missingIds.length > 0) {
    return { ok: false, missingIds };
  }
  return { ok: true };
}

function blockIsMeaningfulWithoutCaption(block: JournalDocumentBlock): boolean {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return spansHaveMeaningfulText(block.spans);
    case "quote":
      return (
        spansHaveMeaningfulText(block.spans) ||
        spansHaveMeaningfulText(block.attributionSpans ?? [])
      );
    case "list":
      return listItemsHaveMeaningfulText(block.items);
    case "image":
      return true;
    case "delimiter":
      return false;
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return false;
    }
  }
}

function normalizeBlock(
  input: unknown,
  seenIds: Set<string>,
  seenMedia: Set<string>,
): JournalDocumentBlock {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new JournalDocumentValidationError(
      "invalid_block",
      "Each block must be an object.",
    );
  }

  const record = input as Record<string, unknown>;
  const id = normalizeBlockId(record.id, seenIds);
  const type = record.type;

  switch (type) {
    case "paragraph":
      assertOnlyKeys(record, ["id", "type", "spans"]);
      return {
        id,
        type: "paragraph",
        spans: normalizeSpans(record.spans),
      };
    case "heading": {
      assertOnlyKeys(record, ["id", "type", "level", "spans"]);
      const level = record.level;
      if (level !== 2 && level !== 3) {
        throw new JournalDocumentValidationError(
          "invalid_block",
          "Heading level must be 2 or 3.",
        );
      }
      return {
        id,
        type: "heading",
        level,
        spans: normalizeSpans(record.spans),
      };
    }
    case "list": {
      assertOnlyKeys(record, ["id", "type", "style", "items"]);
      const style = record.style;
      if (style !== "unordered" && style !== "ordered") {
        throw new JournalDocumentValidationError(
          "invalid_block",
          "List style must be unordered or ordered.",
        );
      }
      return {
        id,
        type: "list",
        style,
        items: normalizeListItems(record.items, 1),
      };
    }
    case "quote": {
      assertOnlyKeys(record, ["id", "type", "spans", "attributionSpans"]);
      const attributionSpans =
        record.attributionSpans === undefined
          ? undefined
          : normalizeSpans(record.attributionSpans);
      return {
        id,
        type: "quote",
        spans: normalizeSpans(record.spans),
        ...(attributionSpans && attributionSpans.length > 0
          ? { attributionSpans }
          : {}),
      };
    }
    case "delimiter":
      assertOnlyKeys(record, ["id", "type"]);
      return { id, type: "delimiter" };
    case "image": {
      assertOnlyKeys(record, ["id", "type", "mediaAssetId"]);
      const mediaAssetId = normalizeUuid(record.mediaAssetId, "mediaAssetId");
      if (seenMedia.has(mediaAssetId)) {
        throw new JournalDocumentValidationError(
          "duplicate_media",
          "Each media asset may appear at most once.",
        );
      }
      if (seenMedia.size >= MAX_JOURNAL_INLINE_IMAGES) {
        throw new JournalDocumentValidationError(
          "too_many_images",
          `Document may contain at most ${MAX_JOURNAL_INLINE_IMAGES} inline images.`,
        );
      }
      seenMedia.add(mediaAssetId);
      return { id, type: "image", mediaAssetId };
    }
    default:
      throw new JournalDocumentValidationError(
        "invalid_block",
        "Unknown or disallowed block type.",
      );
  }
}

function normalizeBlockId(value: unknown, seenIds: Set<string>): string {
  if (typeof value !== "string" || !JOURNAL_BLOCK_ID_PATTERN.test(value)) {
    throw new JournalDocumentValidationError(
      "invalid_block_id",
      "Block id must match [A-Za-z0-9_-]{1,64}.",
    );
  }
  if (seenIds.has(value)) {
    throw new JournalDocumentValidationError(
      "duplicate_block_id",
      "Block ids must be unique within a document.",
    );
  }
  seenIds.add(value);
  return value;
}

function normalizeSpans(value: unknown): JournalTextSpan[] {
  if (!Array.isArray(value)) {
    throw new JournalDocumentValidationError(
      "invalid_block",
      "Text spans must be an array.",
    );
  }
  return value.map((span) => normalizeSpan(span));
}

function normalizeSpan(value: unknown): JournalTextSpan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JournalDocumentValidationError(
      "invalid_block",
      "Each text span must be an object.",
    );
  }
  const record = value as Record<string, unknown>;
  assertOnlyKeys(record, ["text", "marks"]);
  if (typeof record.text !== "string") {
    throw new JournalDocumentValidationError(
      "invalid_block",
      "Text span text must be a string.",
    );
  }
  const text = record.text.normalize("NFC").replace(/\r\n/g, "\n");
  if (text.includes("\0")) {
    throw new JournalDocumentValidationError(
      "invalid_block",
      "Text may not contain null bytes.",
    );
  }
  const marks =
    record.marks === undefined ? undefined : normalizeMarks(record.marks);
  return marks && marks.length > 0 ? { text, marks } : { text };
}

function normalizeMarks(value: unknown): JournalInlineMark[] {
  if (!Array.isArray(value)) {
    throw new JournalDocumentValidationError(
      "invalid_block",
      "Marks must be an array.",
    );
  }
  const marks: JournalInlineMark[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const mark = normalizeMark(raw);
    const key = mark.type === "link" ? `link:${mark.href}` : mark.type;
    if (seen.has(key)) continue;
    seen.add(key);
    marks.push(mark);
  }
  return marks;
}

function normalizeMark(value: unknown): JournalInlineMark {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JournalDocumentValidationError(
      "invalid_block",
      "Each mark must be an object.",
    );
  }
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case "bold":
      assertOnlyKeys(record, ["type"]);
      return { type: "bold" };
    case "italic":
      assertOnlyKeys(record, ["type"]);
      return { type: "italic" };
    case "link": {
      assertOnlyKeys(record, ["type", "href"]);
      return { type: "link", href: normalizeSafeHref(record.href) };
    }
    default:
      throw new JournalDocumentValidationError(
        "invalid_block",
        "Unknown or disallowed mark type.",
      );
  }
}

function normalizeListItems(value: unknown, depth: number): JournalListItem[] {
  if (depth > MAX_JOURNAL_LIST_DEPTH) {
    throw new JournalDocumentValidationError(
      "invalid_block",
      `List nesting may not exceed depth ${MAX_JOURNAL_LIST_DEPTH}.`,
    );
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new JournalDocumentValidationError(
      "invalid_block",
      "List items must be a non-empty array.",
    );
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new JournalDocumentValidationError(
        "invalid_block",
        "Each list item must be an object.",
      );
    }
    const record = item as Record<string, unknown>;
    assertOnlyKeys(record, ["spans", "items"]);
    const spans = normalizeSpans(record.spans);
    const nested =
      record.items === undefined
        ? undefined
        : normalizeListItems(record.items, depth + 1);
    return nested && nested.length > 0 ? { spans, items: nested } : { spans };
  });
}

export function normalizeSafeHref(value: unknown): string {
  if (typeof value !== "string") {
    throw new JournalDocumentValidationError(
      "unsafe_link",
      "Link href must be a string.",
    );
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_JOURNAL_LINK_CHARS) {
    throw new JournalDocumentValidationError(
      "unsafe_link",
      "Link href length is invalid.",
    );
  }
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    throw new JournalDocumentValidationError(
      "unsafe_link",
      "Link href contains control characters.",
    );
  }

  if (trimmed.startsWith("/")) {
    if (
      trimmed.startsWith("//") ||
      trimmed.includes("\\") ||
      trimmed.includes(":")
    ) {
      throw new JournalDocumentValidationError(
        "unsafe_link",
        "Internal link path is unsafe.",
      );
    }
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new JournalDocumentValidationError(
      "unsafe_link",
      "Link href is not a valid URL.",
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new JournalDocumentValidationError(
      "unsafe_link",
      "Only http, https, or internal paths are allowed.",
    );
  }

  if (url.username || url.password) {
    throw new JournalDocumentValidationError(
      "unsafe_link",
      "Link credentials are not allowed.",
    );
  }

  return url.toString();
}

function normalizeUuid(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new JournalDocumentValidationError(
      "invalid_block",
      `${field} must be a UUID.`,
    );
  }
  return value.toLowerCase();
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new JournalDocumentValidationError(
        "unknown_field",
        `Unknown field: ${key}.`,
      );
    }
  }
}

function softBreakSpans(text: string): JournalTextSpan[] {
  if (!text.includes("\n")) {
    return [{ text }];
  }
  const lines = text.split("\n");
  const spans: JournalTextSpan[] = [];
  lines.forEach((line, index) => {
    spans.push({ text: line });
    if (index < lines.length - 1) {
      spans.push({ text: "\n" });
    }
  });
  return spans;
}

function spansHaveMeaningfulText(spans: readonly JournalTextSpan[]): boolean {
  return spansToPlainText(spans).trim().length > 0;
}

function spansHaveMarks(spans: readonly JournalTextSpan[]): boolean {
  return spans.some((span) => (span.marks?.length ?? 0) > 0);
}

function spansToPlainText(spans: readonly JournalTextSpan[]): string {
  return spans.map((span) => span.text).join("");
}

function listItemsHaveMeaningfulText(
  items: readonly JournalListItem[],
): boolean {
  for (const item of items) {
    if (spansHaveMeaningfulText(item.spans)) return true;
    if (item.items && listItemsHaveMeaningfulText(item.items)) return true;
  }
  return false;
}

function listItemsToPlainText(items: readonly JournalListItem[]): string {
  return items
    .map((item) => {
      const line = spansToPlainText(item.spans);
      const nested = item.items ? listItemsToPlainText(item.items) : "";
      return nested ? `${line}\n${nested}` : line;
    })
    .join("\n");
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}

function fnv1aHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
