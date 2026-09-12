import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/extension";
import { $createLinkNode, $isLinkNode, LinkNode } from "@lexical/link";
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import {
  $createHeadingNode,
  $isHeadingNode,
  HeadingNode,
} from "@lexical/rich-text";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  createEditor,
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  IS_UNDERLINE,
  type EditorState,
  type ElementNode,
  type LexicalNode,
} from "lexical";
import type { ListType } from "@lexical/list";

import {
  $createOverGardenCalloutNode,
  $createOverGardenCodeNode,
  $createOverGardenImageNode,
  $createOverGardenQuoteAttributionNode,
  $createOverGardenQuoteBodyNode,
  $createOverGardenQuoteNode,
  $getJournalBlockId,
  $isOverGardenCalloutNode,
  $isOverGardenCodeNode,
  $isOverGardenImageNode,
  $isOverGardenQuoteAttributionNode,
  $isOverGardenQuoteBodyNode,
  $isOverGardenQuoteNode,
  $setJournalBlockId,
  createJournalBlockId,
  OverGardenCalloutNode,
  OverGardenCodeNode,
  OverGardenImageNode,
  OverGardenListNode,
  OverGardenQuoteAttributionNode,
  OverGardenQuoteBodyNode,
  OverGardenQuoteNode,
  JOURNAL_LIST_NODE_REPLACEMENT,
} from "@/components/garden/lexical-journal/journal-lexical-nodes";
import {
  JOURNAL_DOCUMENT_SCHEMA_VERSION,
  MAX_JOURNAL_LIST_DEPTH,
  JournalDocumentValidationError,
  normalizeImageCaption,
  normalizeJournalDocumentOrThrow,
  normalizeSafeHref,
  type JournalCodeLanguage,
  type JournalDocumentBlock,
  type JournalDocumentV1,
  type JournalHeadingBlock,
  type JournalInlineMark,
  type JournalListBlock,
  type JournalListItem,
  type JournalTextSpan,
} from "@/lib/garden/journal-document";

const JOURNAL_HEADING_TAGS: Record<
  JournalHeadingBlock["level"],
  "h1" | "h2" | "h3"
> = {
  1: "h1",
  2: "h2",
  3: "h3",
};

const JOURNAL_HEADING_LEVELS: Record<string, JournalHeadingBlock["level"]> = {
  h1: 1,
  h2: 2,
  h3: 3,
};

export type JournalLexicalAdapterErrorCode =
  | "invalid_canonical_document"
  | "unsupported_node"
  | "unsupported_mark"
  | "invalid_tree";

export class JournalLexicalAdapterError extends Error {
  readonly code: JournalLexicalAdapterErrorCode;

  constructor(code: JournalLexicalAdapterErrorCode, message: string) {
    super(message);
    this.name = "JournalLexicalAdapterError";
    this.code = code;
  }
}

export const JOURNAL_LEXICAL_NODE_CLASSES = [
  HeadingNode,
  OverGardenListNode,
  JOURNAL_LIST_NODE_REPLACEMENT,
  ListItemNode,
  LinkNode,
  HorizontalRuleNode,
  OverGardenImageNode,
  OverGardenQuoteNode,
  OverGardenQuoteBodyNode,
  OverGardenQuoteAttributionNode,
  OverGardenCalloutNode,
  OverGardenCodeNode,
] as const;

export const JOURNAL_HYDRATION_TAG = "overgarden-journal-hydration";

/**
 * The five Lexical text formats this grammar admits, and the exact bit mask
 * they occupy. Anything outside the mask — subscript, superscript, highlight,
 * lowercase and the rest — is a tree the canonical document cannot express, so
 * it is refused rather than dropped.
 */
const JOURNAL_TEXT_FORMATS = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
] as const;

const JOURNAL_TEXT_FORMAT_MASK =
  IS_BOLD | IS_ITALIC | IS_STRIKETHROUGH | IS_UNDERLINE | IS_CODE;

/** The contract's canonical order, minus `link`, which carries an href. */
const JOURNAL_MARK_ORDERED_FORMATS = [
  "code",
  "bold",
  "italic",
  "underline",
  "strikethrough",
] as const;

