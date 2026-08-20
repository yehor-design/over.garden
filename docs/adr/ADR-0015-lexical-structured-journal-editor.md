# ADR-0015: Lexical as the transient structured journal editor

- Status: Accepted
- Date: 2026-08-14
- Decision owner: OVE-317
- Supersedes: the Editor.js implementation choice in the completed OVE-202,
  OVE-206, OVE-213, and OVE-243 slices; their product outcomes and receipts
  remain historical facts.

## Context

OverGarden stores structured journal content in the application-owned
`JournalDocumentV1` schema. The current owner composer uses Editor.js as a
transient browser implementation, then converts its tool-owned output back to
that schema. Reorder is coupled to an imperative DOM observer and
`blocks.move`. This implementation choice no longer matches the selected
native editor architecture and carries tool/data/DOM assumptions across
selection, history, IME, identity, and testing.

Lexical 0.49.0 supplies an immutable editor state, native node tree, selection,
commands, transforms, history, DOM reconciliation, React extension composer,
NodeState, and stable custom-node APIs. It does not supply OverGarden product
UI or the complete journal grammar. In particular, the stock quote node has no
attribution field and an experimental draggable plugin is not an acceptable
production dependency.

The durable document, offline protocol, server repositories, renderer,
privacy firewall, media lifecycle, and public/search projections already use
`JournalDocumentV1`; changing them or migrating stored rows would create risk
without product value.

> **Historical pointer:** ADR-0017 supersedes the offline-protocol dependency
> in this context. `JournalDocumentV1` and the other named safety boundaries
> remain current.

## Decision

Use Lexical 0.49.0 as the only transient owner-authoring engine and use it as a
native node-tree editor rather than an Editor.js compatibility layer.

`JournalDocumentV1` schema version 1 remains the sole durable and cross-layer
contract. Lexical editor state, serialized nodes, runtime node keys, DOM, HTML,
selection, history, and preview URLs are never persisted, queued, rendered,
indexed, or sent through APIs.

> **Historical pointer:** under ADR-0017, the cross-layer contract is the
> server persistence/API/read contract. New browser-local queue persistence is
> forbidden; this paragraph remains the accepted editor decision record.

Pin these direct dependencies exactly to 0.49.0:

- `lexical`
- `@lexical/react`
- `@lexical/extension`
- `@lexical/rich-text`
- `@lexical/list`
- `@lexical/link`
- `@lexical/history`
- `@lexical/selection`
- `@lexical/utils`
- `@lexical/a11y`
- `@lexical/clipboard`
- `@lexical/html`

Use `LexicalExtensionComposer`, stable included extensions, `$config`, and
NodeState. Do not activate collaboration/Yjs, tables, code, markdown/mdast,
hashtags, Dragon, devtools, experimental draggable blocks, or experimental DOM
pipelines. A Lexical version upgrade is a separate verified dependency change.

## Node and identity contract

The root accepts only:

- `ParagraphNode`;
- `HeadingNode` for H2 and H3;
- ordered or unordered `OverGardenListNode extends ListNode`/`ListItemNode`
  trees of depth at most two; the exact-version replacement disables stock
  adjacent-list coalescing so separate canonical block IDs remain separate;
- an application-owned quote element with exactly one body element and zero or
  one attribution element;
- the stable horizontal-rule node;
- `OverGardenImageNode extends DecoratorNode`.

Text supports only bold and italic plus safe `LinkNode` links. Every supported
top-level semantic node carries the application block ID in NodeState named
`overgardenBlockId`; custom nodes expose the same application-owned state.
Lexical node keys are runtime-only. Lists have no durable item IDs.

Type transforms and reorder preserve the application ID. Split keeps the
original ID on the leading node and gives the trailing node a fresh
cryptographically random valid ID. Merge keeps the receiving ID. Undo and redo
restore exact semantic IDs.

## Boundary and lifecycle contract

One exhaustive adapter hydrates a validated v1 document into a native editor
state and exports a committed editor state back to normalized v1. Unknown
internal nodes, unsupported formats, malformed quote/list structure, or unsafe
links fail closed and preserve the latest known-good canonical document.

