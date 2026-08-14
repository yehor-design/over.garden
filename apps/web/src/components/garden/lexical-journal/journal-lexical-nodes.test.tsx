import { buildEditorFromExtensions } from "@lexical/extension";
import { $isListItemNode, $isListNode } from "@lexical/list";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  createEditor,
  DELETE_CHARACTER_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
} from "lexical";
import { describe, expect, it } from "vitest";

import {
  $createOverGardenImageNode,
  $createOverGardenQuoteAttributionNode,
  $createOverGardenQuoteBodyNode,
  $createOverGardenQuoteNode,
  $getJournalBlockId,
  $isOverGardenQuoteBodyNode,
  $isOverGardenQuoteNode,
  $setJournalBlockId,
} from "./journal-lexical-nodes";
import {
  JOURNAL_LEXICAL_NODE_CLASSES,
  journalDocumentV1ToLexicalEditorState,
  lexicalEditorStateToJournalDocumentV1,
} from "@/lib/garden/journal-document-lexical-adapter";
import { JOURNAL_BLOCK_ID_PATTERN } from "@/lib/garden/journal-document";
import { createJournalLexicalExtension } from "./journal-lexical-extensions";
import { $formatSelectedJournalBlockAsList } from "./journal-lexical-toolbar";

const NODES = [...JOURNAL_LEXICAL_NODE_CLASSES];