export function journalDocumentV1ToLexicalEditorState(
  document: JournalDocumentV1,
): EditorState {
  let normalized: JournalDocumentV1;
  try {
    normalized = normalizeJournalDocumentOrThrow(document);
  } catch (error) {
    throw new JournalLexicalAdapterError(
      "invalid_canonical_document",
      error instanceof JournalDocumentValidationError
        ? error.message
        : "Canonical journal document is invalid.",
    );
  }

  let deferredError: Error | null = null;
  const editor = createEditor({
    namespace: "OverGardenJournalAdapter",
    nodes: [...JOURNAL_LEXICAL_NODE_CLASSES],
    onError: (error) => {
      deferredError = error;
    },
  });
  editor.update(
    () => {
      $hydrateJournalDocumentV1(normalized);
    },
    { discrete: true, tag: JOURNAL_HYDRATION_TAG },
  );
  if (deferredError) throw deferredError;
  return editor.getEditorState();
}

export function $hydrateJournalDocumentV1(document: JournalDocumentV1): void {
  const root = $getRoot();
  root.clear();
  for (const block of document.blocks) {
    root.append($journalBlockToLexicalNode(block));
  }
  if (root.isEmpty()) {
    root.append(
      $setJournalBlockId($createParagraphNode(), createJournalBlockId()),
    );
  }
}

export function lexicalEditorStateToJournalDocumentV1(
  editorState: EditorState,
): JournalDocumentV1 {
  let document: JournalDocumentV1 | null = null;
  editorState.read(() => {
    const blocks = $getRoot()
      .getChildren()
      .map((node) => $lexicalNodeToJournalBlock(node));
    try {
      document = normalizeJournalDocumentOrThrow({
        schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
        blocks,
      });
    } catch (error) {
      if (error instanceof JournalLexicalAdapterError) throw error;
      throw new JournalLexicalAdapterError(
        "invalid_tree",
        error instanceof Error
          ? error.message
          : "Lexical journal tree is invalid.",
      );
    }
  });
  if (!document) {
    throw new JournalLexicalAdapterError(
      "invalid_tree",
      "Lexical journal tree did not produce a document.",
    );
  }
  return document;
}

/**
 * Exported so a block can be duplicated by the one route that is already
 * proven to be lossless: serialize it, give the copy a fresh application ID,
 * and hydrate it back. A tree the contract cannot express therefore cannot be
 * duplicated either.
 */
export function $journalBlockToLexicalNode(
  block: JournalDocumentBlock,
): LexicalNode {
  switch (block.type) {
    case "paragraph": {
      const node = $setJournalBlockId($createParagraphNode(), block.id);
      $appendSpans(node, block.spans);
      return node;
    }
    case "heading": {
      const node = $setJournalBlockId(
        $createHeadingNode(JOURNAL_HEADING_TAGS[block.level]),
        block.id,
      );
      $appendSpans(node, block.spans);
      return node;
    }
    case "list": {
      const node = $setJournalBlockId(
        $createListNode(journalListType(block.style)),
        block.id,
      );
      $appendJournalListItems(node, block.items, 1, block.style);
      return node;
    }
    case "quote": {
      const quote = $createOverGardenQuoteNode(block.id);
      const body = $createOverGardenQuoteBodyNode();
      $appendSpans(body, block.spans);
      quote.append(body);
      if (block.attributionSpans) {
        const attribution = $createOverGardenQuoteAttributionNode();
        $appendSpans(attribution, block.attributionSpans);
        quote.append(attribution);
      }
      return quote;
    }
    case "callout": {
      const node = $createOverGardenCalloutNode(block.id, block.icon);
      $appendSpans(node, block.spans);
      return node;
    }
    case "code": {
      const node = $createOverGardenCodeNode(block.id, block.language);
      $appendJournalCodeText(node, block.text);
      return node;
    }
    case "delimiter":
      return $setJournalBlockId($createHorizontalRuleNode(), block.id);
    case "image":
      return $createOverGardenImageNode({
        blockId: block.id,
        mediaAssetId: block.mediaAssetId,
        caption: block.caption,
      });
    default: {
      const exhaustive: never = block;
      throw new JournalLexicalAdapterError(
        "unsupported_node",
        `Unsupported canonical block: ${String(exhaustive)}.`,
      );
    }
  }
}

