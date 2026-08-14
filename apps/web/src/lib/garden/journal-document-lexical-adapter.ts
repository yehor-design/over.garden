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
  type EditorState,
  type ElementNode,
  type LexicalNode,
} from "lexical";

import {
  $createOverGardenImageNode,
  $createOverGardenQuoteAttributionNode,
  $createOverGardenQuoteBodyNode,
  $createOverGardenQuoteNode,
  $getJournalBlockId,
  $isOverGardenImageNode,
  $isOverGardenQuoteAttributionNode,
  $isOverGardenQuoteBodyNode,
  $isOverGardenQuoteNode,
  $setJournalBlockId,
  createJournalBlockId,
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
  normalizeJournalDocumentOrThrow,
  normalizeSafeHref,
  type JournalDocumentBlock,
  type JournalDocumentV1,
  type JournalInlineMark,
  type JournalListItem,
  type JournalTextSpan,
} from "@/lib/garden/journal-document";

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
] as const;

export const JOURNAL_HYDRATION_TAG = "overgarden-journal-hydration";

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

function $journalBlockToLexicalNode(block: JournalDocumentBlock): LexicalNode {
  switch (block.type) {
    case "paragraph": {
      const node = $setJournalBlockId($createParagraphNode(), block.id);
      $appendSpans(node, block.spans);
      return node;
    }
    case "heading": {
      const node = $setJournalBlockId(
        $createHeadingNode(block.level === 2 ? "h2" : "h3"),
        block.id,
      );
      $appendSpans(node, block.spans);
      return node;
    }
    case "list": {
      const node = $setJournalBlockId(
        $createListNode(block.style === "ordered" ? "number" : "bullet"),
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
    case "delimiter":
      return $setJournalBlockId($createHorizontalRuleNode(), block.id);
    case "image":
      return $createOverGardenImageNode({
        blockId: block.id,
        mediaAssetId: block.mediaAssetId,
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
  style: "ordered" | "unordered",
): void {
  if (depth > MAX_JOURNAL_LIST_DEPTH) {
    throw new JournalLexicalAdapterError(
      "invalid_canonical_document",
      `List nesting may not exceed depth ${MAX_JOURNAL_LIST_DEPTH}.`,
    );
  }
  for (const item of items) {
    const node = $createListItemNode();
    $appendSpans(node, item.spans);
    list.append(node);
    if (item.items?.length) {
      const wrapper = $createListItemNode();
      const nested = $createListNode(style === "ordered" ? "number" : "bullet");
      $appendJournalListItems(nested, item.items, depth + 1, style);
      wrapper.append(nested);
      list.append(wrapper);
    }
  }
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
        if (span.marks?.some((mark) => mark.type === "bold")) {
          textNode.toggleFormat("bold");
        }
        if (span.marks?.some((mark) => mark.type === "italic")) {
          textNode.toggleFormat("italic");
        }
        parent.append(textNode);
      }
    });
    if (link) node.append(parent);
  }
}

function $lexicalNodeToJournalBlock(node: LexicalNode): JournalDocumentBlock {
  if ($isParagraphNode(node)) {
    $assertCanonicalElementState(node, "Paragraph");
    const id = $requireBlockId(node);
    return { id, type: "paragraph", spans: $elementToSpans(node) };
  }
  if ($isHeadingNode(node)) {
    $assertCanonicalElementState(node, "Heading");
    const id = $requireBlockId(node);
    const tag = node.getTag();
    if (tag !== "h2" && tag !== "h3") {
      throw new JournalLexicalAdapterError(
        "unsupported_node",
        "Only H2 and H3 headings are supported.",
      );
    }
    return {
      id,
      type: "heading",
      level: tag === "h2" ? 2 : 3,
      spans: $elementToSpans(node),
    };
  }
  if ($isListNode(node)) {
    $assertCanonicalElementState(node, "List");
    const id = $requireBlockId(node);
    const listType = node.getListType();
    if (listType !== "bullet" && listType !== "number") {
      throw new JournalLexicalAdapterError(
        "unsupported_node",
        "Checklists are not supported.",
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
      style: listType === "number" ? "ordered" : "unordered",
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
    return { id, type: "image", mediaAssetId };
  }
  throw new JournalLexicalAdapterError(
    "unsupported_node",
    `Unsupported Lexical node type: ${node.getType()}.`,
  );
}

function $lexicalListToJournalItems(
  list: ListNode,
  depth: number,
  expectedListType: "bullet" | "number",
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
  for (const child of list.getChildren()) {
    if (!$isListItemNode(child) || child.getChecked() !== undefined) {
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

    const item: JournalListItem = {
      spans: $inlineChildrenToSpans(inlineChildren),
    };
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
    (textNode.getFormat() & ~3) !== 0 ||
    textNode.getDetail() !== 0 ||
    textNode.getMode() !== "normal" ||
    textNode.getStyle() !== ""
  ) {
    throw new JournalLexicalAdapterError(
      "unsupported_mark",
      "Text contains unsupported formatting or behavior.",
    );
  }
  const marks: JournalInlineMark[] = [];
  if (textNode.hasFormat("bold")) marks.push({ type: "bold" });
  if (textNode.hasFormat("italic")) marks.push({ type: "italic" });
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
