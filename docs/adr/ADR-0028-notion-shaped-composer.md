# ADR-0028 — The journal composer takes Notion's shape, and the document grows Notion's basic blocks

- **Status:** Accepted (decisions 2026-09-10). Implemented as SDD Slice 26,
  `OVE-411` through `OVE-417`.
- **Date:** 2026-09-10
- **Decision owner:** founder/owner
- **Supersedes:** the closed root-node list and the inline-mark list of
  ADR-0015, and the same two lists in `docs/STRUCTURED_JOURNAL_COMPOSER.md`.
  Everything else in ADR-0015 stands unchanged: Lexical 0.49.0 pinned exactly,
  `JournalDocumentV1` as the sole durable contract, editor state never
  persisted, and the forbidden list — Yjs, tables, `@lexical/code`,
  `@lexical/markdown`/mdast, hashtags, Dragon, devtools, the experimental
  draggable-block plugin and the experimental DOM pipelines.
- **Relates to:** ADR-0017 (no drafts, no durable browser state), ADR-0019 and
  the media policy (only a local file, only browser-made WebP), ADR-0022 D4
  (everything public is indexable), ADR-0023 (workspace failure is a designed
  state).

## Context

The composer works and is safe. It also looks like 2010: a wrapped row of
eleven glyph buttons — `P`, `H2`, `H3`, `•`, `1.`, `❝`, `—`, `B`, `I`, `🔗`,
`+▧`, `↶`, `↷` — sits above a bordered text area, and every block carries an
absolutely-positioned strip of move-up, move-down and delete controls at its
left. Nothing on screen tells a gardener what the editor can do until they
click something and watch buttons grey out.

The owner asked for the editor to look and behave like Notion: elements dragged
into place, elements added, text styles changed, "and so on". Notion is the
shape most people already know for exactly this kind of writing, so the ask is
about a known interaction model, not about a preference for one company's grey.

Two questions inside that ask have real consequences, and both were put to the
owner on 2026-09-10.

The first is the block set. Notion's editing model works over any set of
blocks, but Notion's *palette* is larger than `JournalDocumentV1`, which today
holds paragraph, H2, H3, ordered and unordered lists two levels deep, a quote
with an attribution, a delimiter and an image, marked bold, italic or linked.
Growing that set means growing a contract that public pages render, the search
index reads, the media lifecycle scans and eleven modules type-check against.

The second is how literal "1:1" should be. The editor sits inside a workspace
built from shadcn primitives on OverGarden's tokens, in Google Sans, with a
dark theme. Notion's own greys and font stack would make the editor a foreign
object inside its own application and would need a second dark palette written
by hand.

## Decision

### D1. The document grows Notion's basic blocks, additively, at schema version 1

`JournalDocumentV1` gains:

| addition | shape |
| --- | --- |
| heading level 1 | `heading.level: 1 \| 2 \| 3` (was `2 \| 3`) |
| to-do list | `list.style: 'unordered' \| 'ordered' \| 'todo'`, and `checked: boolean` on the items of a `todo` list |
| callout | `{ id, type: 'callout', icon, spans }` |
| code | `{ id, type: 'code', language, text }` |
| marks | `underline`, `strikethrough`, `code` beside `bold`, `italic`, `link` |

Every addition is optional by absence, so **the schema version stays 1 and no
stored row migrates**. There is no SQL in this slice:
`journal_entries.content_document` is `jsonb` whose only constraint is that it
is an object, and the block allowlist has always lived in
`apps/web/src/lib/garden/journal-document.ts`.

Two fields carry closed sets, not free text. `icon` is one of twelve emoji
chosen from a list the composer offers; `language` is one of eleven names. A
value outside either set is refused with `invalid_block`, the same way an
unknown block type always has been. Both fields are filled with their default
when omitted, so a normalized callout always has an icon and a normalized code
block always has a language, and no reader has to branch on absence.

`code.text` counts toward the existing budgets — 64 KiB per document, 20 000
characters of derived plain text, which is also the `journal_entries.body`
check constraint — and it joins the derived plain text, so a code block is
searchable like any other content.

**Declined in the same conversation:** text and background colour, and toggle
lists. Colour would put presentation into a contract that has so far carried
only meaning, and a toggle would put `<details>` into the public entry with a
nesting depth the list rules deliberately bound at two.

### D2. Marks have one canonical order

Normalization now keeps at most one mark of each type per span and sorts them
into one order: `code`, `bold`, `italic`, `underline`, `strikethrough`, `link`.

Two consequences, both wanted. The same emphasis always serializes to the same
bytes, so `semanticJournalDocumentHash` — which decides whether the composer
emits a change — cannot move when only the order does. And a span that arrives
carrying two links keeps the first instead of being refused: two links on one
span would render as nested anchors, which is invalid HTML, and normalization
repairs that rather than making the entry unrenderable.

