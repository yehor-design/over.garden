import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JournalDocumentRenderer } from "./journal-document-renderer";
import {
  DEFAULT_JOURNAL_CALLOUT_ICON,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import {
  PRE_SLICE_26_DOCUMENT,
  PRE_SLICE_26_IMAGES,
} from "./journal-document-pre-slice-26.fixture";

const COPY = { unavailableTitle: "Немає", unavailableBody: "Не показати" };

function render(document: JournalDocumentV1): string {
  return renderToStaticMarkup(
    <JournalDocumentRenderer document={document} copy={COPY} />,
  );
}

describe("JournalDocumentRenderer, Notion basic blocks", () => {
  it("keeps the page's one h1 for the entry title and typesets level 1 as h2", () => {
    const html = render({
      schemaVersion: 1,
      blocks: [
        { id: "a", type: "heading", level: 1, spans: [{ text: "Перший" }] },
        { id: "b", type: "heading", level: 2, spans: [{ text: "Другий" }] },
        { id: "c", type: "heading", level: 3, spans: [{ text: "Третій" }] },
      ],
    });

    expect(html).not.toContain("<h1");
    expect(html).toContain('data-level="1"');
    expect(html).toContain('data-level="2"');
    expect(html).toContain('data-level="3"');
    // Levels 2 and 3 render exactly the tags they always have.
    expect(html).toContain("<h3");
    expect(html.match(/<h2/g)).toHaveLength(2);
  });

  it("renders a to-do list as a labelled, inert checkbox per item", () => {
    const html = render({
      schemaVersion: 1,
      blocks: [
        {
          id: "l",
          type: "list",
          style: "todo",
          items: [
            { spans: [{ text: "полити" }], checked: true },
            { spans: [{ text: "прополоти" }], checked: false },
          ],
        },
      ],
    });

    expect(html).toContain('data-list-style="todo"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    expect(html.match(/<input type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("<label");
    expect(html).toContain("line-through");
  });

  it("renders a callout as a note, not a landmark, with the icon hidden", () => {
    const html = render({
      schemaVersion: 1,
      blocks: [
        {
          id: "c",
          type: "callout",
          icon: DEFAULT_JOURNAL_CALLOUT_ICON,
          spans: [{ text: "Порада" }],
        },
      ],
    });

    expect(html).toContain('role="note"');
    expect(html).not.toContain("<aside");
    expect(html).toContain(`data-icon="${DEFAULT_JOURNAL_CALLOUT_ICON}"`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Порада");
  });

  it("renders code in a scrolling pre with its language on the code element", () => {
    const html = render({
      schemaVersion: 1,
      blocks: [
        {
          id: "k",
          type: "code",
          language: "sql",
          text: "select 1;\nselect 2;",
        },
      ],
    });

    expect(html).toContain('data-language="sql"');
    expect(html).toContain('class="language-sql"');
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("select 1;");
  });

  it("nests marks innermost-first: code inside bold inside the link", () => {
    const html = render({
      schemaVersion: 1,
      blocks: [
        {
          id: "p",
          type: "paragraph",
          spans: [
            {
              text: "x",
              marks: [
                { type: "code" },
                { type: "bold" },
                { type: "underline" },
                { type: "strikethrough" },
                { type: "link", href: "https://example.com/" },
              ],
            },
          ],
        },
      ],
    });

    expect(html).toContain("<u>");
    expect(html).toContain("<s>");
    expect(html.indexOf("<a")).toBeLessThan(html.indexOf("<s"));
    expect(html.indexOf("<s")).toBeLessThan(html.indexOf("<u"));
    expect(html.indexOf("<u")).toBeLessThan(html.indexOf("<strong"));
    expect(html.indexOf("<strong")).toBeLessThan(html.indexOf("<code"));
  });
});

/* ── The byte-identical guarantee (ADR-0028, OVE-449) ────────────────────────
   An entry published before Slice 26 must still produce byte-identical HTML.
   The check is a golden file rather than a set of assertions, because the
   promise is about *bytes* and an assertion only covers what somebody thought
   to assert. `journal-document-pre-slice-26.golden.html` was generated from
   `origin/main` — literally "rendered before" — and committed; this test is
   "rendered after".

   What it does **not** cover, and what nothing in this repository can: the
   prose of the entries actually in production. Reading production is denied to
   the agent in this environment, so the subject here is the whole pre-Slice-26
   *surface* instead of a sample of real rows — every block and mark the
   contract held when ADR-0028 arrived, and none that came after. Two further
   facts close the gap in practice: `git diff origin/main` on
   `journal-document-renderer.tsx` is empty, and `public-journal-entry.tsx`
   passes the renderer no `className`, so the document's own markup has no
   route by which it could have changed.
   ───────────────────────────────────────────────────────────────────────── */

describe("an entry published before Slice 26", () => {
  it("renders byte for byte what it rendered before", async () => {
    const html = renderToStaticMarkup(
      <JournalDocumentRenderer
        document={PRE_SLICE_26_DOCUMENT}
        imagesByMediaId={PRE_SLICE_26_IMAGES}
        copy={COPY}
      />,
    );

    await expect(html).toMatchFileSnapshot(
      "./journal-document-pre-slice-26.golden.html",
    );
  });

  it("holds none of the blocks or marks Slice 26 added", () => {
    // Otherwise the fixture would stop being a statement about old entries.
    const serialized = JSON.stringify(PRE_SLICE_26_DOCUMENT);
    for (const later of [
      '"todo"',
      '"callout"',
      '"code"',
      '"underline"',
      '"strikethrough"',
      '"checked"',
      '"level":1',
    ]) {
      expect(serialized, `${later} is Slice 26's, not before it`).not.toContain(
        later,
      );
    }
  });
});
