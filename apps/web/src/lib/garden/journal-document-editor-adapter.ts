/**
 * Editor.js <-> JournalDocumentV1 adapters (OVE-202).
 * Editor.js output is untrusted transient UI state.
 */

import {
  JOURNAL_DOCUMENT_SCHEMA_VERSION,
  MAX_JOURNAL_LIST_DEPTH,
  normalizeJournalDocumentOrThrow,
  normalizeSafeHref,
  type JournalDocumentBlock,
  type JournalDocumentV1,
  type JournalInlineMark,
  type JournalListItem,
  type JournalTextSpan,
} from "./journal-document";

export interface EditorJsOutputData {
  time?: number;
  version?: string;
  blocks: EditorJsBlock[];
}

export interface EditorJsBlock {
  id?: string;
  type: string;
  data: Record<string, unknown>;
}

export interface EditorTransientImageUrlByMediaId {
  get(mediaAssetId: string): string | undefined;
}

export interface EditorOutputConversionOptions {
  /**
   * When true, empty formatting shells are kept so the live editor can round-trip.
   * Server persistence should leave this false and rely on normalize + meaningful checks.
   */
  retainEmptyShells?: boolean;
}

export function editorOutputToJournalDocumentV1(
  output: unknown,
  options: EditorOutputConversionOptions = {},
): JournalDocumentV1 {
  const blocks = extractEditorBlocks(output).map((block, index) =>
    editorBlockToJournalBlock(block, index, options),
  );
  return normalizeJournalDocumentOrThrow({
    schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
    blocks: blocks.filter((block): block is JournalDocumentBlock => block !== null),
  });
}

export function journalDocumentV1ToEditorOutput(
  document: JournalDocumentV1,
  imageUrls?: EditorTransientImageUrlByMediaId,
): EditorJsOutputData {
  return {
    blocks: document.blocks.map((block) =>
      journalBlockToEditorBlock(block, imageUrls),
    ),
  };
}

export function parseInlineHtmlToSpans(html: string): JournalTextSpan[] {
  const normalized = html.normalize("NFC").replace(/\r\n/g, "\n");
  if (!normalized) return [{ text: "" }];
  if (!/[<>]/.test(normalized)) {
    return [{ text: decodeBasicEntities(normalized) }];
  }

  // Minimal deterministic HTML subset parser for Editor.js inline tool output.
  // Rejects scripts/styles/event handlers by ignoring unknown tags/attrs.
  const spans: JournalTextSpan[] = [];
  const markStack: JournalInlineMark[] = [];
  const tagPattern =
    /<\/?([a-zA-Z0-9]+)(\s+[^>]*)?>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(normalized)) !== null) {
    if (match[3] !== undefined) {
      const text = decodeBasicEntities(match[3]);
      if (!text) continue;
      spans.push({
        text,
        ...(markStack.length > 0
          ? { marks: dedupeMarks([...markStack]) }
          : {}),
      });
      continue;
    }

    const tag = match[1]?.toLowerCase() ?? "";
    const isClose = match[0].startsWith("</");
    if (tag === "br") {
      spans.push({
        text: "\n",
        ...(markStack.length > 0
          ? { marks: dedupeMarks([...markStack]) }
          : {}),
      });
      continue;
    }

    if (isClose) {
      popMark(markStack, tag);
      continue;
    }

    const attrs = match[2] ?? "";
    if (/\son[a-z]+\s*=/i.test(attrs) || /javascript:/i.test(attrs)) {
      continue;
    }

    if (tag === "b" || tag === "strong") {
      markStack.push({ type: "bold" });
    } else if (tag === "i" || tag === "em") {
      markStack.push({ type: "italic" });
    } else if (tag === "a") {
      const hrefMatch = attrs.match(
        /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
      );
      const rawHref = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3];
      if (!rawHref) continue;
      try {
        markStack.push({
          type: "link",
          href: normalizeSafeHref(decodeBasicEntities(rawHref)),
        });
      } catch {
        // Drop unsafe links; keep surrounding text.
      }
    }
  }

  return spans.length > 0 ? mergeAdjacentSpans(spans) : [{ text: "" }];
}

export function spansToEditorHtml(spans: readonly JournalTextSpan[]): string {
  return spans
    .map((span) => {
      let html = escapeHtml(span.text).replace(/\n/g, "<br>");
      const marks = span.marks ?? [];
      // Apply marks in stable order: link outermost, then italic, then bold.
      const ordered = [...marks].sort((a, b) => markRank(a) - markRank(b));
      for (const mark of ordered) {
        switch (mark.type) {
          case "bold":
            html = `<b>${html}</b>`;
            break;
          case "italic":
            html = `<i>${html}</i>`;
            break;
          case "link":
            html = `<a href="${escapeAttribute(mark.href)}">${html}</a>`;
            break;
          default: {
            const _exhaustive: never = mark;
            void _exhaustive;
            break;
          }
        }
      }
      return html;
    })
    .join("");
}

