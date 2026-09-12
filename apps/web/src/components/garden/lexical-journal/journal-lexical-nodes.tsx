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

import {
  DEFAULT_JOURNAL_CALLOUT_ICON,
  DEFAULT_JOURNAL_CODE_LANGUAGE,
  JOURNAL_BLOCK_ID_PATTERN,
  JOURNAL_CALLOUT_ICONS,
  JOURNAL_CODE_LANGUAGES,
  normalizeImageCaption,
  type JournalCalloutIcon,
  type JournalCodeLanguage,
} from "@/lib/garden/journal-document";
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

function parseCalloutIcon(value: unknown): JournalCalloutIcon {
  const icon = typeof value === "string" ? value.normalize("NFC") : "";
  return (JOURNAL_CALLOUT_ICONS as readonly string[]).includes(icon)
    ? (icon as JournalCalloutIcon)
    : DEFAULT_JOURNAL_CALLOUT_ICON;
}

function parseCodeLanguage(value: unknown): JournalCodeLanguage {
  return typeof value === "string" &&
    (JOURNAL_CODE_LANGUAGES as readonly string[]).includes(value)
    ? (value as JournalCodeLanguage)
    : DEFAULT_JOURNAL_CODE_LANGUAGE;
}

export const overgardenBlockIdState = createState("overgardenBlockId", {
  parse: parseBlockId,
});

const overgardenCalloutIconState = createState("overgardenCalloutIcon", {
  parse: parseCalloutIcon,
});

const overgardenCodeLanguageState = createState("overgardenCodeLanguage", {
  parse: parseCodeLanguage,
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

/**
 * The caption a gardener types under a photo (OVE-432).
 *
 * It lives on the node rather than beside it, so it travels with every editor
 * state the composer serialises — undo, redo, autosave and the document the
 * entry is saved from are all one thing.
 */
const overgardenImageCaptionState = createState("overgardenImageCaption", {
  // A parse runs on whatever is in a serialised editor state, including one
  // written by an older build, so it answers rather than throws: a caption the
  // document normalizer would refuse becomes no caption.
  parse: (value: unknown) => {
    try {
      return normalizeImageCaption(value) ?? "";
    } catch {
      return "";
    }
  },
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
        { flat: true, stateConfig: overgardenImageCaptionState },
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
        caption={this.getCaption()}
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

  getCaption(): string {
    return $getState(this, overgardenImageCaptionState);
  }

  setCaption(caption: string): this {
    // The raw string, trimmed only of what a caption can never hold: the
    // gardener is still typing, and collapsing their spaces under the cursor
    // would move it.
    return $setState(
      this.getWritable(),
      overgardenImageCaptionState,
      caption.replace(/[\r\n\0]+/gu, " "),
    );
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
  caption?: string;
}): OverGardenImageNode {
  const mediaAssetId = parseMediaAssetId(input.mediaAssetId);
  if (!mediaAssetId) {
    throw new Error("Journal image media asset ID is invalid.");
  }
  const node = $applyNodeReplacement(new OverGardenImageNode());
  $setJournalBlockId(node, input.blockId);
  $setState(node, overgardenImageCaptionState, input.caption ?? "");
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

/**
 * A callout holds one run of inline content, like a paragraph, and carries its
 * icon in NodeState. The icon is drawn by CSS from `data-icon` rather than by a
 * DOM child, so the node's DOM children stay exactly the ones Lexical manages
 * and no experimental DOM-slot API is needed (ADR-0015 keeps those off).
 */
export class OverGardenCalloutNode extends ElementNode {
  $config() {
    return this.config("overgarden-callout", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: overgardenBlockIdState },
        { flat: true, stateConfig: overgardenCalloutIconState },
      ],
    });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = $getDocument().createElement("div");
    const className = config.theme.callout;
    if (typeof className === "string" && className) {
      element.className = className;
    }
    element.setAttribute("data-lexical-journal-callout", "true");
    element.setAttribute("data-icon", this.getIcon());
    return element;
  }

  updateDOM(prevNode: OverGardenCalloutNode, dom: HTMLElement): boolean {
    const icon = this.getIcon();
    if (prevNode.getIcon() !== icon) dom.setAttribute("data-icon", icon);
    return false;
  }

  getIcon(): JournalCalloutIcon {
    return $getState(this, overgardenCalloutIconState);
  }

  setIcon(icon: JournalCalloutIcon): this {
    return $setState(this, overgardenCalloutIconState, icon) as this;
  }

  canBeEmpty(): true {
    return true;
  }

  insertNewAfter(): LexicalNode {
    const paragraph = $createJournalParagraphNode();
    this.insertAfter(paragraph);
    return paragraph;
  }
}

/**
 * A code block holds plain text and line breaks and nothing else: a transform
 * clears any format a paste or a shortcut managed to set, so the canonical
 * `code` block can never carry marks it has no field for.
 */
export class OverGardenCodeNode extends ElementNode {
  $config() {
    return this.config("overgarden-code", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: overgardenBlockIdState },
        { flat: true, stateConfig: overgardenCodeLanguageState },
      ],
    });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = $getDocument().createElement("pre");
    const className = config.theme.code;
    if (typeof className === "string" && className) {
      element.className = className;
    }
    element.setAttribute("data-lexical-journal-code", "true");
    element.setAttribute("data-language", this.getLanguage());
    element.setAttribute("spellcheck", "false");
    return element;
  }

  updateDOM(prevNode: OverGardenCodeNode, dom: HTMLElement): boolean {
    const language = this.getLanguage();
    if (prevNode.getLanguage() !== language) {
      dom.setAttribute("data-language", language);
    }
    return false;
  }

  getLanguage(): JournalCodeLanguage {
    return $getState(this, overgardenCodeLanguageState);
  }

  setLanguage(language: JournalCodeLanguage): this {
    return $setState(this, overgardenCodeLanguageState, language) as this;
  }

  canBeEmpty(): true {
    return true;
  }

  /**
   * Enter inserts a line break inside code; only the Enter that follows an
   * empty last line leaves the block, which is what the command handler in
   * `journal-lexical-extensions.tsx` arranges. Returning a paragraph here keeps
   * that one exit path working through `selection.insertParagraph()`.
   */
  insertNewAfter(): LexicalNode {
    const paragraph = $createJournalParagraphNode();
    this.insertAfter(paragraph);
    return paragraph;
  }
}

export function $createOverGardenCalloutNode(
  blockId: string,
  icon: JournalCalloutIcon = DEFAULT_JOURNAL_CALLOUT_ICON,
): OverGardenCalloutNode {
  const node = $setJournalBlockId(
    $applyNodeReplacement(new OverGardenCalloutNode()),
    blockId,
  );
  return node.setIcon(icon);
}

export function $isOverGardenCalloutNode(
  node: LexicalNode | null | undefined,
): node is OverGardenCalloutNode {
  return node instanceof OverGardenCalloutNode;
}

export function $createOverGardenCodeNode(
  blockId: string,
  language: JournalCodeLanguage = DEFAULT_JOURNAL_CODE_LANGUAGE,
): OverGardenCodeNode {
  const node = $setJournalBlockId(
    $applyNodeReplacement(new OverGardenCodeNode()),
    blockId,
  );
  return node.setLanguage(language);
}

export function $isOverGardenCodeNode(
  node: LexicalNode | null | undefined,
): node is OverGardenCodeNode {
  return node instanceof OverGardenCodeNode;
}

function $createJournalParagraphNode() {
  return $setJournalBlockId($createParagraphNode(), createJournalBlockId());
}
