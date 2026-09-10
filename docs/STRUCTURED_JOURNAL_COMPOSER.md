# Structured Journal Composer

Status: current implementation contract
Owner: OVE-317, rewritten by SDD Slice 26
Decision: ADR-0015, amended by ADR-0028

## Runtime decision

The four authenticated journal journeys use one lazy-loaded, client-only
`StructuredJournalComposer` backed by Lexical 0.49.0. The editor is a native
Lexical node tree with app-owned extensions; it is not a generic block-editor
compatibility layer. All twelve direct Lexical packages are pinned exactly to
`0.49.0`, and the retirement verifier enforces one resolved Lexical build.

The editor engine remains an authoring implementation detail. The only stored,
API, public, search, and read contract is normalized
`JournalDocumentV1` schema version 1. Lexical JSON, node keys, DOM, and HTML
never cross that boundary.

## Closed grammar and identity

- Top-level nodes are paragraph, H1/H2/H3 heading, ordered/unordered/to-do list
  with at most two levels, quote, callout, code, delimiter, and image. An
  exact-version `OverGardenListNode extends ListNode` replacement keeps adjacent
  same-style canonical list blocks and IDs separate while retaining native list
  editing and numbering. A to-do list is Lexical's `check` list type, whose
  `getChecked()` derives from the parent list, so a checked flag cannot exist
  outside one.
- Inline marks are bold, italic, underline, strikethrough, monospace, and
  normalized safe links only. Normalization keeps at most one mark of each type
  per span and sorts them into one canonical order, so the same emphasis always
  serializes to the same bytes.
- Quote has exactly one body and zero or one attribution in the same tree. The
  attribution is toggled from the block menu.
- A callout carries its icon in NodeState, drawn by CSS from `data-icon` so the
  node's DOM children stay exactly the ones Lexical reconciles. A code block
  carries plain text and line breaks only; a transform clears any format a
  paste or a shortcut managed to set.
- Image state stores only the application block ID and durable media asset ID;
  preview URLs remain ephemeral UI state.
- NodeState `overgardenBlockId` carries the stable application block ID.
  Lexical node keys are runtime-only.
- Type transforms and reorder preserve the ID. Split preserves the leading ID
  and gives the trailing block a fresh cryptographic ID. Merge preserves the
  receiving ID. Undo and redo restore exact semantic IDs.
- Unsupported structure or marks fail closed and retain the latest known-good
  canonical document instead of silently dropping content.

The pure adapter boundary is
`apps/web/src/lib/garden/journal-document-lexical-adapter.ts`:

- `journalDocumentV1ToLexicalEditorState(document)` validates before hydration;
- `lexicalEditorStateToJournalDocumentV1(editorState)` traverses the committed
  tree exhaustively and finishes with canonical normalization.

## Shared journey and lifecycle

`StructuredJournalComposer` remains the single props/ref boundary for first
entry, space entry, object follow-up, and edit. Callers do not import Lexical or
fork save, recovery, media, locale, or conflict behavior.

One stable extension identity is created per mounted owner/document binding.
Create flows start from transient tab-owned state; edit starts from the
authoritative canonical document returned by its owner-scoped read. No
composer writes a server draft or durable browser journal state. A durable
change exists only after the atomic publication request is acknowledged.
Semantic committed changes advance one monotonically increasing generation;
selection-only and hydration updates do not emit canonical changes.
`flushLatest` waits at most 1,500 ms through composition or reorder, then exports
one committed state. Owner changes, superseded generations, cancelled media,
unmount, and late asynchronous completion cannot persist or emit a stale write.
Failure degrades to the last normalized document with localized read-only and
retry controls.

## Safe input and media

- Normal typing, IME, toolbar actions, and local
  image admission use native editor commands and selection.
- External HTML paste is reduced through a closed text/mark allowlist. Scripts,
  styles, SVG, handlers, remote images, URI-list drops, and unsupported
  presentation cannot cause external I/O.
