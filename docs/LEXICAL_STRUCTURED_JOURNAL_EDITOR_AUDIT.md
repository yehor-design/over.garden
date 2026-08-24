# Lexical structured journal editor audit

Status: **GO** for OVE-317 at baseline
`e529dcbe37050fe42d56fb1a203e41fcab688eb1`.

Evidence captured: 2026-08-14. This audit is version-bound to Lexical 0.49.0
and does not authorize an unreviewed dependency upgrade.

The editor-engine conclusions remain current. The draft/media lifecycle rows
describe the audited OVE-317 baseline and were superseded by ADR-0019 and
OVE-349: authoring is transient and tab-owned before one atomic publication,
with no server draft or retained source original.

## Decision

Replace the transient Editor.js owner composer with one native Lexical editor
while keeping `JournalDocumentV1` schema version 1 as the only persistence,
API, render, privacy, media, and search document. The migration needs
no SQL or stored-data conversion. A failed rollout is reversed by promoting
the previous exact deployment or reverting the implementation commit.

Every mandatory capability is either `supported_native` or
`supported_custom`; there is no `blocking_gap`. The custom surface is bounded
to application-owned nodes, the exact-version list replacement policy,
conversion, toolbar, paste admission, and reorder UI. It does not recreate
Editor.js tools, tunes, block data, or DOM ownership.

## Version, package, and license gate

The approved direct production package set is exact-pinned as follows:

| Package              | Version | License | Purpose                                                                                                 |
| -------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `lexical`            | 0.49.0  | MIT     | editor state, nodes, selection, commands, `$config`, NodeState                                          |
| `@lexical/react`     | 0.49.0  | MIT     | `LexicalExtensionComposer`, content editable, React adapters                                            |
| `@lexical/extension` | 0.49.0  | MIT     | stable extension graph and editor construction                                                          |
| `@lexical/rich-text` | 0.49.0  | MIT     | rich-text commands and H2/H3 nodes                                                                      |
| `@lexical/list`      | 0.49.0  | MIT     | ordered/unordered list nodes and commands                                                               |
| `@lexical/link`      | 0.49.0  | MIT     | safe link node and commands                                                                             |
| `@lexical/history`   | 0.49.0  | MIT     | undo/redo history                                                                                       |
| `@lexical/selection` | 0.49.0  | MIT     | native selection helpers                                                                                |
| `@lexical/utils`     | 0.49.0  | MIT     | stable registration/merge helpers                                                                       |
| `@lexical/a11y`      | 0.49.0  | MIT     | focus, roving toolbar, and live-region extensions                                                       |
| `@lexical/clipboard` | 0.49.0  | MIT     | approved exact-pinned clipboard surface; the production handler stays application-owned                 |
| `@lexical/html`      | 0.49.0  | MIT     | approved exact-pinned HTML surface; the production handler deliberately avoids broad conversion helpers |

Registry metadata reports TypeScript 5.2 or newer and, for React bindings,
React 18 or newer. The repository uses TypeScript 5, React 19.2.4, and Next.js
16.2.11. The installed lock graph may include same-version transitive Lexical
packages required by `@lexical/react`; production code must not import or
activate collaboration/Yjs, tables, code, markdown/mdast, hashtags, Dragon,
devtools, or experimental APIs. `verify:editorjs-retirement`, `pnpm why`, the
production build, and bundle inspection are the final compatibility gates.

## Capability matrix