function extractEditorBlocks(output: unknown): EditorJsBlock[] {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("Editor output must be an object.");
  }
  const record = output as Record<string, unknown>;
  if (!Array.isArray(record.blocks)) {
    throw new Error("Editor output blocks must be an array.");
  }
  return record.blocks.map((block) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      throw new Error("Each editor block must be an object.");
    }
    const item = block as Record<string, unknown>;
    if (typeof item.type !== "string") {
      throw new Error("Editor block type is required.");
    }
    const data =
      item.data && typeof item.data === "object" && !Array.isArray(item.data)
        ? (item.data as Record<string, unknown>)
        : {};
    return {
      id: typeof item.id === "string" ? item.id : undefined,
      type: item.type,
      data,
    };
  });
}

function editorBlockToJournalBlock(
  block: EditorJsBlock,
  index: number,
  options: EditorOutputConversionOptions,
): JournalDocumentBlock | null {
  const id = block.id && block.id.trim() ? block.id : `block-${index + 1}`;

  switch (block.type) {
    case "paragraph": {
      const spans = parseInlineHtmlToSpans(asString(block.data.text));
      if (!options.retainEmptyShells && !spansToPlain(spans).trim()) {
        return null;
      }
      return { id, type: "paragraph", spans };
    }
    case "header": {
      const level = block.data.level;
      if (level !== 2 && level !== 3) {
        throw new Error("Only heading levels 2 and 3 are allowed.");
      }
      const spans = parseInlineHtmlToSpans(asString(block.data.text));
      if (!options.retainEmptyShells && !spansToPlain(spans).trim()) {
        return null;
      }
      return { id, type: "heading", level, spans };
    }
    case "list": {
      const style =
        block.data.style === "ordered"
          ? "ordered"
          : block.data.style === "unordered"
            ? "unordered"
            : null;
      if (!style) {
        throw new Error("List style must be unordered or ordered.");
      }
      if (block.data.meta !== undefined && block.data.meta !== null) {
        // Official list tool may carry checklist/counter metadata — reject.
        const meta = block.data.meta;
        if (
          typeof meta === "object" &&
          !Array.isArray(meta) &&
          Object.keys(meta as object).length > 0
        ) {
          throw new Error("List metadata is not allowed.");
        }
      }
      const items = normalizeEditorListItems(block.data.items, 1);
      if (!options.retainEmptyShells && !listHasText(items)) {
        return null;
      }
      return { id, type: "list", style, items };
    }
    case "quote": {
      const spans = parseInlineHtmlToSpans(asString(block.data.text));
      const attributionSpans = parseInlineHtmlToSpans(
        asString(block.data.caption),
      );
      if (
        !options.retainEmptyShells &&
        !spansToPlain(spans).trim() &&
        !spansToPlain(attributionSpans).trim()
      ) {
        return null;
      }
      return {
        id,
        type: "quote",
        spans,
        ...(spansToPlain(attributionSpans).trim()
          ? { attributionSpans }
          : {}),
      };
    }
    case "delimiter":
      return { id, type: "delimiter" };
    case "image": {
      const mediaAssetId = asString(
        block.data.mediaAssetId ??
          (block.data.file &&
          typeof block.data.file === "object" &&
          !Array.isArray(block.data.file)
            ? (block.data.file as Record<string, unknown>).mediaAssetId
            : undefined),
      );
      if (!mediaAssetId) {
        if (options.retainEmptyShells) return null;
        throw new Error("Image block requires mediaAssetId.");
      }
      // Reject URL-bearing payloads at the adapter boundary.
      if (
        typeof block.data.url === "string" ||
        (block.data.file &&
          typeof block.data.file === "object" &&
          !Array.isArray(block.data.file) &&
          typeof (block.data.file as Record<string, unknown>).url === "string")
      ) {
        // URLs are transient only; persistence path uses mediaAssetId alone.
      }
      return { id, type: "image", mediaAssetId };
    }
    default:
      throw new Error(`Unsupported editor block type: ${block.type}`);
  }
}

