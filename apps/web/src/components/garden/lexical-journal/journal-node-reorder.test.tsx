import { buildEditorFromExtensions } from "@lexical/extension";
import { REDO_COMMAND, UNDO_COMMAND } from "lexical";
import { describe, expect, it } from "vitest";

import { createJournalLexicalExtension } from "./journal-lexical-extensions";
import {
  moveJournalBlockById,
  moveJournalBlockToIndex,
  removeJournalBlockById,
} from "./journal-node-reorder-plugin";
import { lexicalEditorStateToJournalDocumentV1 } from "@/lib/garden/journal-document-lexical-adapter";

const INITIAL = {
  schemaVersion: 1 as const,
  blocks: [
    { id: "a", type: "paragraph" as const, spans: [{ text: "A" }] },
    { id: "b", type: "paragraph" as const, spans: [{ text: "B" }] },
    { id: "c", type: "paragraph" as const, spans: [{ text: "C" }] },
  ],
};

describe("native Lexical journal block reorder", () => {
  it("moves one top-level semantic node through an app command and preserves IDs", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({ initialDocument: INITIAL }),
    );

    expect(
      moveJournalBlockToIndex(editor, {
        blockId: "c",
        toIndex: 0,
      }),
    ).toBe("moved");

    expect(
      lexicalEditorStateToJournalDocumentV1(editor.getEditorState()).blocks.map(
        ({ id }) => id,
      ),
    ).toEqual(["c", "a", "b"]);
  });

  it("treats boundaries and missing IDs as noops", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({ initialDocument: INITIAL }),
    );

    expect(moveJournalBlockById(editor, "a", -1)).toBe("noop");
    expect(moveJournalBlockById(editor, "c", 1)).toBe("noop");
    expect(moveJournalBlockById(editor, "missing", 1)).toBe("noop");
    expect(moveJournalBlockById(editor, "b", -1)).toBe("moved");
  });

  it("records a reorder as one history transaction and restores exact IDs", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({ initialDocument: INITIAL }),
    );

    moveJournalBlockToIndex(editor, {
      blockId: "a",
      toIndex: 2,
    });
    expect(readIds(editor)).toEqual(["b", "c", "a"]);

    expect(editor.dispatchCommand(UNDO_COMMAND, undefined)).toBe(true);
    expect(readIds(editor)).toEqual(["a", "b", "c"]);

    expect(editor.dispatchCommand(REDO_COMMAND, undefined)).toBe(true);
    expect(readIds(editor)).toEqual(["b", "c", "a"]);
  });

  it("deletes a semantic block as one undoable native-tree transaction", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({ initialDocument: INITIAL }),
    );

    expect(removeJournalBlockById(editor, "b")).toBe("removed");
    expect(readIds(editor)).toEqual(["a", "c"]);

    expect(editor.dispatchCommand(UNDO_COMMAND, undefined)).toBe(true);
    expect(readIds(editor)).toEqual(["a", "b", "c"]);

    expect(editor.dispatchCommand(REDO_COMMAND, undefined)).toBe(true);
    expect(readIds(editor)).toEqual(["a", "c"]);
  });

  it("replaces the final removed block with one fresh canonical paragraph", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({
        initialDocument: {
          schemaVersion: 1,
          blocks: [{ id: "only", type: "paragraph", spans: [{ text: "A" }] }],
        },
      }),
    );

    expect(removeJournalBlockById(editor, "only")).toBe("removed");
    const document = lexicalEditorStateToJournalDocumentV1(
      editor.getEditorState(),
    );
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]).toMatchObject({
      type: "paragraph",
      spans: [{ text: "" }],
    });
    expect(document.blocks[0].id).not.toBe("only");
  });

  it("refuses generic image deletion so media cleanup cannot be bypassed", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({
        initialDocument: {
          schemaVersion: 1,
          blocks: [
            {
              id: "image",
              type: "image",
              mediaAssetId: "00000000-0000-4000-8000-000000000001",
            },
          ],
        },
      }),
    );

    expect(removeJournalBlockById(editor, "image")).toBe("noop");
    expect(readIds(editor)).toEqual(["image"]);
  });
});

function readIds(editor: Parameters<typeof moveJournalBlockById>[0]): string[] {
  editor.read(() => undefined);
  return lexicalEditorStateToJournalDocumentV1(
    editor.getEditorState(),
  ).blocks.map(({ id }) => id);
}