| Capability                                          | Resolution                                             | Binding decision                                                                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Immutable editor state and committed snapshots      | `supported_native`                                     | Read/export only from committed `EditorState`; never use DOM as source of truth.                                                                                                                                               |
| Native selection, commands, transforms, and history | `supported_native`                                     | Formatting, insertion, reorder, focus, undo, and redo use Lexical APIs.                                                                                                                                                        |
| React lifecycle with one stable extension graph     | `supported_native`                                     | Mount with `LexicalExtensionComposer`; owner/document changes deliberately remount the binding.                                                                                                                                |
| Transient create and canonical edit hydration       | `supported_custom`                                     | Create flows mount from tab-owned transient state; edit mounts from its owner-scoped canonical document. No pre-publication state is durable, and one acknowledged atomic publication creates the durable change.              |
| Paragraph and H2/H3                                 | `supported_native`                                     | `ParagraphNode` and `HeadingNode`; H1 and other headings are rejected.                                                                                                                                                         |
| Ordered/unordered list, depth at most two           | `supported_native` plus application replacement policy | `OverGardenListNode extends ListNode` retains native list commands/items/numbering while suppressing stock adjacent-list coalescing; checklist, custom starts, unsupported item presentation, and deeper nesting are rejected. |
| Bold, italic, and safe link only                    | `supported_native` plus application validation         | `TextNode` format bits and `LinkNode`; all other formats fail closed on export.                                                                                                                                                |
| Delimiter                                           | `supported_native`                                     | Stable horizontal-rule node; no experimental pipeline.                                                                                                                                                                         |
| Image with durable media identity                   | `supported_custom`                                     | `OverGardenImageNode extends DecoratorNode`; state contains only block ID and media asset ID, while preview URLs remain ephemeral.                                                                                             |
| Quote with optional attribution                     | `supported_custom`                                     | One `OverGardenQuoteNode extends ElementNode` contains exactly one body node and zero or one attribution node; no nested editor.                                                                                               |
| Application block identity                          | `supported_native` plus application policy             | NodeState `overgardenBlockId` on top-level semantic nodes; Lexical keys are never persisted.                                                                                                                                   |
| Canonical hydration/export                          | `supported_custom`                                     | Exhaustive adapter validates v1 before hydration and normalizes v1 after export. Unknown nodes, malformed quote/list structure, and unsupported marks throw typed failures.                                                    |
| Split/merge/type-transform identity                 | `supported_custom`                                     | Leading split keeps the original ID, trailing split gets a cryptographically random valid ID, merge keeps the receiver ID, and type transforms/reorder preserve IDs.                                                           |
| Safe external paste                                 | `supported_custom`                                     | Closed allowlist accepts supported local image `File` objects through existing admission and safe text/formatting; remote images and active/unsupported HTML have zero fetch or durable effect.                                |
| Semantic change delivery                            | `supported_native` plus application generation fence   | Selection-only and hydration-tagged updates emit nothing; committed semantic changes export the newest valid v1 snapshot.                                                                                                      |
| Finite composition/reorder recovery                 | `supported_custom`                                     | Existing 1,500 ms `waitForComposerIdle` deadline remains the save/cancel availability boundary.                                                                                                                                |
| Pointer/touch/keyboard top-level reorder            | `supported_custom`                                     | App commands mutate the native root inside one editor update/history transaction; DOM order and MutationObserver are never canonical.                                                                                          |
| Toolbar accessibility and localized announcements   | `supported_native` plus application UI                 | Selection-derived controls, roving focus, Tab exit, Escape recovery, visible focus, polite localized status, reduced motion, and forced colors.                                                                                |
| Real typing, selection, clipboard, and IME evidence | `supported_native` with required browser/device-equivalent proof | Unit tests use editor APIs; Chromium, Firefox, WebKit, iPhone 17 Pro WebKit, Pixel 10 Chromium, and Android 16 Emulator Chrome with TalkBack-bound AX trees own OVE-317 input proof. Physical devices and VoiceOver runtime are not claimed. |
| Public/read bundle isolation                        | `supported_custom` build gate                          | Only the client authoring island imports Lexical; renderer, persistence, privacy, media, public, and search consumers import v1 only.                                                                                          |
| Exact Editor.js retirement                          | `supported_custom` repository/build gate               | Zero active dependencies, imports, types, selectors, adapters, runtime probes, CSS, or chunks; immutable historical facts use a closed allowlist.                                                                              |

## Canonical tree mapping

`RootNode` may contain only the following top-level semantic families:

| `JournalDocumentV1` block | Lexical tree                                                                      | Durable application state                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| paragraph                 | `ParagraphNode` with allowed inline children                                      | `overgardenBlockId` NodeState                                                                                     |
| heading                   | `HeadingNode` tagged `h2` or `h3`                                                 | `overgardenBlockId` NodeState                                                                                     |
| list                      | `OverGardenListNode extends ListNode` with `ListItemNode` descendants, depth <= 2 | block ID only on top-level list; adjacent same-style canonical lists stay distinct; list items have no durable ID |
| quote                     | `OverGardenQuoteNode` -> body + optional attribution                              | block ID on quote node                                                                                            |
| delimiter                 | horizontal-rule node                                                              | `overgardenBlockId` NodeState                                                                                     |
| image                     | `OverGardenImageNode`                                                             | block ID and media asset ID only                                                                                  |

Text children may carry only bold and italic format bits. A safe `LinkNode` may
wrap text. Raw Lexical JSON, node keys, DOM, HTML, preview/blob URLs, selection,
and history never cross the canonical boundary.

## Repository inventory and removal boundary

At the audited baseline, active Editor.js coupling consists of five direct
packages, the transient editor adapter, the custom image tool, the imperative
reorder controller and helper, `.ce-*` styling, four real-runtime smoke owners,
localization evidence names, and active architecture docs. Four route callers
share `StructuredJournalComposer`; none may import Lexical after migration.