function journalBlockToEditorBlock(
  block: JournalDocumentBlock,
  imageUrls?: EditorTransientImageUrlByMediaId,
): EditorJsBlock {
  switch (block.type) {
    case "paragraph":
      return {
        id: block.id,
        type: "paragraph",
        data: { text: spansToEditorHtml(block.spans) },
      };
    case "heading":
      return {
        id: block.id,
        type: "header",
        data: {
          text: spansToEditorHtml(block.spans),
          level: block.level,
        },
      };
    case "list":
      return {
        id: block.id,
        type: "list",
        data: {
          style: block.style,
          items: journalListItemsToEditor(block.items),
        },
      };
    case "quote":
      return {
        id: block.id,
        type: "quote",
        data: {
          text: spansToEditorHtml(block.spans),
          caption: spansToEditorHtml(block.attributionSpans ?? []),
          alignment: "left",
        },
      };
    case "delimiter":
      return { id: block.id, type: "delimiter", data: {} };
    case "image": {
      const url = imageUrls?.get(block.mediaAssetId) ?? "";
      return {
        id: block.id,
        type: "image",
        data: {
          mediaAssetId: block.mediaAssetId,
          file: {
            mediaAssetId: block.mediaAssetId,
            ...(url ? { url } : {}),
          },
          withBorder: false,
          withBackground: false,
          stretched: false,
        },
      };
    }
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      throw new Error("Unsupported journal block.");
    }
  }
}

function normalizeEditorListItems(
  value: unknown,
  depth: number,
): JournalListItem[] {
  if (depth > MAX_JOURNAL_LIST_DEPTH) {
    throw new Error(`List nesting may not exceed depth ${MAX_JOURNAL_LIST_DEPTH}.`);
  }
  if (!Array.isArray(value)) {
    throw new Error("List items must be an array.");
  }
  return value.map((item) => {
    if (typeof item === "string") {
      return { spans: parseInlineHtmlToSpans(item) };
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid list item.");
    }
    const record = item as Record<string, unknown>;
    if (record.checked !== undefined || record.meta !== undefined) {
      throw new Error("Checklist and list counters are not allowed.");
    }
    const content = asString(record.content ?? record.text ?? "");
    const nested = Array.isArray(record.items)
      ? normalizeEditorListItems(record.items, depth + 1)
      : undefined;
    return nested && nested.length > 0
      ? { spans: parseInlineHtmlToSpans(content), items: nested }
      : { spans: parseInlineHtmlToSpans(content) };
  });
}

function journalListItemsToEditor(
  items: readonly JournalListItem[],
): Array<{ content: string; items?: ReturnType<typeof journalListItemsToEditor> }> {
  return items.map((item) => ({
    content: spansToEditorHtml(item.spans),
    ...(item.items && item.items.length > 0
      ? { items: journalListItemsToEditor(item.items) }
      : {}),
  }));
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function spansToPlain(spans: readonly JournalTextSpan[]): string {
  return spans.map((span) => span.text).join("");
}

function listHasText(items: readonly JournalListItem[]): boolean {
  return items.some(
    (item) =>
      spansToPlain(item.spans).trim().length > 0 ||
      (item.items ? listHasText(item.items) : false),
  );
}

function dedupeMarks(marks: JournalInlineMark[]): JournalInlineMark[] {
  const seen = new Set<string>();
  const result: JournalInlineMark[] = [];
  for (const mark of marks) {
    const key = mark.type === "link" ? `link:${mark.href}` : mark.type;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(mark);
  }
  return result;
}

function popMark(stack: JournalInlineMark[], tag: string): void {
  const type =
    tag === "b" || tag === "strong"
      ? "bold"
      : tag === "i" || tag === "em"
        ? "italic"
        : tag === "a"
          ? "link"
          : null;
  if (!type) return;
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i]?.type === type) {
      stack.splice(i, 1);
      return;
    }
  }
}

function mergeAdjacentSpans(spans: JournalTextSpan[]): JournalTextSpan[] {
  const merged: JournalTextSpan[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      marksKey(previous.marks) === marksKey(span.marks) &&
      !(previous.text.endsWith("\n") && span.text.startsWith("\n"))
    ) {
      previous.text += span.text;
      continue;
    }
    merged.push({
      text: span.text,
      ...(span.marks && span.marks.length > 0 ? { marks: [...span.marks] } : {}),
    });
  }
  return merged;
}

function marksKey(marks: JournalInlineMark[] | undefined): string {
  if (!marks || marks.length === 0) return "";
  return dedupeMarks(marks)
    .map((mark) => (mark.type === "link" ? `link:${mark.href}` : mark.type))
    .sort()
    .join("|");
}

function markRank(mark: JournalInlineMark): number {
  switch (mark.type) {
    case "link":
      return 0;
    case "italic":
      return 1;
    case "bold":
      return 2;
    default: {
      const _exhaustive: never = mark;
      void _exhaustive;
      return 9;
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
