import { $createLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { buildEditorFromExtensions } from "@lexical/extension";
import {
  $createListItemNode,
  $createListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  createEditor,
  ElementNode,
  INDENT_CONTENT_COMMAND,
  type LexicalNode,
} from "lexical";
import { describe, expect, it } from "vitest";

import { $setJournalBlockId } from "@/components/garden/lexical-journal/journal-lexical-nodes";
import {
  JOURNAL_LEXICAL_NODE_CLASSES,
  JournalLexicalAdapterError,
  journalDocumentV1ToLexicalEditorState,
  lexicalEditorStateToJournalDocumentV1,
} from "@/lib/garden/journal-document-lexical-adapter";
import {
  JOURNAL_DOCUMENT_SCHEMA_VERSION,
  normalizeJournalDocumentOrThrow,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { createJournalLexicalExtension } from "@/components/garden/lexical-journal/journal-lexical-extensions";

const MEDIA_ID = "00000000-0000-4000-8000-000000000001";

const FULL_DOCUMENT: JournalDocumentV1 = {
  schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
  blocks: [
    {
      id: "p1",
      type: "paragraph",
      spans: [
        { text: "Полив ", marks: [{ type: "bold" }] },
        {
          text: "сьогодні",
          marks: [
            { type: "italic" },
            { type: "link", href: "https://example.com/care" },
          ],
        },
        { text: "\nпісля заходу" },
      ],
    },
    {
      id: "h2",
      type: "heading",
      level: 2,
      spans: [{ text: "Спостереження" }],
    },
    {
      id: "list1",
      type: "list",
      style: "ordered",
      items: [
        {
          spans: [{ text: "Перший листок" }],
          items: [{ spans: [{ text: "Без плям" }] }],
        },
        { spans: [{ text: "Другий листок" }] },
      ],
    },
    {
      id: "quote1",
      type: "quote",
      spans: [{ text: "Рости повільно", marks: [{ type: "italic" }] }],
      attributionSpans: [{ text: "бабуся" }],
    },
    { id: "rule1", type: "delimiter" },
    { id: "image1", type: "image", mediaAssetId: MEDIA_ID },
  ],
};

const JOURNAL_NODES = [...JOURNAL_LEXICAL_NODE_CLASSES];

describe("JournalDocumentV1 Lexical adapter", () => {
  it("round-trips every supported block, mark, quote field, newline, ID, and media identity", () => {
    const state = journalDocumentV1ToLexicalEditorState(FULL_DOCUMENT);

    expect(lexicalEditorStateToJournalDocumentV1(state)).toEqual(
      normalizeJournalDocumentOrThrow(FULL_DOCUMENT),
    );
  });

  it("keeps adjacent same-style canonical lists as distinct domain blocks", () => {
    const document: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "list-a",
          type: "list",
          style: "unordered",
          items: [{ spans: [{ text: "A" }] }],
        },
        {
          id: "list-b",
          type: "list",
          style: "unordered",
          items: [{ spans: [{ text: "B" }] }],
        },
      ],
    };

    expect(
      lexicalEditorStateToJournalDocumentV1(
        journalDocumentV1ToLexicalEditorState(document),
      ),
    ).toEqual(document);
  });

  it("round-trips all exact numeric boundaries without leaking a Lexical key", () => {
    const document: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: Array.from({ length: 100 }, (_, index) =>
        index < 10
          ? {
              id: `image-${index + 1}`,
              type: "image" as const,
              mediaAssetId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            }
          : {
              id: `paragraph-${index + 1}`,
              type: "paragraph" as const,
              spans: [{ text: index === 99 ? "кінець" : "" }],
            },
      ),
    };

    const back = lexicalEditorStateToJournalDocumentV1(
      journalDocumentV1ToLexicalEditorState(document),
    );

    expect(back).toEqual(document);
    expect(JSON.stringify(back)).not.toMatch(/__key|nodeKey|root_[0-9]/);
  });

  it("rejects invalid canonical input before creating an editor snapshot", () => {
    expect(() =>
      journalDocumentV1ToLexicalEditorState({
        schemaVersion: 1,
        blocks: [
          {
            id: "p1",
            type: "paragraph",
            spans: [
              {
                text: "bad",
                marks: [{ type: "link", href: "javascript:alert(1)" }],
              },
            ],
          },
        ],
      } as JournalDocumentV1),
    ).toThrowError(JournalLexicalAdapterError);
  });

  it("fails closed when internal state contains an unknown structural node", () => {
    const editor = createEditor({
      namespace: "journal-unknown-node-test",
      nodes: [...JOURNAL_NODES, UnsupportedNode],
      onError: (error) => {
        throw error;
      },
    });
    editor.update(
      () => {
        $getRoot().clear().append(new UnsupportedNode());
      },
      { discrete: true },
    );

    expect(() =>
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()),
    ).toThrowError(
      expect.objectContaining({
        code: "unsupported_node",
      }),
    );
  });

  it("fails closed on an unsupported text mark instead of silently dropping it", () => {
    const editor = createEditor({
      namespace: "journal-unsupported-mark-test",
      nodes: JOURNAL_NODES,
      onError: (error) => {
        throw error;
      },
    });
    editor.update(
      () => {
        const paragraph = $setJournalBlockId($createParagraphNode(), "p1");
        paragraph.append(
          $createTextNode("underlined").toggleFormat("underline"),
        );
        $getRoot().clear().append(paragraph);
      },
      { discrete: true },
    );

    expect(() =>
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()),
    ).toThrowError(
      expect.objectContaining({
        code: "unsupported_mark",
      }),
    );
  });

  it("fails closed on unsupported block alignment instead of dropping it", () => {
    const editor = createEditor({
      namespace: "journal-unsupported-element-format-test",
      nodes: JOURNAL_NODES,
      onError: (error) => {
        throw error;
      },
    });
    editor.update(
      () => {
        const paragraph = $setJournalBlockId($createParagraphNode(), "p1");
        paragraph.setFormat("center").append($createTextNode("centered"));
        $getRoot().clear().append(paragraph);
      },
      { discrete: true },
    );

    expect(() =>
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()),
    ).toThrowError(expect.objectContaining({ code: "unsupported_mark" }));
  });

  it("fails closed on unsupported list-item presentation state", () => {
    const editor = createEditor({
      namespace: "journal-unsupported-list-item-format-test",
      nodes: JOURNAL_NODES,
      onError: (error) => {
        throw error;
      },
    });
    editor.update(
      () => {
        const list = $setJournalBlockId($createListNode("bullet"), "list-1");
        const item = $createListItemNode();
        item.setFormat("center").append($createTextNode("centered"));
        list.append(item);
        $getRoot().clear().append(list);
      },
      { discrete: true },
    );

    expect(() =>
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()),
    ).toThrowError(expect.objectContaining({ code: "unsupported_mark" }));
  });

  it("fails closed on an ordered-list counter outside the canonical model", () => {
    const editor = createEditor({
      namespace: "journal-unsupported-list-start-test",
      nodes: JOURNAL_NODES,
      onError: (error) => {
        throw error;
      },
    });
    editor.update(
      () => {
        const list = $setJournalBlockId($createListNode("number", 5), "list-1");
        list.append($createListItemNode().append($createTextNode("fifth")));
        $getRoot().clear().append(list);
      },
      { discrete: true },
    );

    expect(() =>
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()),
    ).toThrowError(expect.objectContaining({ code: "unsupported_mark" }));
  });

  it("fails closed on non-canonical link metadata", () => {
    const editor = createEditor({
      namespace: "journal-unsupported-link-metadata-test",
      nodes: JOURNAL_NODES,
      onError: (error) => {
        throw error;
      },
    });
    editor.update(
      () => {
        const paragraph = $setJournalBlockId($createParagraphNode(), "p1");
        const link = $createLinkNode("https://example.com");
        link.setTarget("_blank").append($createTextNode("external"));
        paragraph.append(link);
        $getRoot().clear().append(paragraph);
      },
      { discrete: true },
    );

    expect(() =>
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()),
    ).toThrowError(expect.objectContaining({ code: "unsupported_mark" }));
  });

  it("ignores non-rendered element typing context while preserving canonical text marks", () => {
    const editor = createEditor({
      namespace: "journal-element-typing-context-test",
      nodes: JOURNAL_NODES,
      onError: (error) => {
        throw error;
      },
    });
    editor.update(
      () => {
        const paragraph = $setJournalBlockId($createParagraphNode(), "p1");
        paragraph
          .setTextFormat(1)
          .setTextStyle("color: rgb(255, 0, 0)")
          .append($createTextNode("canonical").toggleFormat("bold"));
        $getRoot().clear().append(paragraph);
      },
      { discrete: true },
    );

    expect(
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()),
    ).toEqual({
      schemaVersion: 1,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          spans: [{ text: "canonical", marks: [{ type: "bold" }] }],
        },
      ],
    });
  });

  it("exports the native link command without degrading the last good snapshot", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({
        initialDocument: {
          schemaVersion: 1,
          blocks: [
            { id: "p1", type: "paragraph", spans: [{ text: "safe link" }] },
          ],
        },
      }),
    );
    editor.update(
      () => {
        const paragraph = $getRoot().getFirstChildOrThrow();
        if (!$isElementNode(paragraph)) throw new Error("Expected paragraph");
        paragraph.select(0, paragraph.getChildrenSize());
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, "https://example.com/a");
      },
      { discrete: true },
    );

    expect(
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()),
    ).toEqual({
      schemaVersion: 1,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          spans: [
            {
              text: "safe link",
              marks: [{ type: "link", href: "https://example.com/a" }],
            },
          ],
        },
      ],
    });
  });

  it("exports the native list-indent tree at the canonical depth-two boundary", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({
        initialDocument: {
          schemaVersion: 1,
          blocks: [
            {
              id: "list-id",
              type: "list",
              style: "unordered",
              items: [
                { spans: [{ text: "Parent" }] },
                { spans: [{ text: "Child" }] },
              ],
            },
          ],
        },
      }),
    );

    editor.update(
      () => {
        const list = $getRoot().getFirstChildOrThrow();
        if (!(list instanceof ListNode)) throw new Error("Expected list");
        const second = list.getChildAtIndex(1);
        if (!(second instanceof ListItemNode)) throw new Error("Expected item");
        second.selectStart();
        editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
        editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
      },
      { discrete: true },
    );

    expect(
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()).blocks[0],
    ).toEqual({
      id: "list-id",
      type: "list",
      style: "unordered",
      items: [
        {
          spans: [{ text: "Parent" }],
          items: [{ spans: [{ text: "Child" }] }],
        },
      ],
    });
  });
});

class UnsupportedNode extends ElementNode {
  $config() {
    return this.config("unsupported-journal-test", { extends: ElementNode });
  }

  createDOM(): HTMLElement {
    return document.createElement("section");
  }

  updateDOM(): false {
    return false;
  }

  static create(): LexicalNode {
    return new UnsupportedNode();
  }
}