describe("OverGarden Lexical nodes", () => {
  it("stores application IDs in NodeState while Lexical keys stay transient", () => {
    const editor = createEditor({
      namespace: "journal-node-state",
      nodes: NODES,
    });
    let runtimeKey = "";
    editor.update(
      () => {
        const paragraph = $setJournalBlockId(
          $createParagraphNode(),
          "p-domain",
        );
        runtimeKey = paragraph.getKey();
        paragraph.append($createTextNode("text"));
        $getRoot().clear().append(paragraph);
      },
      { discrete: true },
    );

    editor.read(() => {
      const paragraph = $getRoot().getFirstChildOrThrow();
      expect($getJournalBlockId(paragraph)).toBe("p-domain");
      expect(paragraph.getKey()).toBe(runtimeKey);
      expect(paragraph.getKey()).not.toBe("p-domain");
    });
  });

  it("keeps image state to blockId/mediaAssetId and preview URLs ephemeral", () => {
    const editor = createEditor({
      namespace: "journal-image-state",
      nodes: NODES,
    });
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createOverGardenImageNode({
              blockId: "image-domain",
              mediaAssetId: "00000000-0000-4000-8000-000000000001",
            }),
          );
      },
      { discrete: true },
    );

    const serialized = JSON.stringify(editor.getEditorState().toJSON());
    expect(serialized).toContain("image-domain");
    expect(serialized).toContain("00000000-0000-4000-8000-000000000001");
    expect(serialized).not.toMatch(/blob:|https?:\/\//);
  });

  it("represents quote attribution in one native tree without a nested editor", () => {
    const editor = createEditor({
      namespace: "journal-quote-tree",
      nodes: NODES,
    });
    editor.update(
      () => {
        const quote = $createOverGardenQuoteNode("quote-domain");
        quote.append(
          $createOverGardenQuoteBodyNode().append($createTextNode("Тіло")),
          $createOverGardenQuoteAttributionNode().append(
            $createTextNode("Автор"),
          ),
        );
        $getRoot().clear().append(quote);
      },
      { discrete: true },
    );

    expect(
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()).blocks[0],
    ).toEqual({
      id: "quote-domain",
      type: "quote",
      spans: [{ text: "Тіло" }],
      attributionSpans: [{ text: "Автор" }],
    });
  });

  it("rejects a quote with two attributions instead of choosing one", () => {
    const editor = createEditor({
      namespace: "journal-bad-quote",
      nodes: NODES,
    });
    editor.update(
      () => {
        const quote = $createOverGardenQuoteNode("quote-domain");
        quote.append(
          $createOverGardenQuoteBodyNode().append($createTextNode("Тіло")),
          $createOverGardenQuoteAttributionNode().append($createTextNode("A")),
          $createOverGardenQuoteAttributionNode().append($createTextNode("B")),
        );
        $getRoot().clear().append(quote);
      },
      { discrete: true },
    );

    expect(() =>
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()),
    ).toThrowError(expect.objectContaining({ code: "invalid_tree" }));
  });

  it("hydrates custom nodes and round-trips their exact identities", () => {
    const state = journalDocumentV1ToLexicalEditorState({
      schemaVersion: 1,
      blocks: [
        {
          id: "quote-domain",
          type: "quote",
          spans: [{ text: "Body" }],
          attributionSpans: [{ text: "Attribution" }],
        },
        {
          id: "image-domain",
          type: "image",
          mediaAssetId: "00000000-0000-4000-8000-000000000001",
        },
      ],
    });

    expect(lexicalEditorStateToJournalDocumentV1(state)).toEqual({
      schemaVersion: 1,
      blocks: [
        {
          id: "quote-domain",
          type: "quote",
          spans: [{ text: "Body" }],
          attributionSpans: [{ text: "Attribution" }],
        },
        {
          id: "image-domain",
          type: "image",
          mediaAssetId: "00000000-0000-4000-8000-000000000001",
        },
      ],
    });
  });

  it("keeps the leading ID and assigns a fresh cryptographic ID on split", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({
        initialDocument: {
          schemaVersion: 1,
          blocks: [
            { id: "original-id", type: "paragraph", spans: [{ text: "AB" }] },
          ],
        },
      }),
    );

    editor.update(
      () => {
        const block = $getRoot().getFirstChildOrThrow();
        if (!$isElementNode(block)) throw new Error("Expected element node");
        const text = block.getFirstChildOrThrow();
        if (!$isTextNode(text)) throw new Error("Expected text node");
        text.select(1, 1);
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      },
      { discrete: true },
    );

    const split = lexicalEditorStateToJournalDocumentV1(
      editor.getEditorState(),
    );
    expect(split.blocks.map((block) => block.id)[0]).toBe("original-id");
    expect(split.blocks[1].id).not.toBe("original-id");
    expect(split.blocks[1].id).toMatch(JOURNAL_BLOCK_ID_PATTERN);
    expect(split.blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
  });

  it("keeps the receiving block ID when adjacent paragraphs merge", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({
        initialDocument: {
          schemaVersion: 1,
          blocks: [
            { id: "receiving-id", type: "paragraph", spans: [{ text: "A" }] },
            { id: "merged-id", type: "paragraph", spans: [{ text: "B" }] },
          ],
        },
      }),
    );

    editor.update(
      () => {
        const trailing = $getRoot().getLastChildOrThrow();
        if (!$isElementNode(trailing)) throw new Error("Expected element node");
        trailing.selectStart();
        editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
      },
      { discrete: true },
    );

    expect(
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()).blocks,
    ).toEqual([
      {
        id: "receiving-id",
        type: "paragraph",
        spans: [{ text: "AB" }],
      },
    ]);
  });

  it("converts only the selected block to a list without merging adjacent domain IDs", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({
        initialDocument: {
          schemaVersion: 1,
          blocks: [
            {
              id: "list-before",
              type: "list",
              style: "unordered",
              items: [{ spans: [{ text: "Before" }] }],
            },
            {
              id: "selected-paragraph",
              type: "paragraph",
              spans: [{ text: "Selected" }],
            },
            {
              id: "list-after",
              type: "list",
              style: "unordered",
              items: [{ spans: [{ text: "After" }] }],
            },
          ],
        },
      }),
    );

    editor.update(
      () => {
        const selected = $getRoot().getChildAtIndex(1);
        if (!$isElementNode(selected)) throw new Error("Expected paragraph");
        selected.selectStart();
        expect($formatSelectedJournalBlockAsList("bullet")).toBe(true);
      },
      { discrete: true },
    );

    const document = lexicalEditorStateToJournalDocumentV1(
      editor.getEditorState(),
    );
    expect(document.blocks.map(({ id }) => id)).toEqual([
      "list-before",
      "selected-paragraph",
      "list-after",
    ]);
    expect(document.blocks.map(({ type }) => type)).toEqual([
      "list",
      "list",
      "list",
    ]);
  });

  it("retains native ordered-list numbering without enabling cross-block merge", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({
        initialDocument: {
          schemaVersion: 1,
          blocks: [
            {
              id: "ordered",
              type: "list",
              style: "ordered",
              items: [
                { spans: [{ text: "One" }] },
                { spans: [{ text: "Two" }] },
              ],
            },
          ],
        },
      }),
    );

    let values: number[] = [];
    editor.getEditorState().read(() => {
      const list = $getRoot().getFirstChild();
      if (!$isListNode(list)) throw new Error("Expected list");
      values = list
        .getChildren()
        .filter($isListItemNode)
        .map((item) => item.getValue());
    });
    expect(values).toEqual([1, 2]);
  });

  it("exits a quote through its native tree without duplicating the quote body", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({
        initialDocument: {
          schemaVersion: 1,
          blocks: [
            {
              id: "quote-id",
              type: "quote",
              spans: [{ text: "AB" }],
              attributionSpans: [{ text: "Author" }],
            },
          ],
        },
      }),
    );

    editor.update(
      () => {
        const quote = $getRoot().getFirstChildOrThrow();
        if (!$isOverGardenQuoteNode(quote)) throw new Error("Expected quote");
        const body = quote.getFirstChildOrThrow();
        if (!$isOverGardenQuoteBodyNode(body)) throw new Error("Expected body");
        const text = body.getFirstChildOrThrow();
        if (!$isTextNode(text)) throw new Error("Expected text node");
        text.select(1, 1);
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      },
      { discrete: true },
    );

    const blocks = lexicalEditorStateToJournalDocumentV1(
      editor.getEditorState(),
    ).blocks;
    expect(blocks[0]).toEqual({
      id: "quote-id",
      type: "quote",
      spans: [{ text: "A" }],
      attributionSpans: [{ text: "Author" }],
    });
    expect(blocks[1]).toEqual(
      expect.objectContaining({ type: "paragraph", spans: [{ text: "B" }] }),
    );
    expect(blocks[1].id).toMatch(JOURNAL_BLOCK_ID_PATTERN);
  });
});