- Only local image files enter the shared admission controller. Ten concurrent
  reservations may win; the eleventh is rejected synchronously. A photo may be
  up to 50 MB; the browser decodes it natively (downscaling while it decodes)
  and shows a 480 px preview before the final 2560 WebP, its 1280/480
  variants, and the 16 px placeholder are encoded and staged (OVE-371). The
  jsquash/libheif fallback is used only for lossless plans, HEIC the browser
  cannot decode, or browsers without native WebP encoding.
- Object URLs have one controller owner and are revoked on removal, cancellation,
  owner/document transition, and unmount.
- Server orphan classification reads normalized `JournalDocumentV1`
  `mediaAssetId` values and performs zero enqueue effects for malformed or
  unauthorized content.
- Public and owner read surfaces continue to use `JournalDocumentRenderer` and
  load no authoring engine.

## The Notion shape (ADR-0028)

There is no permanent toolbar. The canvas is one 708 px column beside a 56 px
gutter, in Notion's type scale and block rhythm and in OverGarden's tokens.

| affordance | what it is |
| --- | --- |
| the gutter | on the hovered *or focused* block: `+` adds a block below, `⠿` drags it |
| the block menu | a press on `⠿` that never travelled, or Cmd/Ctrl+Shift+M: duplicate, move, delete, and a "turn into" group |
| the slash menu | `/` at the start of a word: a WAI-ARIA listbox the editor owns, filtered by localized name and latin alias |
| the selection pill | a non-collapsed selection: the five marks and the link editor |
| the input rules | `# `, `## `, `### `, `- `, `* `, `+ `, `1. `, `1) `, `[] `, `[ ] `, `[x] `, `> `, ` ``` `, `--- `, and `**bold**`, `~~strike~~`, `*italic*`, `` `code` `` |
| the shortcuts | Cmd/Ctrl+B/I/U from Lexical's core, plus Shift+S, E, and Shift+0…3 |
| a dropped photo | lands at the block the pointer is over, with an insertion line to say where |

`journal-block-commands.ts` declares each block once. The add menu, the block
menu's turn-into group and the slash menu all read that list, so the three
cannot drift. Turning a block into another loses nothing: a list becomes one
block per item, a quote keeps its attribution as a further block, and a code
block becomes one block per line.

The input rules are ours, not a markdown parser: ADR-0015 still forbids
`@lexical/markdown` and mdast, the document is never parsed from or serialized
to markdown, and each rewrite is its own history entry so one undo restores the
characters that were typed.

## Typography and localization

The editor, its menus, popovers, portals, and the read-only renderer inherit the
shared `font-sans` token and the current `uk`, `bg`, or `ru` language context.
No font family, implementation token, preview URL, or editor state is persisted.
The composer uses the shared `owner-composer-drafts` locale participant.

## Verification

```bash
cd apps/web
pnpm exec vitest run src/lib/garden/journal-document-lexical-adapter.test.ts \
  src/components/garden/lexical-journal/
pnpm lint && pnpm typecheck && pnpm test && pnpm build

# The browser proof: write an entry through the new controls, drag a block,
# publish it, and read every block back from the public page.
pnpm build && pnpm exec next start -p 3130
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
  tests/journal-notion-composer.spec.ts
```

Two classes of defect in this composer are invisible to the unit tests and were
found only by running it: a cancelled animation frame whose id stayed in its
ref, which froze the gutter on the first block, and a state setter that returned
a fresh array on every commit, which React reported as "Maximum update depth
exceeded". Both are guarded by comments at the site rather than by a test,
because neither has a headless expression.

## A refused photo names its class (OVE-359)

The composer's immediate-insertion path used to catch a staging rejection with
an empty handler and keep only the generic `imageFailed` sentence, so the
bounded refusal class was discarded at exactly the boundary where an operator
would have read it. That is why a total upload failure stayed invisible for nine
days while the page kept returning success.

The catch now records the class through `ephemeralStagingFailureCode` and stores
it beside the local preview state, so the image block renders its existing
failed state with a real `failureCode`. Rendered copy is unchanged in all three
locales: the class travels separately from the sentence, and no locale string
carries a machine-readable code.

Contract and proof live with the media lifecycle: `docs/MEDIA_LIFECYCLE.md`.
