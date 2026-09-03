# Structured Journal Composer

Status: current implementation contract
Owner: OVE-317
Decision: ADR-0015

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

- Top-level nodes are paragraph, H2/H3 heading, ordered/unordered list with at
  most two levels, quote, delimiter, and image. An exact-version
  `OverGardenListNode extends ListNode` replacement keeps adjacent same-style
  canonical list blocks and IDs separate while retaining native list editing
  and numbering.
- Inline marks are bold, italic, and normalized safe links only.
- Quote has exactly one body and zero or one attribution in the same tree.
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

## Typography and localization

The editor, toolbar, popovers, portals, and read-only renderer inherit the
shared `font-sans` token and the current `uk`, `bg`, or `ru` language context.
No font family, implementation token, preview URL, or editor state is persisted.
The composer uses the shared `owner-composer-drafts` locale participant; active
reorder uses `owner-composer-reorder-gesture` and does not fork the coordinator.

## Verification

```bash
cd apps/web
pnpm exec vitest run src/lib/garden/journal-document-lexical-adapter.test.ts \
  src/components/garden/lexical-journal/journal-lexical-nodes.test.tsx \
  src/components/garden/lexical-journal/journal-lexical-image-node.test.tsx \
  src/components/garden/lexical-journal/journal-node-reorder.test.tsx
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

The composer is proven by the unit tests above plus `pnpm build`. The former
browser, device, and responsiveness matrices were retired by ADR-0022.

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