function $appendJournalListItems(
  list: ListNode,
  items: readonly JournalListItem[],
  depth: number,
  style: JournalListBlock["style"],
): void {
  if (depth > MAX_JOURNAL_LIST_DEPTH) {
    throw new JournalLexicalAdapterError(
      "invalid_canonical_document",
      `List nesting may not exceed depth ${MAX_JOURNAL_LIST_DEPTH}.`,
    );
  }
  for (const item of items) {
    // `ListItemNode.getChecked()` derives from the parent list's type, so the
    // flag is only ever set for a to-do list and reads back as `undefined`
    // everywhere else.
    const node =
      style === "todo"
        ? $createListItemNode(item.checked ?? false)
        : $createListItemNode();
    $appendSpans(node, item.spans);
    list.append(node);
    if (item.items?.length) {
      const wrapper = $createListItemNode();
      const nested = $createListNode(journalListType(style));
      $appendJournalListItems(nested, item.items, depth + 1, style);
      wrapper.append(nested);
      list.append(wrapper);
    }
  }
}

function journalListType(style: JournalListBlock["style"]): ListType {
  if (style === "ordered") return "number";
  return style === "todo" ? "check" : "bullet";
}

function $appendJournalCodeText(code: OverGardenCodeNode, text: string): void {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) code.append($createLineBreakNode());
    if (line) code.append($createTextNode(line));
  });
}

function $appendSpans(node: ElementNode, spans: readonly JournalTextSpan[]) {
  for (const span of spans) {
    const link = span.marks?.find((mark) => mark.type === "link");
    const parent = link ? $createLinkNode(normalizeSafeHref(link.href)) : node;
    const textParts = span.text.split("\n");
    textParts.forEach((text, index) => {
      if (index > 0) parent.append($createLineBreakNode());
      if (text || textParts.length === 1) {
        const textNode = $createTextNode(text);
        for (const format of JOURNAL_TEXT_FORMATS) {
          if (span.marks?.some((mark) => mark.type === format)) {
            textNode.toggleFormat(format);
          }
        }
        parent.append(textNode);
      }
    });
    if (link) node.append(parent);
  }
}

export function $lexicalNodeToJournalBlock(
  node: LexicalNode,
): JournalDocumentBlock {
  if ($isParagraphNode(node)) {
    $assertCanonicalElementState(node, "Paragraph");
    const id = $requireBlockId(node);
    return { id, type: "paragraph", spans: $elementToSpans(node) };
  }
  if ($isHeadingNode(node)) {
    $assertCanonicalElementState(node, "Heading");
    const id = $requireBlockId(node);
    const level = JOURNAL_HEADING_LEVELS[node.getTag()];
    if (!level) {
      throw new JournalLexicalAdapterError(
        "unsupported_node",
        "Only H1, H2, and H3 headings are supported.",
      );
    }
    return { id, type: "heading", level, spans: $elementToSpans(node) };
  }
  if ($isListNode(node)) {
    $assertCanonicalElementState(node, "List");
    const id = $requireBlockId(node);
    const listType = node.getListType();
    const style = JOURNAL_LIST_STYLES[listType];
    if (!style) {
      throw new JournalLexicalAdapterError(
        "unsupported_node",
        `Unsupported list type: ${listType}.`,
      );
    }
    if (node.getStart() !== 1) {
      throw new JournalLexicalAdapterError(
        "unsupported_mark",
        "Custom list counters are outside the canonical journal model.",
      );
    }
    return {
      id,
      type: "list",
      style,
      items: $lexicalListToJournalItems(node, 1, listType),
    };
  }
  if ($isOverGardenQuoteNode(node)) {
    $assertCanonicalElementState(node, "Quote");
    const id = $requireBlockId(node);
    const children = node.getChildren();
    if (
      children.length < 1 ||
      children.length > 2 ||
      !$isOverGardenQuoteBodyNode(children[0]) ||
      (children.length === 2 && !$isOverGardenQuoteAttributionNode(children[1]))
    ) {
      throw new JournalLexicalAdapterError(
        "invalid_tree",
        "Quote must contain one body and at most one attribution.",
      );
    }
    const attribution = children[1];
    return {
      id,
      type: "quote",
      spans: $elementToSpans(children[0]),
      ...(attribution && $isOverGardenQuoteAttributionNode(attribution)
        ? { attributionSpans: $elementToSpans(attribution) }
        : {}),
    };
  }
  if ($isOverGardenCalloutNode(node)) {
    const id = $requireBlockId(node);
    return {
      id,
      type: "callout",
      icon: node.getIcon(),
      spans: $elementToSpans(node),
    };
  }
  if ($isOverGardenCodeNode(node)) {
    $assertCanonicalElementState(node, "Code");
    const id = $requireBlockId(node);
    return {
      id,
      type: "code",
      language: node.getLanguage() as JournalCodeLanguage,
      text: $journalCodeToText(node),
    };
  }
  if ($isHorizontalRuleNode(node)) {
    const id = $requireBlockId(node);
    return { id, type: "delimiter" };
  }
  if ($isOverGardenImageNode(node)) {
    const id = $requireBlockId(node);
    const mediaAssetId = node.getMediaAssetId();
    if (!mediaAssetId) {
      throw new JournalLexicalAdapterError(
        "invalid_tree",
        "Journal image media identity is missing.",
      );
    }
    const caption = normalizeImageCaption(node.getCaption());
    return caption === null
      ? { id, type: "image", mediaAssetId }
      : { id, type: "image", mediaAssetId, caption };
  }
  throw new JournalLexicalAdapterError(
    "unsupported_node",
    `Unsupported Lexical node type: ${node.getType()}.`,
  );
}