### D3. Notion's canvas, OverGarden's tokens

The composer adopts Notion's spatial and interaction model:

- one 708 px column with a 40 px gutter;
- Notion's type scale and block rhythm;
- on the hovered *or focused* block, two gutter controls — `+` to add a block
  below, `⠿` to drag it;
- drag-and-drop with a thin insertion line and a translucent ghost;
- a `/` command menu at the caret;
- a floating toolbar on a text selection;
- markdown-shaped input rules while typing;
- a placeholder that names the slash key.

It does **not** adopt Notion's palette or font. Colours come from the existing
tokens — `--foreground`, `--muted`, `--border`, `--primary` — and the type from
Google Sans, so the dark theme works and the editor belongs to the application
it sits in.

The permanent button row is deleted. Everything it could do stays reachable:
by keyboard shortcut, by the slash menu, by the `+` menu, or by the block menu
behind `⠿`.

### D4. The public entry keeps its typography and learns the new blocks

`/journal/**` is cached, indexed and read by people who are not the author.
Its type scale, spacing and column width do not change in this slice.
`JournalDocumentRenderer` learns the four new shapes because correctness
demands it, in the page's existing visual language:

- **heading level 1** renders as `<h2>` typeset one step larger, with
  `data-level="1"`. The page's one `<h1>` is the entry title; a second `<h1>`
  inside the article would break the outline of a page whose whole point is to
  be indexed. Levels 2 and 3 render exactly the tags and classes they always
  have, so every entry published before this slice produces byte-identical
  HTML.
- **to-do** renders as a list of disabled, labelled checkboxes. The label gives
  each checkbox its accessible name, the state is announced with the text it
  belongs to, and nothing runs — a public control may not depend on hydration
  (ADR-0024 D3), and this one does not run at all.
- **callout** renders as `<div role="note">`, not `<aside>`. Several callouts in
  one entry would otherwise each become a complementary landmark in a screen
  reader's landmark list, which is noise rather than structure. The icon is
  `aria-hidden`: it has no accessible name and the text carries the message.
- **code** renders as `<pre><code class="language-…">` inside its own
  horizontal scroll container, so a long line never makes the page scroll
  sideways.

No syntax highlighting anywhere: it would mean a highlighter in the public
bundle for a block a gardening journal will rarely use.

### D5. The input rules are ours, not a markdown parser

ADR-0015 forbids `@lexical/markdown` and mdast, and that stands. `## `, `- `,
`1. `, `> `, `[] `, `---`, `**bold**` and their siblings are implemented as a
bounded, enumerated set of application transforms over the node tree. They are
input conveniences; the document is never parsed from or serialized to
markdown, and a rule is undone by one undo, restoring the literal characters
the gardener typed.

### D6. Removing the toolbar is an accessibility debt that this slice repays

Deleting the button row deletes the one control surface a keyboard or screen
reader user could tab to, and Notion is not the model to copy here. In
exchange, this slice owes: every command on a keyboard shortcut; the floating
toolbar summonable from a selection and dismissable back to it; the slash menu
built as a WAI-ARIA combobox, the pattern the catalog picker already uses in
this codebase; the block handle staying a real button with `aria-grabbed`,
arrow-key movement and the live region that announces
"{type} moved to {position} of {total}"; and the gutter revealed by focus and
not by hover alone. A source test holds that every command has a shortcut or a
menu path.

## Consequences

- The editor grammar and the document grammar are extended in two separate
  tasks, so between them the adapter refuses a callout, a code block and a
  to-do list explicitly with `unsupported_node`. That is the designed
  fail-closed path, not a gap: nothing can create one of those blocks until the
  grammar task lands.
- `journalDocumentHasFormatting` now counts a callout and a code block, so the
  MVP-learning composer signals will see formatted entries they did not see
  before. The buckets are unchanged.
- The exhaustive `never` switches over `JournalDocumentBlock` and
  `JournalInlineMark` are what located every reader that had to change. They
  are load-bearing and stay.
- Nothing in this slice touches the media staging worker, the variant scheme,
  the media lifecycle, the search projection or any route policy.

## What "1:1 with Notion" does not mean here

Stated so the phrase does not become an unbounded backlog. Out of scope, each
for a reason that already exists in this project's decisions: pages, subpages
and databases (OverGarden's unit is an entry about a plant, not a page tree);
comments, mentions and backlinks; sync blocks; real-time collaboration
(ADR-0015 forbids Yjs); AI; web bookmarks and embeds (they fetch remote URLs);
files, video and audio (ADR-0019 and the media policy admit only browser-made
WebP from a local file); column layouts; and the two block kinds the owner
declined in D1.