One stable extension graph is created per mounted owner/document binding.
`initialConfig` is not a prop-update channel. Only committed semantic changes
increment the application generation and emit a canonical hash; selection-only
and hydration-tagged updates emit nothing. Create-flow owners must finish their
asynchronous owner-scoped draft hydration before mounting the binding; this
prevents an empty pre-hydration snapshot from becoming Lexical's immutable
initial state. `flushLatest` waits through the
existing finite 1,500 ms composition/reorder deadline and exports one committed
snapshot. Destroyed, superseded, stale, or canceled work cannot emit or persist.

Toolbar and reorder state derive from Lexical selection and tree state.
Pointer/touch/keyboard reorder and semantic-block deletion use application
commands inside an editor update, restore selection through Lexical APIs, and
create one history transaction. Image deletion stays on its media-aware
control. DOM order and MutationObserver are never state owners.

The image node stores only block ID and media asset ID. Preview URLs stay in an
ephemeral React map/context. File picker, paste, drop, reservation, local Blob,
quarantine, derivative, cleanup, and ten-image concurrency rules remain owned
by the existing media/offline boundaries.

> **Historical pointer:** ADR-0017 supersedes only the offline ownership named
> here. Media quarantine, stripped derivatives, and ephemeral preview safety
> remain binding throughout the retirement.

## Accessibility and verification

The owner editor has a localized accessible name, visible focus, a roving
toolbar, normal Tab exit, Escape recovery, localized move controls and live
announcements, 44 px pointer targets, reduced-motion and forced-color support.
Real input, selection, clipboard, and Cyrillic composition require browser
evidence; jsdom is limited to node, adapter, command, and extension contracts.
OVE-317 closes its unavailable-hardware gate with maintainer-authorized
device-equivalent evidence: iPhone 17 Pro WebKit and Pixel 10 Chromium
profiles plus Android 16 Emulator Chrome with TalkBack bound, a Chrome
clipboard round-trip pasted through Android `KEYCODE_PASTE`, and localized
CDP/UIAutomator accessibility trees. This ADR does not convert that evidence
into a physical-device, VoiceOver-runtime, or OS-dictation claim.

Active source, tests, scripts, packages, lockfile, CSS, current documentation,
and built chunks must contain no Editor.js runtime assumption. Dated receipts
remain only through a closed historical allowlist. Public and owner-read chunks
contain neither Editor.js nor Lexical.

## Consequences

Positive:

- the editor uses one coherent tree/selection/history model;
- durable application identity and content remain vendor-independent;
- all four owner flows keep one shared composer API;
- no data migration or dual-runtime rollout is required;
- public, search, privacy, and server layers remain editor-free.

Costs and risks:

- OverGarden owns quote/image nodes, the exact-version list replacement,
  conversion, toolbar, paste policy, reorder UI, identity transforms, and their
  browser/device test matrix;
- 0.x upgrades may break APIs and therefore stay exact-pinned;
- the complete authoring bundle must be measured rather than assumed smaller;
- mobile IME and assistive-technology parity remain release gates proven by the
  task-local evidence class; physical-device claims require physical evidence.

## Rejected alternatives

- Persist raw Lexical JSON: rejected because it couples durable data and IDs to
  vendor node shape and runtime evolution.
- Recreate Editor.js tools/tunes/`data.*` blocks over Lexical: rejected because
  it preserves the architecture mismatch and weakens selection/history/IME.
- Keep a hidden Editor.js fallback or feature flag: rejected because it creates
  two production state owners and an unproved rollback path.
- Use experimental draggable blocks: rejected because stable first-party
  commands can mutate the native tree without an experimental dependency.
- Use a nested editor for quote attribution: rejected because two editors make
  focus, selection, history, identity, and serialization unnecessarily fragile.
- Migrate SQL or stored documents: rejected because v1 is already the correct
  application contract.

## Rollout and rollback

Ship one exact implementation through branch, PR, exact-head checks, main
containment, READY exact-SHA Vercel deployment, and read-only live
boot/type/cancel plus public-bundle proof. Production verification must not save
a journal or mutate media, users, search, or provider state.

> **Historical pointer:** ADR-0017 now governs connectivity and durable browser
> persistence. This rollout receipt remains provenance for the Lexical change.

Rollback promotes the immediately previous exact safe deployment or reverts
the implementation commit and redeploys. Unchanged `JournalDocumentV1` rows need
no rollback or backfill.
