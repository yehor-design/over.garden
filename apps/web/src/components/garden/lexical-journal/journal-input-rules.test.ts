import { buildEditorFromExtensions } from "@lexical/extension";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  UNDO_COMMAND,
} from "lexical";
import { describe, expect, it } from "vitest";

import { createJournalLexicalExtension } from "./journal-lexical-extensions";
import { JOURNAL_BLOCK_INPUT_RULES } from "./journal-input-rules";
import { lexicalEditorStateToJournalDocumentV1 } from "@/lib/garden/journal-document-lexical-adapter";
import type { JournalDocumentV1 } from "@/lib/garden/journal-document";

const EMPTY: JournalDocumentV1 = {
  schemaVersion: 1,
  blocks: [{ id: "b1", type: "paragraph", spans: [{ text: "" }] }],
};

function editorWith(document: JournalDocumentV1 = EMPTY) {
  return buildEditorFromExtensions(
    createJournalLexicalExtension({ initialDocument: document }),
  );
}

/** Types the characters the way a person would: one commit per character. */
function type(editor: ReturnType<typeof editorWith>, text: string) {
  editor.update(
    () => {
      $getRoot().getLastChild<import("lexical").ElementNode>()?.selectEnd();
    },
    { discrete: true },
  );
  for (const character of text) {
    editor.update(
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(character);
      },
      { discrete: true },
    );
  }
}

function blocks(editor: ReturnType<typeof editorWith>) {
  return lexicalEditorStateToJournalDocumentV1(editor.getEditorState()).blocks;
}

describe("journal input rules", () => {
  it("turns every block trigger into its block, and keeps the id", () => {
    for (const rule of JOURNAL_BLOCK_INPUT_RULES) {
      using editor = editorWith();
      type(editor, rule.trigger);
      const [first] = blocks(editor);
      expect(first?.type, `${rule.trigger} produced ${first?.type}`).not.toBe(
        "paragraph",
      );
      expect(first?.id).toBe("b1");
    }
  });

  it("pre-checks the item that `[x] ` creates", () => {
    using editor = editorWith();
    type(editor, "[x] ");
    const [first] = blocks(editor);
    expect(first?.type === "list" && first.style).toBe("todo");
    expect(first?.type === "list" && first.items[0]?.checked).toBe(true);
  });

  it("only fires at the start of a block", () => {
    using editor = editorWith();
    type(editor, "Полив # ");
    expect(blocks(editor)[0]?.type).toBe("paragraph");
  });

  it("never fires inside a code block", () => {
    using editor = editorWith({
      schemaVersion: 1,
      blocks: [{ id: "k1", type: "code", language: "plain", text: "" }],
    });
    type(editor, "# ");
    expect(blocks(editor)).toEqual([
      { id: "k1", type: "code", language: "plain", text: "# " },
    ]);
  });

  it("marks an inline run and leaves the next character plain", () => {
    using editor = editorWith();
    type(editor, "дуже **важливо** так");
    const [first] = blocks(editor);
    expect(first?.type === "paragraph" && first.spans).toEqual([
      { text: "дуже " },
      { text: "важливо", marks: [{ type: "bold" }] },
      { text: " так" },
    ]);
  });

  it("applies each inline delimiter to its own format", () => {
    const cases: Array<[string, string]> = [
      ["~~ні~~", "strikethrough"],
      ["*так*", "italic"],
      ["`код`", "code"],
    ];
    for (const [typed, mark] of cases) {
      using editor = editorWith();
      type(editor, typed);
      const [first] = blocks(editor);
      const spans = first?.type === "paragraph" ? first.spans : [];
      expect(spans[0]?.marks?.[0]?.type, typed).toBe(mark);
    }
  });

  it("leaves an unmatched or empty delimiter alone", () => {
    using editor = editorWith();
    type(editor, "2 * 3 = 6");
    const [first] = blocks(editor);
    expect(first?.type === "paragraph" && first.spans).toEqual([
      { text: "2 * 3 = 6" },
    ]);
  });

  it("gives back the typed characters after one undo", () => {
    using editor = editorWith();
    type(editor, "## ");
    expect(blocks(editor)[0]?.type).toBe("heading");

    editor.update(
      () => {
        editor.dispatchCommand(UNDO_COMMAND, undefined);
      },
      { discrete: true },
    );

    const [first] = blocks(editor);
    expect(first?.type).toBe("paragraph");
    expect(first?.type === "paragraph" && first.spans[0]?.text).toBe("## ");
  });
});
