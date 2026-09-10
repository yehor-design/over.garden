import { buildEditorFromExtensions } from "@lexical/extension";
import { $getRoot } from "lexical";
import { describe, expect, it } from "vitest";

import {
  $activeJournalBlockCommandId,
  $turnJournalBlockInto,
  JOURNAL_BLOCK_COMMANDS,
  JOURNAL_BLOCK_COMMAND_IDS,
  JOURNAL_TURN_INTO_COMMAND_IDS,
  type JournalBlockCommandId,
} from "./journal-block-commands";
import { createJournalLexicalExtension } from "./journal-lexical-extensions";
import { lexicalEditorStateToJournalDocumentV1 } from "@/lib/garden/journal-document-lexical-adapter";
import type { JournalDocumentV1 } from "@/lib/garden/journal-document";

function turn(document: JournalDocumentV1, commandId: JournalBlockCommandId) {
  using editor = buildEditorFromExtensions(
    createJournalLexicalExtension({ initialDocument: document }),
  );
  editor.update(
    () => {
      const first = $getRoot().getFirstChildOrThrow();
      if (!("selectEnd" in first)) throw new Error("expected an element");
      (first as { selectEnd(): void }).selectEnd();
      $turnJournalBlockInto(commandId);
    },
    { discrete: true },
  );
  return lexicalEditorStateToJournalDocumentV1(editor.getEditorState()).blocks;
}

const paragraph: JournalDocumentV1 = {
  schemaVersion: 1,
  blocks: [{ id: "b1", type: "paragraph", spans: [{ text: "Полив" }] }],
};

describe("journal block commands", () => {
  it("declares every id exactly once, with turn-into excluding the two inserts", () => {
    expect(JOURNAL_BLOCK_COMMANDS.map((command) => command.id)).toEqual([
      ...JOURNAL_BLOCK_COMMAND_IDS,
    ]);
    expect(new Set(JOURNAL_BLOCK_COMMAND_IDS).size).toBe(
      JOURNAL_BLOCK_COMMAND_IDS.length,
    );
    expect(JOURNAL_TURN_INTO_COMMAND_IDS).not.toContain("delimiter");
    expect(JOURNAL_TURN_INTO_COMMAND_IDS).not.toContain("image");
  });

  it("turns a paragraph into every other text-like block, keeping its id", () => {
    for (const commandId of JOURNAL_TURN_INTO_COMMAND_IDS) {
      if (commandId === "paragraph") continue;
      const blocks = turn(paragraph, commandId);
      expect(blocks[0]?.id).toBe("b1");
      expect(
        JSON.stringify(blocks).includes("Полив"),
        `${commandId} dropped the text`,
      ).toBe(true);
    }
  });

  it("gives every list item its own block when a list becomes text", () => {
    const list: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "l1",
          type: "list",
          style: "unordered",
          items: [
            {
              spans: [{ text: "перше" }],
              items: [{ spans: [{ text: "вкладене" }] }],
            },
            { spans: [{ text: "друге" }] },
          ],
        },
      ],
    };

    const blocks = turn(list, "paragraph");

    // Three items in, three paragraphs out: nothing is dropped on the way.
    expect(blocks).toHaveLength(3);
    expect(
      blocks.map((block) =>
        block.type === "paragraph" ? JSON.stringify(block.spans) : block.type,
      ),
    ).toEqual([
      JSON.stringify([{ text: "перше" }]),
      JSON.stringify([{ text: "вкладене" }]),
      JSON.stringify([{ text: "друге" }]),
    ]);
    expect(blocks[0]?.id).toBe("l1");
    expect(new Set(blocks.map((block) => block.id)).size).toBe(3);
  });

  it("splits a code block by line and keeps a quote's attribution", () => {
    const code: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "k1",
          type: "code",
          language: "sql",
          text: "select 1;\nselect 2;",
        },
      ],
    };
    expect(turn(code, "bulletList")).toEqual([
      {
        id: "k1",
        type: "list",
        style: "unordered",
        items: [
          { spans: [{ text: "select 1;" }] },
          { spans: [{ text: "select 2;" }] },
        ],
      },
    ]);

    const quote: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "q1",
          type: "quote",
          spans: [{ text: "Рости повільно" }],
          attributionSpans: [{ text: "бабуся" }],
        },
      ],
    };
    const asText = turn(quote, "paragraph");
    expect(asText).toHaveLength(2);
    expect(JSON.stringify(asText)).toContain("бабуся");
  });

  it("drops marks when text becomes code, because code has no field for them", () => {
    const marked: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          spans: [{ text: "SELECT", marks: [{ type: "bold" }] }],
        },
      ],
    };
    expect(turn(marked, "code")).toEqual([
      { id: "b1", type: "code", language: "plain", text: "SELECT" },
    ]);
  });

  it("does nothing when the block is already what was asked for", () => {
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({ initialDocument: paragraph }),
    );
    let changed = true;
    editor.update(
      () => {
        const first = $getRoot().getFirstChildOrThrow();
        (first as unknown as { selectEnd(): void }).selectEnd();
        expect($activeJournalBlockCommandId()).toBe("paragraph");
        changed = $turnJournalBlockInto("paragraph");
      },
      { discrete: true },
    );
    expect(changed).toBe(false);
  });

  it("reports the active block for each style", () => {
    const document: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "t1",
          type: "list",
          style: "todo",
          items: [{ spans: [{ text: "a" }], checked: false }],
        },
      ],
    };
    using editor = buildEditorFromExtensions(
      createJournalLexicalExtension({ initialDocument: document }),
    );
    editor.update(
      () => {
        const first = $getRoot().getFirstChildOrThrow();
        (first as unknown as { selectEnd(): void }).selectEnd();
        expect($activeJournalBlockCommandId()).toBe("todoList");
      },
      { discrete: true },
    );
  });
});