const JOURNAL_LIST_STYLES: Partial<
  Record<ListType, JournalListBlock["style"]>
> = {
  bullet: "unordered",
  check: "todo",
  number: "ordered",
};

function $journalCodeToText(code: OverGardenCodeNode): string {
  let text = "";
  for (const child of code.getChildren()) {
    if ($isLineBreakNode(child)) {
      text += "\n";
      continue;
    }
    if (!$isTextNode(child)) {
      throw new JournalLexicalAdapterError(
        "unsupported_node",
        "Code block contains a non-text child.",
      );
    }
    if (
      child.getFormat() !== 0 ||
      child.getStyle() !== "" ||
      child.getDetail() !== 0 ||
      child.getMode() !== "normal"
    ) {
      throw new JournalLexicalAdapterError(
        "unsupported_mark",
        "Code text cannot carry marks.",
      );
    }
    text += child.getTextContent();
  }
  return text;
}

function $lexicalListToJournalItems(
  list: ListNode,
  depth: number,
  expectedListType: ListType,
): JournalListItem[] {
  if (depth > MAX_JOURNAL_LIST_DEPTH) {
    throw new JournalLexicalAdapterError(
      "invalid_tree",
      `List nesting may not exceed depth ${MAX_JOURNAL_LIST_DEPTH}.`,
    );
  }
  if (list.getListType() !== expectedListType) {
    throw new JournalLexicalAdapterError(
      "invalid_tree",
      "Mixed nested list styles are unsupported.",
    );
  }
  const items: JournalListItem[] = [];
  const isTodo = expectedListType === "check";
  for (const child of list.getChildren()) {
    // `getChecked()` is derived from the parent list type, so a flag outside a
    // to-do list is a tree that cannot be expressed and never a silent drop.
    if (
      !$isListItemNode(child) ||
      (!isTodo && child.getChecked() !== undefined)
    ) {
      throw new JournalLexicalAdapterError(
        "invalid_tree",
        "List contains an unsupported item.",
      );
    }
    if (child.getFormatType() !== "" || child.getIndent() !== depth - 1) {
      throw new JournalLexicalAdapterError(
        "unsupported_mark",
        "List item contains unsupported presentation state.",
      );
    }
    const children = child.getChildren();
    const nestedLists = children.filter($isListNode);
    if (
      nestedLists.length > 1 ||
      (nestedLists.length === 1 && children.at(-1) !== nestedLists[0])
    ) {
      throw new JournalLexicalAdapterError(
        "invalid_tree",
        "List nesting structure is invalid.",
      );
    }
    const inlineChildren = nestedLists.length
      ? children.slice(0, -1)
      : children;
    const nestedItems = nestedLists[0]
      ? $lexicalListToJournalItems(nestedLists[0], depth + 1, expectedListType)
      : null;

    if (nestedItems && inlineChildren.length === 0) {
      const parent = items.at(-1);
      if (!parent || parent.items) {
        throw new JournalLexicalAdapterError(
          "invalid_tree",
          "Nested list wrapper is missing one preceding parent item.",
        );
      }
      parent.items = nestedItems;
      continue;
    }

    // Key order matches the contract's normalizer, whose stable serialization
    // is `JSON.stringify`.
    const item: JournalListItem = {
      spans: $inlineChildrenToSpans(inlineChildren),
    };
    if (isTodo) item.checked = child.getChecked() ?? false;
    if (nestedItems) item.items = nestedItems;
    items.push(item);
  }
  return items;
}

