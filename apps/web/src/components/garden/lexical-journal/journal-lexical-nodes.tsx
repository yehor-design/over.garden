"use client";

import { ListNode, type ListType } from "@lexical/list";
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $getDocument,
  $getState,
  $setState,
  createState,
  DecoratorNode,
  ElementNode,
  type EditorConfig,
  type LexicalNode,
  type LexicalNodeReplacement,
  type NodeKey,
  type RangeSelection,
} from "lexical";
import type { JSX } from "react";

import { JOURNAL_BLOCK_ID_PATTERN } from "@/lib/garden/journal-document";
import { JournalLexicalImageNodeView } from "./journal-lexical-image-node";

export {
  JournalImagePreviewProvider,
  type JournalImagePreviewContextValue,
} from "./journal-lexical-image-node";

function parseBlockId(value: unknown): string {
  return typeof value === "string" && JOURNAL_BLOCK_ID_PATTERN.test(value)
    ? value
    : "";
}

function parseMediaAssetId(value: unknown): string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : "";
}

export const overgardenBlockIdState = createState("overgardenBlockId", {
  parse: parseBlockId,
});

/**
 * Stock ListNode coalesces adjacent lists of the same type. That is correct for
 * HTML editing but invalid for JournalDocumentV1, where adjacent list blocks
 * retain separate application IDs. This exact-version replacement preserves
 * the stable ListNode API while terminating config ancestry at ElementNode so
 * the stock cross-block merge transform is not registered. registerList's
 * explicit commands and strict-indent transforms still target this subclass
 * through withKlass.
 */
export class OverGardenListNode extends ListNode {
  $config(): ReturnType<ListNode["$config"]> {
    // ListNode's inferred return type fixes the literal `list` type. Runtime
    // node replacement requires a distinct type, so this exact-pin boundary
    // narrows only the compile-time signature while preserving the real config
    // record consumed by Lexical.
    return this.config("overgarden-list", {
      extends: ElementNode,
      stateConfigs: [{ flat: true, stateConfig: overgardenBlockIdState }],
    }) as unknown as ReturnType<ListNode["$config"]>;
  }

  constructor(listType: ListType = "number", start = 1, key?: NodeKey) {
    super(listType, start, key);
  }
}

export const JOURNAL_LIST_NODE_REPLACEMENT: LexicalNodeReplacement = {
  replace: ListNode,
  with: (node: ListNode) =>
    new OverGardenListNode(node.getListType(), node.getStart()),
  withKlass: OverGardenListNode,
};

const overgardenMediaAssetIdState = createState("overgardenMediaAssetId", {
  parse: parseMediaAssetId,
});

export function $getJournalBlockId(node: LexicalNode): string {
  return $getState(node, overgardenBlockIdState);
}

export function $setJournalBlockId<T extends LexicalNode>(
  node: T,
  blockId: string,
): T {
  const parsed = parseBlockId(blockId);
  if (!parsed) {
    throw new Error("Journal block ID is invalid.");
  }
  return $setState(node, overgardenBlockIdState, parsed) as T;
}