Historical OVE-202/206/213/243 receipts, the mainline closeout ledger, dated
plans/specs, and product-research source material remain factual provenance.
They are not current architecture and are the only eligible paths for exact
historical string allowlisting.

## Safety and failure analysis

- Unsupported internal structure is a serialization failure, not a lossy
  downgrade. The latest known-good canonical snapshot remains available.
- The exact-version `ListNode` replacement disables only Lexical's stock
  cross-block coalescing transform and restores native ordered-item numbering
  with an app transform. Golden and browser tests prove adjacent same-style
  lists retain separate IDs.
- External paste may downgrade unsupported presentation to plain text, but it
  must reject unsafe links, remote images, script/style/SVG/event payloads, and
  anything that could initiate a fetch.
- Inline media continues through the existing atomic ten-slot reservation and
  object-URL owners. The editor node stores no preview URL.
- Orphan classification must normalize `content_document` as v1 and derive
  media IDs with `listJournalDocumentImageMediaIds`. Malformed canonical content
  aborts before the media query and produces no update or enqueue.
- Precise-location, owner/session generation, revision CAS, idempotency,
  atomic publication, public projection, and search boundaries remain outside and
  authoritative over the editor.
- Edit owners do not mount Lexical until the authenticated canonical read
  succeeds or fails closed, so the immutable initial state cannot race ahead
  of the stored document. Create owners have no server state to reconcile.
- A destroyed or superseded binding unregisters listeners/commands, cancels
  scheduled work, releases locale/reorder participants, and rejects late
  generations.

## Measured production bundle receipt

The exact baseline `e529dcbe37050fe42d56fb1a203e41fcab688eb1`
production build (`BUILD_ID=Ip2Q15w50VPQhmBQuRUB7`) emitted one retired-engine
runtime chunk of 238,249 bytes raw and 63,287 bytes through `gzip -c`. The
OVE-317 production build (`BUILD_ID=RgOpA9-6IYaF5DeLWmSFt`) emits one
Lexical-bearing authoring chunk of 292,920 bytes raw and 92,284 bytes through
the same measurement. This is an increase of 54,671 raw bytes (23.0%) and
28,997 gzip bytes (45.8%), so the migration does **not** claim a smaller
authoring engine bundle.

The trade is accepted only because the product behavior and architectural
boundary improve: the engine stays in one lazy authoring chunk, the five
public/owner-read route manifests contain none of that chunk, and the real
100-block/10-image mutation smoke remains within the 34 ms policy. Bundle size
is now a measured regression budget for a future scoped optimization, not a
fabricated migration benefit.

## GO gates and falsification

Implementation may proceed because all capability rows are closed without an
experimental production dependency. Merge and rollout remain blocked unless:

1. every valid v1 grammar fixture round-trips with identical semantics, stable
   block IDs/order/quote attribution/media IDs, including split, merge,
   transform, reorder, undo, and redo;
2. hostile and unknown internal state fails closed and safe paste produces zero
   prohibited network/public effect;
3. all four owner callers, transient-session/atomic-publication/media/privacy/search/read boundaries,
   1,500 ms recovery, and the 34 ms mutation budget pass;
4. real-browser and maintainer-authorized device-equivalent accessibility/IME
   evidence passes with its residual risks stated, without inflating the result
   into physical-device or VoiceOver-runtime proof;
5. the lock graph has one 0.49.0 Lexical build, active Editor.js residue is zero,
   and public/read chunks contain no authoring engine; and
6. exact-main containment, READY exact-SHA deployment, read-only production
   boot/type/cancel and public-bundle proof, rollback viability, and Linear
   read-back all match.

Any failure above falsifies the migration as currently designed. Stop before
merge, retain the unchanged v1 data and previous deployment, and amend OVE-317
instead of shipping a dual runtime or partial port.

## Primary evidence

- Lexical 0.49.0 release and breaking-change notes:
  <https://github.com/facebook/lexical/releases/tag/v0.49.0>
- Lexical editor state: <https://lexical.dev/docs/concepts/editor-state>
- Lexical nodes and NodeState: <https://lexical.dev/docs/concepts/nodes>
- Lexical React integration: <https://lexical.dev/docs/getting-started/react>
- Lexical extensions: <https://lexical.dev/docs/extensions/intro>
- Lexical serialization: <https://lexical.dev/docs/serialization/>
- Lexical testing tiers: <https://lexical.dev/docs/testing>
- Lexical keyboard accessibility:
  <https://lexical.dev/docs/concepts/keyboard-accessibility>
- Versioned MIT license:
  <https://github.com/facebook/lexical/blob/v0.49.0/LICENSE>