function $elementToSpans(node: ElementNode): JournalTextSpan[] {
  $assertCanonicalElementState(node, "Inline container");
  return $inlineChildrenToSpans(node.getChildren());
}

function $assertCanonicalElementState(node: ElementNode, label: string): void {
  // Element textFormat/textStyle are Lexical's non-rendered typing context for
  // the next inserted character. Existing text nodes remain the authoritative
  // rendered marks/styles and are validated independently below.
  if (node.getFormatType() !== "" || node.getIndent() !== 0) {
    throw new JournalLexicalAdapterError(
      "unsupported_mark",
      `${label} contains unsupported presentation state.`,
    );
  }
}

function $inlineChildrenToSpans(
  children: readonly LexicalNode[],
): JournalTextSpan[] {
  const spans: JournalTextSpan[] = [];
  for (const child of children) {
    if ($isTextNode(child)) {
      $pushTextSpan(spans, child, undefined);
      continue;
    }
    if ($isLineBreakNode(child)) {
      $pushSpan(spans, { text: "\n" });
      continue;
    }
    if ($isLinkNode(child)) {
      $assertCanonicalElementState(child, "Link");
      if (child.getTarget() || child.getRel() || child.getTitle()) {
        throw new JournalLexicalAdapterError(
          "unsupported_mark",
          "Link metadata outside the canonical href is unsupported.",
        );
      }
      const href = normalizeSafeHref(child.getURL());
      for (const linkChild of child.getChildren()) {
        if ($isTextNode(linkChild)) {
          $pushTextSpan(spans, linkChild, href);
        } else if ($isLineBreakNode(linkChild)) {
          $pushSpan(spans, {
            text: "\n",
            marks: [{ type: "link", href }],
          });
        } else {
          throw new JournalLexicalAdapterError(
            "unsupported_node",
            "Link contains a non-text child.",
          );
        }
      }
      continue;
    }
    throw new JournalLexicalAdapterError(
      "unsupported_node",
      `Unsupported inline Lexical node type: ${child.getType()}.`,
    );
  }
  return spans.length ? spans : [{ text: "" }];
}

function $pushTextSpan(
  spans: JournalTextSpan[],
  textNode: ReturnType<typeof $createTextNode>,
  href: string | undefined,
) {
  if (
    (textNode.getFormat() & ~JOURNAL_TEXT_FORMAT_MASK) !== 0 ||
    textNode.getDetail() !== 0 ||
    textNode.getMode() !== "normal" ||
    textNode.getStyle() !== ""
  ) {
    throw new JournalLexicalAdapterError(
      "unsupported_mark",
      "Text contains unsupported formatting or behavior.",
    );
  }
  // Pushed in the contract's canonical mark order, which is also what
  // normalization sorts to; `marksKey` below relies on that order to merge
  // adjacent spans carrying the same emphasis.
  const marks: JournalInlineMark[] = [];
  for (const format of JOURNAL_MARK_ORDERED_FORMATS) {
    if (textNode.hasFormat(format)) marks.push({ type: format });
  }
  if (href) marks.push({ type: "link", href });
  $pushSpan(spans, {
    text: textNode.getTextContent(),
    ...(marks.length ? { marks } : {}),
  });
}

function $pushSpan(spans: JournalTextSpan[], span: JournalTextSpan) {
  const previous = spans.at(-1);
  if (previous && marksKey(previous.marks) === marksKey(span.marks)) {
    previous.text += span.text;
    return;
  }
  spans.push(span);
}

function marksKey(marks: JournalInlineMark[] | undefined): string {
  return JSON.stringify(marks ?? []);
}

function $requireBlockId(node: LexicalNode): string {
  const id = $getJournalBlockId(node);
  if (!id) {
    throw new JournalLexicalAdapterError(
      "invalid_tree",
      `Top-level ${node.getType()} node is missing its application block ID.`,
    );
  }
  return id;
}