export function createJournalBlockId(): string {
  const bytes = new Uint8Array(12);
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Secure random journal block IDs are unavailable.");
  }
  cryptoApi.getRandomValues(bytes);
  return `b_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export class OverGardenImageNode extends DecoratorNode<JSX.Element> {
  $config() {
    return this.config("overgarden-image", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: overgardenBlockIdState },
        { flat: true, stateConfig: overgardenMediaAssetIdState },
      ],
    });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = $getDocument().createElement("figure");
    const className = config.theme.image;
    if (typeof className === "string" && className) {
      element.className = className;
    }
    element.setAttribute("data-lexical-journal-image", "true");
    return element;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <JournalLexicalImageNodeView
        blockId={this.getBlockId()}
        mediaAssetId={this.getMediaAssetId()}
        nodeKey={this.getKey()}
      />
    );
  }

  getBlockId(): string {
    return $getJournalBlockId(this);
  }

  getMediaAssetId(): string {
    return $getState(this, overgardenMediaAssetIdState);
  }

  isInline(): false {
    return false;
  }

  isKeyboardSelectable(): true {
    return true;
  }
}

export function $createOverGardenImageNode(input: {
  blockId: string;
  mediaAssetId: string;
}): OverGardenImageNode {
  const mediaAssetId = parseMediaAssetId(input.mediaAssetId);
  if (!mediaAssetId) {
    throw new Error("Journal image media asset ID is invalid.");
  }
  const node = $applyNodeReplacement(new OverGardenImageNode());
  $setJournalBlockId(node, input.blockId);
  return $setState(node, overgardenMediaAssetIdState, mediaAssetId);
}

export function $isOverGardenImageNode(
  node: LexicalNode | null | undefined,
): node is OverGardenImageNode {
  return node instanceof OverGardenImageNode;
}

class OverGardenQuotePartNode extends ElementNode {
  createDOM(config: EditorConfig): HTMLElement {
    const tag = this instanceof OverGardenQuoteAttributionNode ? "cite" : "div";
    const element = $getDocument().createElement(tag);
    const themeKey =
      this instanceof OverGardenQuoteAttributionNode
        ? "quoteAttribution"
        : "quoteBody";
    const className = config.theme[themeKey];
    if (typeof className === "string" && className) {
      element.className = className;
    }
    return element;
  }

  updateDOM(): false {
    return false;
  }

  insertNewAfter(
    _selection: RangeSelection,
    restoreSelection?: boolean,
  ): LexicalNode | null {
    const quote = this.getParent();
    if (!$isOverGardenQuoteNode(quote)) return null;
    const paragraph = $createJournalParagraphNode();
    quote.insertAfter(paragraph, restoreSelection);
    return paragraph;
  }
}

export class OverGardenQuoteBodyNode extends OverGardenQuotePartNode {
  $config() {
    return this.config("overgarden-quote-body", {
      extends: OverGardenQuotePartNode,
    });
  }
}

export class OverGardenQuoteAttributionNode extends OverGardenQuotePartNode {
  $config() {
    return this.config("overgarden-quote-attribution", {
      extends: OverGardenQuotePartNode,
    });
  }
}

export class OverGardenQuoteNode extends ElementNode {
  $config() {
    return this.config("overgarden-quote", {
      extends: ElementNode,
      stateConfigs: [{ flat: true, stateConfig: overgardenBlockIdState }],
    });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = $getDocument().createElement("blockquote");
    const className = config.theme.quote;
    if (typeof className === "string" && className) {
      element.className = className;
    }
    return element;
  }

  updateDOM(): false {
    return false;
  }

  insertNewAfter(): LexicalNode {
    const paragraph = $createJournalParagraphNode();
    this.insertAfter(paragraph);
    return paragraph;
  }
}

export function $createOverGardenQuoteNode(
  blockId: string,
): OverGardenQuoteNode {
  return $setJournalBlockId(
    $applyNodeReplacement(new OverGardenQuoteNode()),
    blockId,
  );
}

export function $createOverGardenQuoteBodyNode(): OverGardenQuoteBodyNode {
  return $applyNodeReplacement(new OverGardenQuoteBodyNode());
}

export function $createOverGardenQuoteAttributionNode(): OverGardenQuoteAttributionNode {
  return $applyNodeReplacement(new OverGardenQuoteAttributionNode());
}

export function $isOverGardenQuoteNode(
  node: LexicalNode | null | undefined,
): node is OverGardenQuoteNode {
  return node instanceof OverGardenQuoteNode;
}

export function $isOverGardenQuoteBodyNode(
  node: LexicalNode | null | undefined,
): node is OverGardenQuoteBodyNode {
  return node instanceof OverGardenQuoteBodyNode;
}

export function $isOverGardenQuoteAttributionNode(
  node: LexicalNode | null | undefined,
): node is OverGardenQuoteAttributionNode {
  return node instanceof OverGardenQuoteAttributionNode;
}

function $createJournalParagraphNode() {
  return $setJournalBlockId($createParagraphNode(), createJournalBlockId());
}
