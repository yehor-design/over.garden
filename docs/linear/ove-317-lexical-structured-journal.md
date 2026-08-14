# AI execution directive

Implement one vertical migration in which an authenticated gardener can create,
format, reorder, resume, edit, and publish the same safe structured journal in
all four owner flows while the browser editing engine changes from Editor.js to
Lexical. Lexical must be integrated as its native immutable node-tree and
selection/command model, not as an imitation of Editor.js blocks, tools, tunes,
or DOM controller chrome. `JournalDocumentV1` remains the only canonical
persistence, API, offline, public-render, derived-body, and search contract.

Start only from freshly fetched current `origin/main`, the complete saved
<issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> description, current Linear relations, and the audit gate in this issue.
Use branch `codex/ove-317-lexical-structured-journal`. This issue authorizes the
repository implementation, dependency replacement, tests, canon updates,
normal preview/production deployment, and read-only deployment verification. It
does not authorize SQL or data migration, production journal/media mutation,
provider configuration changes, a dual-editor production fallback, persisted
Lexical JSON, or new editor capabilities outside the existing journal grammar.
If any audit decision or compatibility proof has drifted, stop, materially amend
and revalidate <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue>, and read the amended description back before editing.

# Execution metadata

* Contract: `overgarden.linear-sdd.v1`
* Issue identifier: `OVE-317`
* Issue kind: `vertical_execution`
* User-facing: `yes`
* Locale scope: `shared`
* Repository change: `yes`
* Live deployment required: `yes`
* Direct production-state mutation: `no`
* Authorization status: `not_required`
* Baseline SHA: `e529dcbe37050fe42d56fb1a203e41fcab688eb1`
* Evidence captured: `2026-08-14`
* Touches: `repository, server, ui, offline, search, media, deployment, tests, docs`
* Sensitive boundaries: `user-data, precise-location, media-originals, public-search, external-effects`
* External systems: `npm registry, GitHub Actions, Vercel, Linear`

# User or operator outcome and behavior

* Actor and precondition: an authenticated gardener opens first-entry,
  follow-up-entry, space-entry, or existing-entry edit on a supported browser;
  the canonical initial value is `JournalDocumentV1`, and the current owner,
  session-generation, offline-vault, revision, and media admission fences have
  already admitted that caller.
* Happy path: the gardener writes Cyrillic text, changes paragraph/H2/H3/list/
  quote/delimiter structure, applies bold/italic/safe links, uses voice input,
  inserts or removes up to ten safe inline photos, reorders top-level semantic
  content with pointer/touch/keyboard controls, undoes/redoes edits, saves or
  queues offline, resumes, and reads back the same canonical content, IDs,
  order, media identities, visibility, and derived plain text.
* Degraded path: module-load, unsupported-node, paste, serialization, media,
  composition, reorder, offline, auth/session, or revision-conflict failure
  preserves the latest known-good canonical document and copied local media
  intent, exposes a localized finite error/retry or existing conflict state,
  keeps cancellation/navigation available, and performs no stale or partial
  canonical write.
* Recovery path: retry remounts one fresh Lexical editor from the latest
  validated `JournalDocumentV1`; offline/manual retry and existing conflict
  recovery retain their current owner/idempotency semantics; a failed rollout
  is recovered by promoting the previous exact safe deployment rather than
  shipping both editors or converting stored data.
* Final read-back: owner, public SSR, derived body, public-search projection,
  cover ordering, offline resume, and exact-SHA browser evidence agree on the
  canonical document while active source/build/package evidence contains no
  Editor.js runtime residue and public/read chunks contain no authoring engine.
* Not sufficient as proof: a Playground demo, a mocked Lexical API, unit-only
  adapter output, Chromium-only typing, raw Lexical JSON serialization, a
  package install, an HTTP 200, local build success, or deletion of the five
  direct Editor.js dependencies without caller/device/data-boundary proof.

# Product thinking and falsification

* Product-research branch: constrained
* Job or protected outcome: let a gardener capture an evolving narrative with
  minimal composition friction and trust that text, media, offline work, and
  publication survive editing-engine replacement without silent loss.
* Load-bearing assumption: Lexical's native node-tree, selection, command,
  history, and React integration can represent the complete existing
  `JournalDocumentV1` behavior with equal or lower authoring friction while
  vendor state remains transient and public/read bundles remain editor-free.
* Product Thinking Gate: `docs/product-research/MVP_LOGGING_DESIGN-BRIEF.md`
  constrains the path to narrative title/body, optional photo/voice/backdate,
  progressive disclosure, and low composition effort rather than editor feature
  expansion; `docs/product-research/OverGarden_MVP_PRD_v0.md` constrains offline capture, visible sync, idempotent canonical save, and media privacy plus
  narrative read-back; `docs/product-research/OverGarden_PAGE_ARCHITECTURE_v1.md`
  constrains one shared transient composer across object/space contexts, drafts,
  and recovery while current locale/privacy canon supersedes its historical
  implementation notes; `docs/product-research/ENTRY_DATA_AND_RANKABILITY_SPEC_v0.md`
  constrains title/body semantics, supported narrative structure, and stable
  plain-text/public projections needed for useful journal evidence.
* Falsification signal: any mandatory mapping loses content, allowed marks,
  domain block IDs, order, quote attribution, or media identity; any current
  flow fails Cyrillic IME, the authorized mobile accessibility evidence class,
  offline/session fencing, safe paste, public-bundle isolation, or PERF-01; or
  the exact package set cannot remain supported on current Next.js/React/Node.
* Smallest reversible response: stop before Editor.js deletion or merge, retain
  the current exact deployment and unchanged `JournalDocumentV1`, record the
  concrete `blocking_gap` in the audit, amend <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> with a new decision, and
  rerun final validation. Do not improvise a partial production port.

# Pinned baseline, reproduction, evidence, and counterevidence

Audit baseline: `e529dcbe37050fe42d56fb1a203e41fcab688eb1`, observed
2026-08-14 after `git fetch origin --prune` in the clean current-main worktree.

Safe reproduction:

1. Fetch current `origin/main`, preserve every local/ignored file, verify the
   baseline remains an ancestor, read <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> and its complete relation graph,
   and run the current mainline closeout before editing.
2. Inventory active and historical `@editorjs`, `EditorJS`, `Editor.js`,
   `editorjs`, `.ce-*`, `codex-editor`, `blocks.move`, tool-name, `data.*`,
   adapter, smoke, package, lockfile, CSS, and documentation assumptions.
3. Run the existing structured-composer, reorder, responsiveness,
   inline-media, localization, typography, offline, privacy, search, and
   authenticated-architecture tests once to capture the pre-change behavior.
4. Read official versioned Lexical 0.49.0 documentation/source/package metadata
   and current npm metadata; do not infer API stability from Playground code or
   unversioned examples.

Confirmed repository evidence:

1. `apps/web/package.json` and `apps/web/pnpm-lock.yaml` pin
   `@editorjs/editorjs` 2.31.6 plus header 2.8.9, list 2.0.9, quote 2.7.6, and
   delimiter 1.4.2 with their transitives.
2. `apps/web/src/components/garden/structured-journal-composer.tsx` dynamically
   creates Editor.js, maps its `save()` output, attaches an imperative
   MutationObserver reorder controller, and exposes one shared handle to all
   four owner callers.
3. `apps/web/src/lib/garden/journal-document.ts` already owns schema version 1,
   limits, normalization, safe links, stable domain IDs, ordered image IDs, and
   derived plain text. `apps/web/src/lib/garden/journal-document-editor-adapter.ts`
   explicitly treats Editor.js output as transient and untrusted.
4. `apps/web/src/components/garden/journal-document-renderer.tsx`, server
   persistence, Dexie drafts/sync, privacy traversal, public projections, and
   search consume `JournalDocumentV1`; they do not need Lexical JSON or a data
   migration.
5. Four direct production callers use `StructuredJournalComposer`: first entry,
   object follow-up, space entry, and existing-entry edit. Their image, voice,
   offline, locale, auth/session, conflict, and save behavior is part of this
   migration, not a downstream layer ticket.
6. Existing real-browser proofs pin Editor.js inside
   `smoke-structured-journal-composer.ts`,
   `smoke-journal-block-reorder.ts`,
   `smoke-journal-composer-responsiveness.ts`, and
   `smoke-inline-media-integrity.ts`; a mock-only rewrite would erase evidence.
7. `apps/web/src/server/media/media-lifecycle-enqueue.ts` currently reads inline
   identity from Editor.js-shaped `block.data.mediaAssetId`, while canonical
   `JournalDocumentV1` stores `block.mediaAssetId`. Its tests encode the wrong
   shape. Orphan classification therefore must be repaired before the migrated
   path can be considered media-safe.
8. `STRUCTURED_JOURNAL_AUTHORING_ENABLED` is not a proven rollback selector:
   active journal repository callers explicitly pass `requireStructured: false`. Rollback must not rely on this flag or retain a second editor.

Confirmed evidence: the current application has five pinned direct Editor.js
packages, one transient adapter, four shared composer callers, four real-editor
smokes, and one canonical v1 document boundary at the pinned baseline.

Confirmed external evidence:

1. Official Lexical/npm metadata on 2026-08-14 reports stable `0.49.0`, MIT,
   TypeScript 5.2 or newer, and React 18 or newer; the repository currently uses
   Next.js 16.2.11, React 19.2.4, TypeScript 5, and Node versions 22 through 24.
2. Lexical is a framework over immutable `EditorState`, a node tree, selection,
   commands, transforms, and DOM reconciliation. It is not a ready-made
   Editor.js-style block editor and supplies no OverGarden toolbar or product UI.
3. Node keys are runtime-only and not serialized. NodeState/custom-node fields
   must carry application block IDs; raw Lexical JSON cannot be durable identity.
4. Real `contentEditable` typing, selection, clipboard, and IME require browser
   tests; jsdom-only evidence is explicitly insufficient.
5. Lexical 0.x releases can contain breaking API changes and recent releases
   have included mobile-composition and link-sanitization fixes. All direct and
   transitive Lexical packages must therefore resolve to one exact version and
   upgrades require a separate verified dependency change.

Counterevidence and limits:

* Lexical's small modular core does not prove the complete composer bundle is
  smaller after React bindings, toolbar, accessibility, lists, links, clipboard,
  history, and custom nodes. The task requires measured before/after receipts.
* Upstream browser/a11y claims do not prove physical VoiceOver/TalkBack,
  Ukrainian, Bulgarian, Russian IME, iOS dictation, Android speech-to-text, or
  the current OverGarden session/offline contracts.
* Stock `QuoteNode` does not represent quote attribution, and the upstream
  draggable-block plugin is experimental. Both require the exact first-party
  native-tree designs below.

Counterevidence: upstream package, browser, and accessibility claims do not
prove OverGarden's four-caller, three-locale, offline, media, or device behavior.

Not proved: the task-local substitute leaves physical-device behavior,
VoiceOver runtime integration, OS dictation/speech-to-text integration, and
current stable Android Chrome on hardware outside its claim. Those are accepted
residual risks, not silently promoted claims. Current-main package/bundle
compatibility, measured authoring size, and exact-SHA production client boot
remain explicit acceptance gates.

## Maintainer-authorized device-evidence amendment

On 2026-08-14 the maintainer stated that a physical iPhone and Android device
cannot be supplied and explicitly authorized other testing methods. For
<issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> only, the former physical-device gate is replaced by this exact
content-free device-equivalent matrix:

* Chromium, Firefox, and WebKit across `uk`, `bg`, and `ru`;
* Playwright iPhone 17 Pro/WebKit and Pixel 10/Chromium profiles across all
  three locales, including real browser clipboard shortcuts, composition,
  selection, toolbar/history, touch events, reorder, focus, 100/10 load, and
  teardown;
* Android 16/API 36 Emulator Chrome with TalkBack enabled and bound, real CDP
  touch/input, localized CDP accessibility trees for all three locales, and one
  visible UIAutomator bridge receipt. Android clipboard is written and read
  through Chrome and pasted through the Android system `KEYCODE_PASTE` path in
  `uk`; the same locale-independent path is exercised for all locales through
  real browser shortcuts in both mobile Playwright profiles; and
* a validated authorization receipt that accepts exactly
  `no_physical_ios_hardware`, `no_physical_android_hardware`,
  `no_voiceover_runtime`, and `android_system_chrome_not_current_stable`.

This amendment does not weaken product privacy, media, persistence, or bundle
gates and must never be reported as physical-device, VoiceOver-runtime, or OS
dictation proof. A later task that claims those surfaces needs actual matching
hardware/runtime evidence.

# Root cause or proof gap

The architectural mismatch is the closest enforceable boundary: Editor.js
models an imperative list of tool-owned blocks, while Lexical edits an immutable
node tree through commands, selection, transforms, and reconciled DOM. A
tool-to-node rename, faux block wrapper, retained MutationObserver controller,
or persistence of Lexical JSON would carry the old model into a different
engine and create unstable identity, selection, history, IME, and data coupling.

<issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> freezes the migration decision: use native Lexical tree semantics behind
one application-owned bidirectional adapter, keep `JournalDocumentV1` v1, use
the exact package/node/ID/paste/media/SSR strategy below, and fail closed on any
unsupported semantic state. The additional confirmed media-lifecycle defect is
inside the same journal/media journey because it is an Editor.js-shaped parser
that can misclassify still-referenced derivatives; it must be corrected before
any final removal or rollout. Drift in a frozen decision is a stop-and-amend
condition, not implementation discretion.

# Non-negotiable invariants

 1. **INV-01 — Canonical application document.** `JournalDocumentV1` schema version 1 remains the sole stored/API/offline/public/search document; Lexical `EditorState`, serialized nodes, node keys, DOM, and HTML never cross that boundary.
 2. **INV-02 — Native Lexical architecture.** The editor uses Lexical's immutable node tree, editor state, commands, selection, transforms, history, and React extensions. It must not recreate Editor.js tools, tunes, block shells, `blocks.move`, `data.*` records, DOM-as-state, or MutationObserver sync.
 3. **INV-03 — Lossless closed grammar and identity.** Every allowed paragraph, H2/H3, ordered/unordered list of depth at most two, quote with zero-or-one attribution, delimiter, image, bold, italic, and safe link round-trips with stable application block IDs, order, and media IDs. Unsupported structures or marks fail closed rather than disappear silently.
 4. **INV-04 — One shared owner.** The four current composer callers retain one `StructuredJournalComposer` props/ref boundary; no caller imports Lexical, owns a parallel editor, or forks save/recovery semantics.
 5. **INV-05 — Durable state and concurrency.** Existing owner-vault, owner/session generation, locale-transition participant, canonical revision, idempotency, offline queue/manual retry, latest-generation, and teardown fences remain authoritative; realtime, auto-replay, or a second state owner is forbidden.
 6. **INV-06 — Media integrity and lifecycle.** At most ten inline selections win atomically, the eleventh is rejected, create/edit durability semantics remain unchanged, preview URLs never persist and are always revoked, originals remain in private quarantine until actual-byte validation and stripped derivative publication, and orphan revocation reads normalized `JournalDocumentV1` or performs zero revoke effects.
 7. **INV-07 — Paste and link safety.** Local supported image `File` paste uses existing admission; remote images, raw HTML nodes, scripts, styles, SVG/event payloads, unsafe/obfuscated protocols, unknown node types, and unsupported formats cannot fetch, persist, render, log, or reach public output.
 8. **INV-08 — Privacy and projections.** Precise-location text is rejected at the existing shared firewall; owner scope and visibility remain fail closed; a redacted negative proof confirms no precise location or another-user data crosses the boundary; derived body, SSR readback, cover ordering, public eligibility, public-only search documents, stale removal, outbox, and Postgres/Meilisearch parity remain based only on validated canonical data.
 9. **INV-09 — Locale and accessibility parity.** `uk`, `bg`, and `ru` retain lossless Cyrillic composition, the voice-transcript insertion pipeline, localized toolbar/error/reorder copy, keyboard and pointer/touch operation, visible focus, live announcements, reduced motion, forced colors, Tab exit, and Escape recovery while focus remains escapable. <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> proves localized DOM/AX semantics in iPhone WebKit and Pixel Chromium profiles plus bound TalkBack and localized CDP/UIAutomator accessibility trees on Android Emulator; physical devices, VoiceOver runtime, and OS dictation remain explicit accepted residual risks.
10. **INV-10 — Bounded availability.** Editor load/update/serialization/reorder either commits the newest valid generation or preserves the latest known-good document; the 1,500 ms composition/reorder idle deadline, PERF-01, finite retry, cancellation, and zero late write after unmount remain mandatory.
11. **INV-11 — Complete retirement and bundle isolation.** Final active source, tests, scripts, package manifest, lockfile, CSS, normative docs, and authoring chunks contain no Editor.js dependency/runtime assumption; public/owner read chunks contain neither Editor.js nor Lexical. Historical receipts stay in one exact provenance allowlist and cannot become active authority.
12. **INV-12 — Reversible delivery without data migration.** No SQL, backfill, stored-document conversion, provider configuration, or production content mutation occurs. Final `main` contains one editor only, and rollback promotes the previous exact safe deployment with unchanged stored documents.

# Exact data, state, protocol, and concurrency contract

* Canonical data: keep `JournalDocumentV1` v1 and its current limits exactly:
  100 top-level application document entries, 64 KiB canonical JSON, 20,000
  plain-text characters, ten images, list depth two, 64-character validated
  block IDs, 2,048-character safe links, and current media alt/caption bounds.
  No migration or new persisted field is permitted.
* Lexical grammar: `RootNode` contains only supported top-level semantic node
  families. Paragraph uses `ParagraphNode`; H2/H3 uses `HeadingNode`; lists use
  an exact-version `OverGardenListNode extends ListNode` replacement plus
  `ListItemNode` with no checklist and maximum depth two. The replacement
  disables stock adjacent-list coalescing while retaining native commands and
  ordered numbering, so adjacent same-style canonical list IDs stay distinct;
  text uses
  `TextNode` with only bold/italic plus `LinkNode`; delimiter uses the stable
  horizontal-rule node; image uses `OverGardenImageNode extends DecoratorNode`;
  quote uses `OverGardenQuoteNode extends ElementNode` containing exactly one
  `OverGardenQuoteBodyNode` and zero or one
  `OverGardenQuoteAttributionNode` with ordinary text children. No nested editor
  is allowed. This boundary mapping does not make Lexical a block editor.
* Exact package decision: add direct exact pins `lexical`, `@lexical/react`,
  `@lexical/extension`, `@lexical/rich-text`, `@lexical/list`, `@lexical/link`,
  `@lexical/history`, `@lexical/selection`, `@lexical/utils`, `@lexical/a11y`,
  `@lexical/clipboard`, and `@lexical/html`, all at `0.49.0`. Use
  `LexicalExtensionComposer`, stable included extensions, `$config`, and
  NodeState. The lockfile may contain exact transitive 0.49.0 packages required
  by `@lexical/react`, but production source may not import/activate Yjs,
  collaboration, tables, code, markdown/mdast, hashtags, Dragon, devtools, or
  experimental draggable/DOM pipelines. `pnpm why` and bundle analysis must
  prove one Lexical version/build.
* Stable domain IDs: NodeState named `overgardenBlockId` stores the application
  ID on built-in top-level semantic nodes; custom nodes store the same field in
  their app-owned state. Lexical `NodeKey` is runtime-only. A type transform and
  reorder preserve ID; split leaves the original ID on the leading node and
  assigns a fresh validated cryptographic ID to the new trailing node; merge
  retains the receiving node ID; undo/redo restores the exact semantic IDs; a
  new top-level semantic node receives an ID before any external snapshot.
  List-item nodes have no durable ID because `JournalListItem` has none.
* Adapter: add pure, exhaustive
  `journalDocumentV1ToLexicalEditorState(document)` and
  `lexicalEditorStateToJournalDocumentV1(editorState)` boundaries. Hydration
  validates canonical input before one initial editor-state callback; export
  traverses the committed tree, rejects unknown structural nodes/marks, reuses
  existing safe-link normalization, and finishes with
  `normalizeJournalDocumentOrThrow`. External HTML paste is converted by a
  closed allowlist; unsupported presentation is downgraded to text, while
  internal unsupported editor structure blocks serialization and preserves the
  last good snapshot.
* Client lifecycle: one stable extension/config identity is created per mounted
  owner/document binding. First-entry, space-entry, and follow-up owners finish
  their asynchronous owner-scoped IndexedDB hydration before mounting that
  binding; edit already begins with its synchronous canonical document. States
  are `loading -> ready -> composing|reordering|media_in_flight -> serializing -> ready`, with
  `loading|serializing -> degraded_read_only -> retrying -> loading` and any
  mounted state -> `destroyed`. `initialConfig` is never used as a prop-update
  channel; owner/document changes remount the binding deliberately.
* Generation/flush: only semantic committed updates increment a monotonically
  increasing generation and recompute the existing semantic hash; selection-only
  and tagged hydration updates do not emit document changes. `flushLatest`
  waits through the existing finite 1,500 ms composition/reorder deadline, then
  reads one committed editor state and exports it. A stale generation,
  superseded owner/document binding, canceled media selection, or completion
  after destroy cannot call `onDocumentChange` or persist.
* Offline protocol: states remain exactly `queued`, `syncing`, `failed`, and
  `synced`; each row retains its existing owner/session fence and durable
  idempotency key, reload/manual retry is bounded, and background-sync delivery
  is never promised.
* Reorder/history: app-owned Lexical commands move supported top-level semantic
  nodes inside `editor.update`; selection/focus is restored through Lexical
  selection APIs, and one move is one history transaction. Pointer/touch UI and
  localized move-up/down controls address the tree node selected by runtime key
  but commit and announce the stable application ID/order. No DOM mutation is
  the source of truth and no experimental draggable plugin is allowed.
* Image protocol: `OverGardenImageNode` serializes only `blockId` and
  `mediaAssetId`; preview resolution stays in an ephemeral React context/map.
  File picker, clipboard, and drop call the existing atomic reservation owner.
  Create flows own the copied offline intent before canonical visibility; edit
  obtains the current processed durable identity before insertion; remove,
  cancel, owner/entry change, retry, and unmount revoke every owned object URL.
* Media-lifecycle correction: `listOrphanProcessedDerivativesForEntry` must
  normalize `content_document` as `JournalDocumentV1` and call the existing
  `listJournalDocumentImageMediaIds`. An invalid/unsupported document aborts the
  orphan classification before media query/update/job enqueue and returns a
  typed redacted failure to its caller; it never treats all inline derivatives
  as orphan. Tests must delete the Editor.js-shaped `data.mediaAssetId` fixture.
* Authorization/public/search: all canonical writes retain scoped repositories,
  owner/session admission, revision CAS/idempotency, same-transaction public
  projection intent, precise-location rejection, current public eligibility,
  public-only documents, stale removal, and Postgres/Meilisearch parity. Lexical
  is never imported by server persistence, public/search documents, or
  `JournalDocumentRenderer`.
* External effects: npm capability/license/version reads are read-only;
  repeated reads and exact-SHA delivery/read-back are idempotent for the same
  package metadata and commit; GitHub/Vercel follow the normal release path.
  Production verification opens
  the deployed owner composer, types into a non-saved local draft, cancels, and
  reads public bundles/routes; it creates no production journal/media/user data.
  Media mutation proofs run only in local/preview isolated environments.

# Exact vertical scope, target files, and caller inventory

| Layer/surface | Exact existing owner or planned new path | Required change/read-back | Status |
| -- | -- | -- | -- |
| Canon/audit | `docs/LEXICAL_STRUCTURED_JOURNAL_EDITOR_AUDIT.md` | Record the complete versioned capabilities, stable/experimental matrix, package closure, node-tree mapping, risks, GO gates, and evidence sources. | planned new |
| ADR | `docs/adr/ADR-0015-lexical-structured-journal-editor.md` | Bind Lexical as transient native node-tree editor, `JournalDocumentV1` as durable owner, exact pins, exclusions, and rollback. | planned new |
| Domain contract | `apps/web/src/lib/garden/journal-document.ts`, `apps/web/src/lib/garden/journal-document.test.ts` | Retain v1 schema/limits; expose only shared canonical helpers needed by adapter/media lifecycle and preserve canonical regression proof. | existing; preserve |
| Adapter | `apps/web/src/lib/garden/journal-document-lexical-adapter.ts` | Add exhaustive pure tree-to-domain and domain-to-tree conversion with stable IDs and fail-closed errors. | planned new |
| Adapter tests | `apps/web/src/lib/garden/journal-document-lexical-adapter.test.ts` | Golden, property/boundary, malformed, hostile, ID, quote, list, and mark tests written red first. | planned new |
| Lexical extensions/client | `apps/web/src/components/garden/lexical-journal/journal-lexical-extensions.tsx`, `apps/web/src/components/garden/lexical-journal/journal-lexical-client.tsx`, `apps/web/src/components/garden/lexical-journal/journal-safe-paste-plugin.tsx` | Stable `LexicalExtensionComposer` configuration, registered native/custom nodes, history, change/flush, paste, a11y, and error boundary. | planned new |
| Custom tree nodes | `apps/web/src/components/garden/lexical-journal/journal-lexical-nodes.tsx`, `apps/web/src/components/garden/lexical-journal/journal-lexical-nodes.test.tsx`, `apps/web/src/components/garden/lexical-journal/journal-lexical-image-node.test.tsx` | Exact list-replacement, image, and quote tree/state/selection/serialization/disabled-control contracts. | planned new |
| Toolbar/reorder | `apps/web/src/components/garden/lexical-journal/journal-lexical-toolbar.tsx`, `apps/web/src/components/garden/lexical-journal/journal-node-reorder-plugin.tsx`, `apps/web/src/components/garden/lexical-journal/journal-node-reorder.test.tsx` | First-party localized toolbar and native-tree pointer/touch/keyboard reorder plus media-safe semantic deletion with selection/history/live-region proof. | planned new |
| Shared owner | `apps/web/src/components/garden/structured-journal-composer.tsx` | Keep external props/ref API; replace mount/save/change/focus/voice/reorder internals with the Lexical client island and finite recovery. | existing; replace internals |
| Four callers | `apps/web/src/app/garden/first-entry-composer.tsx`, `apps/web/src/app/garden/space-entry-composer.tsx`, `apps/web/src/app/garden/objects/[objectId]/follow-up-entry-composer.tsx`, `apps/web/src/app/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx` | Preserve one shared owner and current title/date/save/cover/media/offline/conflict/auth behavior; async create-flow draft hydration must finish before the retained editor binding mounts. | existing; required callers |
| Voice/copy/CSS | `apps/web/src/app/garden/journal-voice-input-control.tsx`, `apps/web/src/lib/structured-journal-composer-copy.ts`, `apps/web/src/app/globals.css` | Use native Lexical insertion/selection, localized toolbar/degraded copy, and editor-owned CSS with zero `.ce-*` or Editor.js selectors. | existing |
| Offline/session | `apps/web/src/lib/offline/drafts.ts`, `apps/web/src/lib/offline/journal-entry-sync.ts`, `apps/web/src/lib/offline/inline-media-intent-controller.ts`, `apps/web/src/lib/offline/owner-composer-participants.ts`, `apps/web/src/lib/offline/owner-composer-durability.ts`, `apps/web/src/lib/offline/owner-composer-locale-change-participant.test.ts` | Preserve canonical document, Blob, owner-vault, generation, locale, retry, and teardown semantics; extend regression evidence only where needed. | existing; preservation boundary |
| Persistence/privacy/search/read | `apps/web/src/server/journal-document-persistence.ts`, `apps/web/src/server/journal-repository.ts`, `apps/web/src/lib/privacy/precise-location-journal-document.ts`, `apps/web/src/server/search/public-journal-document-contract.ts`, `apps/web/src/components/garden/journal-document-renderer.tsx` | Keep canonical validation/projection/rendering engine-free and prove no import/bundle drift. | existing; preservation boundary |
| Media lifecycle | `apps/web/src/server/media/media-lifecycle-enqueue.ts`, `apps/web/src/server/media/media-lifecycle-enqueue.test.ts` | Replace Editor.js-shaped parsing with normalized v1 media IDs and fail-closed zero-effect malformed-document proof. | existing; required correction |
| Real-browser smokes | `apps/web/scripts/smoke-structured-journal-composer.ts`, `apps/web/scripts/smoke-journal-block-reorder.ts`, `apps/web/scripts/smoke-journal-composer-responsiveness.ts`, `apps/web/scripts/smoke-inline-media-integrity.ts` | Exercise the real installed Lexical/node-tree implementation; retain existing generic package command names and bounded receipts. | existing; rewrite evidence owner |
| Browser matrix | `apps/web/scripts/lexical-journal-browser-proof.ts`, `apps/web/scripts/smoke-lexical-journal-browser-matrix.ts`, `apps/web/scripts/lexical-journal-device-equivalent-authorization.ts`, `apps/web/scripts/lexical-journal-device-equivalent-authorization.test.ts`, `apps/web/src/lib/garden/lexical-journal-browser-fixture-contract.ts`, `apps/web/src/app/%5F%5Fvisual-fixtures/lexical-journal/page.tsx`, `apps/web/src/app/%5F%5Fvisual-fixtures/lexical-journal/lexical-journal-visual-fixture.tsx`, and package command `smoke:lexical-journal-browser-matrix` | Add Chromium/Firefox/WebKit, iPhone/Pixel profiles, Android Emulator Chrome/TalkBack/CDP/UIAutomator, adjacent-list identity, semantic delete, clipboard, selection, IME, undo/history, a11y, strict alternative-testing authorization, and bundle-isolation proof without physical-device claim inflation. | planned new |
| Retirement gate | `apps/web/scripts/verify-editorjs-retirement.ts`, `apps/web/scripts/verify-editorjs-retirement.test.ts`, retired `apps/web/src/components/garden/journal-block-reorder-controller.ts`, `apps/web/src/components/garden/journal-block-reorder.test.tsx`, `apps/web/src/components/garden/journal-block-reorder.ts`, `apps/web/src/components/garden/overgarden-image-tool.ts`, `apps/web/src/lib/garden/journal-document-editor-adapter.ts`, and package command `verify:editorjs-retirement` | Delete the legacy adapter/tool/reorder owners and enforce zero active dependency/import/type/runtime/CSS/build residue plus an exact historical provenance allowlist. | planned new |
| Packages | `apps/web/package.json`, `apps/web/pnpm-lock.yaml`, `apps/web/scripts/native-google-link-contract.ts` | Install the exact Lexical set, remove every `@editorjs/*` direct/transitive, add browser/retirement commands, prove one resolved Lexical version, and repin the existing native-Google source-integrity receipt to the canonical changed lockfile. | existing |
| Localization/topology | `apps/web/src/lib/localization/localization-browser-matrix.ts`, `apps/web/src/lib/localization/localization-browser-matrix.test.ts`, `apps/web/src/lib/localization/localization-coverage.ts`, `apps/web/src/lib/localization/localization-coverage.test.ts`, `apps/web/src/lib/garden/journal-composer-shared-owner.integration.test.ts`, `apps/web/src/lib/garden/inline-media-integrity.integration.test.ts` | Rename Editor-specific evidence states, register the internal browser fixture and literals, and keep all four callers/current locale participant topology. | existing |
| Mutation registry | `contracts/auth/authenticated-mutation-registry.v3.json`, `apps/web/scripts/authenticated-mutation-semantic-adapter.ts`, `docs/architecture/AUTHENTICATED_MUTATION_ADMISSION.md` | Regenerate/check only if source topology changes; repin the exact changed lockfile evidence and preserve all mutation admission owners with zero unresolved entries. | existing generated/canon |
| Active docs | `AGENTS.md`, `docs/TECH_STACK_DECISIONS.md`, `docs/STRUCTURED_JOURNAL_COMPOSER.md`, `docs/STRUCTURED_JOURNAL_BLOCK_REORDER.md`, `docs/INTERFACE_LOCALE_CONTRACT.md`, `docs/LOCALIZATION_COVERAGE_WORKFLOW.md`, `docs/TYPOGRAPHY_CONTRACT.md`, `docs/SDD_VERTICAL_SLICE_ROADMAP.md`, `docs/MAINLINE_CLOSEOUT.md` | Make current authority Lexical-native while retaining dated Editor.js facts only as explicit historical provenance. | existing |
| Task mirror | `docs/linear/ove-317-lexical-structured-journal.md` | Store the exact validated saved task body and closeout receipt without private content. | planned new |

Caller/sibling/consumer inventory:

* Only `StructuredJournalComposer` may import the Lexical integration boundary;
  the four route callers, voice control, cover controls, offline owners, and
  media-selection hook consume its application API.
* `JournalDocumentRenderer`, server persistence, privacy traversal, public
  projections/search, cover resolution, media lifecycle, analytics signals, and
  owner/public read paths consume only normalized `JournalDocumentV1`.
* `smoke:structured-journal-composer`, `smoke:journal-block-reorder`,
  `smoke:journal-composer-responsiveness`, and `smoke:inline-media-integrity`
  remain canonical command tokens so existing closeout callers do not silently
  lose coverage; their implementation/evidence class changes to real Lexical.
* Final retirement deletes the baseline transient editor adapter, image tool,
  imperative reorder controller/helper/test, and every direct retired-engine
  package only after the native-tree red contracts are green; the exact deleted
  path inventory remains in the audit and retirement verifier rather than in
  the final target-path table.
* Historical <issue id="7e70672a-63f7-4f32-a88e-2238883f76ed" href="https://linear.app/overgarden/issue/OVE-202/structured-journal-composer-gardener-creates-formats-resumes-edits-and">OVE-202</issue>/206/213/243 receipts, the mainline ledger, and imported
  research remain factual provenance. They may mention Editor.js only through
  the retirement gate's exact path-and-purpose allowlist and cannot be imported
  by production/test code or presented as current architecture.

# Ordered implementation plan

 1. Fetch and inspect current `origin/main`, preserve local state, read <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> and related issue status/relations, run current gates, regenerate the literal and implicit Editor.js inventory, verify ADR-0015 is still the next free number, and stop on drift or a relation cycle.
 2. Write `docs/LEXICAL_STRUCTURED_JOURNAL_EDITOR_AUDIT.md` and ADR-0015 first. Resolve every mandatory capability row to `supported_native` or `supported_custom`; any `blocking_gap`, package/version/license mismatch, experimental dependency, or unclosed Next/React/Node compatibility decision stops implementation and requires a revalidated task amendment.
 3. Follow TDD Red-Green-Refactor: add failing golden/property/security tests for the closed tree grammar, quote body/attribution, NodeState domain IDs, split/merge/transform/reorder/history, safe paste, malformed nodes, and exact canonical round-trip before adding the adapter or custom nodes.
 4. Exact-pin the approved Lexical package set and implement the native extension configuration, exact-version non-coalescing list replacement, app-owned quote/image nodes, bidirectional adapter, stable ID policy, change/flush generations, history, toolbar, paste policy, and error boundary without exposing Lexical to callers or server/read paths.
 5. Replace shared composer internals and first-party reorder with Lexical commands/selection/tree mutation. Preserve voice insertion, all four callers, pre-mount async draft hydration, 1,500 ms flush recovery, locale participant, conflict behavior, and one semantic history entry per reorder/image mutation.
 6. Port inline media through `OverGardenImageNode` and existing atomic reservation/object-URL owners. Correct media-lifecycle orphan parsing to use normalized `JournalDocumentV1`, add malformed/another-owner/race zero-effect tests, and prove local/preview quarantine-to-derivative behavior.
 7. Extend offline, owner/session-generation, locale-transition, precise-location, public/search/SSR, cover, authenticated-mutation, and learning-signal tests so the unchanged domain boundary is proved end to end rather than assumed.
 8. Rewrite the four real-browser smokes around the installed Lexical editor; add Chromium/Firefox/WebKit plus iPhone 17 Pro WebKit, Pixel 10 Chromium, and Android 16 Emulator Chrome with bound TalkBack and localized CDP/UIAutomator accessibility evidence for `uk`/`bg`/`ru` composition, transcript insertion, clipboard, selection, history, toolbar, reorder, focus, 100/10 load, and teardown. Require the exact maintainer authorization receipt, record only bounded content-free evidence, and preserve the explicit physical/VoiceOver/current-Android-Chrome residual risks.
 9. Delete all Editor.js dependencies, transitives, imports, adapter/tool/ controller code, DOM selectors, active docs, test fixtures, and runtime probes. Run the closed retirement allowlist, `pnpm why`, lockfile, and built-chunk proof; do not retain a dual runtime or hidden fallback.
10. Run focused, full, build, browser/device, bundle, privacy, media, search, architecture, and task-standard gates. Push the exact implementation SHA, open/review/merge the PR without bypass, prove containment and READY Vercel deployment, run read-only production boot/cancel/public-bundle evidence, compare the complete saved Linear body digest, read relations back, and mark Done only when every gate is clear.

# UX, accessibility, localization, degraded states, performance, and observability

* Locale matrix: shared `uk`, `bg`, and `ru` in all four composer modes; the
  current Ukraine zero-language-control and Bulgaria bg/ru control policy stays
  owned by <issue id="ad5afb3d-fc66-4411-b1ec-562a6ea2c791" href="https://linear.app/overgarden/issue/OVE-205/market-aware-interface-language-control-ukraine-stays-uk-only-while">OVE-205</issue>/current locale canon.
* Editing model: toolbar state derives from Lexical selection, not a selected
  Editor.js block. Paragraph/H2/H3/list/quote/delimiter/image actions operate on
  the native tree; unsupported commands are omitted from the rendered toolbar.
* Keyboard behavior: arrow and shortcut commands, Tab exit, Escape recovery,
  and localized reorder buttons commit through Lexical selection while focus
  remains visible and escapable.
* Accessibility: contentEditable has one localized accessible name and visible
  focus; toolbar uses roving tab index; Tab exits the editor; Escape cancels a
  transient reorder/popup and restores the prior selection; top-level reorder
  has localized move buttons, pointer/touch targets of at least 44 by 44 CSS
  pixels, polite live announcements, reduced-motion and forced-color support;
  image/delimiter/quote caret boundaries and undo/redo are explicitly tested;
  iPhone WebKit exposes localized roles/names, Android Emulator runs with
  TalkBack bound and exposes localized CDP/UIAutomator trees, and focus always
  remains escapable. Physical-device and VoiceOver-runtime behavior is not
  claimed by <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue>.
* Loading/empty/error/retry: module load shows localized bounded loading without
  replacing the whole page; an empty editor creates one supported paragraph;
  boot/adapter/unsupported-state failure shows the latest known-good
  `JournalDocumentRenderer`, localized reason class, retry, and cancel/back;
  media/offline/auth/conflict states retain their existing explicit recovery.
* Degraded: a slow tree reconciliation, lost composition/reorder terminal event,
  or failed retry never clears the last good document, copied Blob intent, or
  owner binding and never performs an automatic stale save.
* Performance budget: PERF-01 (`journal_composer_mutation_latency`) — `journal_composer_mutation_latency` is at most 34 milliseconds and cancellation prevents late writes.
* Performance measurement: PERF-01 (`journal_composer_mutation_latency`) — VER-03 uses the monotonic browser timer at `smoke:journal-composer-responsiveness` to measure `journal_composer_mutation_latency`.
* Blocking alerts: forbidden
* Global wait overlay: forbidden
* Pointer trap: forbidden
* Unbounded polling/retry: forbidden
* Wait-safe controls: `save journal button`; `cancel composer button` — both remain usable and enabled during every wait.
* Slow/down proof: WAIT-01 — VER-03 at `smoke:journal-composer-responsiveness` — injected `Lexical composition deadline after a lost reorder terminal event` asserts `save journal button` and `cancel composer button` remain responsive and records a bounded `recovery` receipt.
* Observability: allow only editor state class, package/version class, semantic
  node-count bucket, image-count bucket, generation class, elapsed duration,
  long-task count, bundle byte totals, browser/locale/device class, recovery
  class, and redacted error code. Forbid journal text, spans, links, block/media
  IDs, object/blob URLs, identity, owner/session values, precise location,
  payloads, filenames, IP/user-agent, credentials, and raw editor/canonical JSON.

# Migration, compatibility, rollout, rollback, and cleanup

* Expand: on the issue branch only, add the audit/ADR, exact Lexical dependency
  set, native nodes/extensions/adapter, red-first tests, and real-browser proof
  while the old implementation remains available solely for differential tests.
  No branch coexistence may reach merged `main` or a production deployment.
* Legacy/backfill: not applicable — persisted rows, API payloads, Dexie drafts,
  public/search documents, and read renderer already use
  `JournalDocumentV1`; there is no SQL migration, backfill, or Lexical JSON.
* Compatibility: every pre-existing valid v1 fixture loads and re-saves
  canonically; legacy plain-body read fallback remains server-owned; current
  revision/idempotency, offline owner vault, media intent, cover, public/search,
  privacy, locale, and analytics contracts remain unchanged.
* Enforce: after native-tree/device/integration proof passes, remove Editor.js
  in the same PR and make `verify:editorjs-retirement` plus public/read bundle
  isolation mandatory. Do not merge an expand-only dual editor.
* Rollout: exact-head PR checks -> isolated preview browser/media proof -> merge
  without bypass -> fetched main containment -> Vercel READY exact-SHA deploy ->
  read-only production composer boot/type/cancel and public-route bundle proof.
  No production journal, media, user, search, or provider state is mutated.
* Rollback: promote the immediately previous exact safe deployment or revert the
  migration commit and redeploy; unchanged v1 documents need no data rollback.
  `STRUCTURED_JOURNAL_AUTHORING_ENABLED` and a hidden Editor.js bundle are not
  accepted rollback mechanisms.
* Cleanup/retention: destroy unregisters every listener/command/update handler,
  cancels frames/promises, revokes owned object URLs, releases locale/in-flight
  participants, and rejects late generations. Package/lock/CSS/source/build
  retirement is exact; historical factual receipts remain only in the closed
  provenance allowlist.

# Dependencies, ownership boundaries, relations, and non-goals

* Blocked by: none — <issue id="7e70672a-63f7-4f32-a88e-2238883f76ed" href="https://linear.app/overgarden/issue/OVE-202/structured-journal-composer-gardener-creates-formats-resumes-edits-and">OVE-202</issue>, <issue id="7d9963fd-f281-486f-bc42-0b3641e548eb" href="https://linear.app/overgarden/issue/OVE-206/accessible-story-block-reordering-gardener-drags-or-moves-every">OVE-206</issue>, <issue id="ef8c83ef-a49d-4259-ad08-6c20f9ab4b4b" href="https://linear.app/overgarden/issue/OVE-207/journal-cover-selection-gardener-chooses-any-story-image-or-uploads-a">OVE-207</issue>, <issue id="1a9a335b-65d0-49d7-a30c-7203cd3b2d01" href="https://linear.app/overgarden/issue/OVE-213/p0-responsive-journal-composer-opening-editing-and-reordering-never">OVE-213</issue>, <issue id="b73874f9-79ba-46e3-9c4a-4905ec981a42" href="https://linear.app/overgarden/issue/OVE-243/journal-inline-media-integrity-every-selected-image-gets-a-durable">OVE-243</issue>, <issue id="1c5b2abe-ebc4-4b30-8423-97504685d91d" href="https://linear.app/overgarden/issue/OVE-292/one-production-sha-proves-authenticated-runtime-recovery-autosync">OVE-292</issue>,
  <issue id="e9024e44-cfb7-42fd-8b98-9cb3449737ce" href="https://linear.app/overgarden/issue/OVE-284/authenticated-continuity-architecture-closes-only-after-strict-child">OVE-284</issue>, and <issue id="4e946e20-a896-471d-a261-3496d072b079" href="https://linear.app/overgarden/issue/OVE-314/retire-obsolete-pilotadmin-control-plane-and-product-access-invites">OVE-314</issue> are authenticated `Done` baselines on 2026-08-14.
* Blocks: `OVE-186` because the final guest-to-journal exact-SHA closeout cannot
  certify a superseded editor runtime after <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> is accepted into MVP scope.
* Related: `OVE-202`, `OVE-206`, `OVE-207`, `OVE-213`, `OVE-243`, `OVE-292`.
* Duplicate/replaces: no duplicate issue exists. This issue supersedes only the
  current Editor.js implementation choice; completed product outcomes and
  historical receipts remain valid provenance and are not replaced.
* Acyclic execution order: completed baselines -> <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> -> <issue id="3ca4330e-a1cf-4055-98cd-9ee556a05238" href="https://linear.app/overgarden/issue/OVE-186/drive2-parity-production-closeout-prove-the-complete-guest-to-journal">OVE-186</issue>; <issue id="3ca4330e-a1cf-4055-98cd-9ee556a05238" href="https://linear.app/overgarden/issue/OVE-186/drive2-parity-production-closeout-prove-the-complete-guest-to-journal">OVE-186</issue>
  has no edge back to <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> and authenticated read-back must preserve that
  direction.
* Canonical owners: `JournalDocumentV1` owns durable content; shared composer
  owns transient Lexical lifecycle; adapter owns tree/domain conversion;
  existing offline owners own drafts/Blobs/retry; media repository/worker owns
  quarantine/derivative lifecycle; scoped journal repository owns canonical
  writes; public eligibility/outbox owns search projection; renderer owns SSR.
* Staged handshake: Phase A records a no-gap audit/ADR and red contracts; Phase B
  makes native Lexical behavior green while old code is branch-local; Phase C
  deletes Editor.js and proves one-runtime/bundle retirement; Phase D deploys
  and reads back without production content mutation. A failed phase cannot
  authorize the next.

Non-goals:

* Persisting Lexical JSON/HTML/Markdown, changing `JournalDocumentV1`, SQL,
  content schema version, body/search format, offline protocol, media tables, or
  public renderer.
* Recreating Editor.js block UX, copying Lexical Playground, using
  `DraggableBlockPlugin_EXPERIMENTAL`, nested editors for quote attribution,
  experimental mdast/DOM pipelines, or DOM/MutationObserver state ownership.
* Tables, code blocks, embeds, video, mentions redesign, Markdown shortcuts,
  underline/strike/highlight/subscript/superscript, AI writing, comments,
  collaboration/Yjs, realtime, or a composer visual redesign.
* Production data/media smoke, provider/DNS/environment mutation, a second
  runtime feature flag, or deletion/rewording of immutable historical facts.

# Measurable acceptance criteria

1. **AC-01 — Audit and fixed implementation decision.**

* Given: current main, official Lexical 0.49.0 sources, npm metadata, and the full repository Editor.js inventory.
* When: the audit and ADR are reviewed before replacement code.
* Then: every required capability has `supported_native` or `supported_custom`, exact package/license/peer/tree/ID/SSR/paste/media/ offline/a11y/performance/removal/rollback decisions match this issue, and zero `blocking_gap` or experimental production dependency remains.
* Protects: `INV-02`, `INV-10`, `INV-11`, `INV-12`.
* Verified by: `VER-01`, `VER-05`.

2. **AC-02 — Canonical tree round-trip.**

* Given: golden/property inputs for every v1 structure/mark and all numeric boundaries.
* When: each document hydrates a real Lexical state and exports again through the app adapter, including split, merge, type transform, reorder, undo, and redo.
* Then: normalized canonical semantics, IDs, order, quote attribution, and media IDs are identical; unsupported nodes/marks produce a typed closed result and preserve the prior snapshot.
* Protects: `INV-01`, `INV-02`, `INV-03`, `INV-07`.
* Verified by: `VER-01`, `VER-02`.

3. **AC-03 — Complete shared authoring journey.**

* Given: first-entry, follow-up, space-entry, and edit mode with the same canonical fixture.
* When: the gardener types, formats, inserts voice text, selects/reorders nodes and images, undoes/redoes, flushes, saves, and reloads.
* Then: all four callers use one shared owner and return the same canonical read-back/hash with no caller Lexical import or forked lifecycle.
* Protects: `INV-03`, `INV-04`, `INV-10`.
* Verified by: `VER-02`, `VER-03`, `VER-04`.

4. **AC-04 — Offline, auth, locale, and conflict continuity.**

* Given: queued offline draft rows, owner/session-generation change, locale transition, late completion, replay, and edit revision conflict.
* When: each race interrupts a dirty composer.
* Then: the correct owner vault and newest generation retain one canonical draft; retry is manual/idempotent; stale/other-owner/late writes have zero effect; current localized recovery remains available.
* Protects: `INV-04`, `INV-05`, `INV-10`.
* Verified by: `VER-02`, `VER-06`.

5. **AC-05 — Inline media and orphan safety.**

* Given: eleven concurrent local image selections, remove/cancel/unmount races, a valid canonical image document, malformed content, and an another-owner entry.
* When: reservation, insertion, cleanup, and orphan classification run.
* Then: exactly ten selections win, one is rejected, canonical order and durable IDs survive, object URL residue is zero, only stripped derivatives can be public, valid referenced images are never revoked, and malformed or unauthorized classification enqueues zero revokes.
* Protects: `INV-05`, `INV-06`, `INV-07`, `INV-08`.
* Verified by: `VER-02`, `VER-04`, `VER-06`.

6. **AC-06 — Privacy, paste, SSR, and projection isolation.**

* Given: coordinate-bearing Cyrillic text, malicious/obfuscated links, script/style/SVG/event HTML, remote image HTML/URLs, unknown nodes, private and public fixtures.
* When: paste, save, render, publish/archive projection, and bundle checks run.
* Then: forbidden input makes no network/public/search/log effect, precise location remains absent, canonical public/read results remain correct, and public/owner-read chunks contain no authoring engine.
* Protects: `INV-01`, `INV-07`, `INV-08`, `INV-11`.
* Verified by: `VER-01`, `VER-02`, `VER-05`, `VER-06`.

7. **AC-07 — Locale, IME, mobile, and accessibility parity.**

* Given: `uk`/`bg`/`ru` on Chromium, Firefox, WebKit, iPhone 17 Pro WebKit and Pixel 10 Chromium profiles, plus Android 16/API 36 Emulator Chrome with TalkBack enabled and bound; and the exact content-free maintainer authorization accepts the four named residual risks.
* When: Cyrillic composition, injected voice transcripts, selection, browser clipboard shortcuts, Android system `KEYCODE_PASTE`, toolbar/history, Tab/Escape, atomic-node caret, touch/keyboard reorder, forced colors, reduced motion, 100/10 load, teardown, localized CDP AX trees, and the visible Android UIAutomator bridge are exercised. Android clipboard is required in `uk` and is cross-locale covered by both mobile Playwright profiles.
* Then: no text duplication/truncation, lost selection, trap, unlabeled control, stale generation, or order/ID drift occurs and all tested semantics/announcements are localized; the receipt explicitly says `physical: false` and never claims VoiceOver runtime or OS dictation.
* Protects: `INV-03`, `INV-09`, `INV-10`.
* Verified by: `VER-03`, `VER-04`, `VER-06`.

8. **AC-08 — Bounded responsiveness and recovery.**

* Given: a real installed Lexical composer with 100 canonical top-level entries including ten image nodes and an injected lost terminal event.
* When: typing, selection, reorder, serialization, save, cancel, and teardown run.
* Then: PERF-01 (`journal_composer_mutation_latency`) — `journal_composer_mutation_latency` is at most 34 milliseconds and cancellation prevents late writes.
* Protects: `INV-05`, `INV-10`.
* Verified by: `VER-03`.

9. **AC-09 — Complete Editor.js retirement.**

* Given: final source, tests, scripts, package graph, lockfile, CSS, active docs, historical allowlist, and built chunks.
* When: the retirement and bundle verifier runs.
* Then: active Editor.js dependencies/imports/types/probes/selectors/adapters/ assumptions equal zero, `pnpm why` finds no Editor.js package, one exact Lexical version/build is present only in authoring chunks, and every remaining Editor.js string is an approved immutable historical fact.
* Protects: `INV-02`, `INV-11`.
* Verified by: `VER-05`, `VER-06`.

10. **AC-10 — Exact-main reversible delivery.**

* Given: all prior acceptance evidence on one implementation SHA.
* When: that SHA passes PR checks, is contained in current main, reaches a READY Vercel deployment, passes read-only production boot/cancel/public bundle proof, and Linear is read back.
* Then: deployed and tested SHA match, no production content/provider mutation occurred, previous-exact promotion remains viable, description digest and relations match, and only then may <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> become Done.
* Protects: `INV-08`, `INV-11`, `INV-12`.
* Verified by: `VER-06`, `VER-07`.

# Required test and fault matrix

| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |
| -- | -- | -- | -- | -- | -- | -- |
| Audit happy path | INV-02, INV-10, INV-11, INV-12 | AC-01 | VER-01, VER-05 | contract | exact 0.49.0 official capability/package matrix | no blocking gap, exact pins, MIT and fixed architecture |
| Canonical round-trip | INV-01, INV-02, INV-03 | AC-02 | VER-01 | unit/property | every allowed v1 grammar shape and bound | byte-stable normalized semantics and stable domain IDs |
| Unsupported/hostile input | INV-03, INV-07, INV-08 | AC-02, AC-06 | VER-01, VER-02 | unit/integration | unknown node/mark, malicious HTML/link/coordinate | typed denial, latest-good retention, zero network/public effect |
| Shared journey | INV-03, INV-04, INV-10 | AC-03 | VER-02, VER-03, VER-04 | real browser | all four modes, voice, format, reorder, history, save/reload | one owner and identical canonical read-back |
| Authorization/another owner | INV-05, INV-06, INV-08 | AC-04, AC-05 | VER-02, VER-06 | integration | wrong owner/session generation and media entry | generic denial and zero draft/write/revoke effect |
| Duplicate/replay | INV-05 | AC-04 | VER-02 | integration | repeated generation, idempotency key, offline replay | one canonical result and no duplicate mutation |
| Concurrent race | INV-05, INV-06, INV-10 | AC-04, AC-05, AC-08 | VER-02, VER-03 | integration/browser | eleven images, reorder plus flush, owner change plus late update | ten winners, newest fenced generation, zero late effect |
| Timeout/crash/partial success | INV-05, INV-06, INV-10 | AC-04, AC-05, AC-08 | VER-02, VER-03 | browser/integration | lost composition/reorder event, media failure, unmount | bounded recovery, retained document/Blob, zero URL/late residue |
| Archive/erasure/revocation | INV-06, INV-08 | AC-05, AC-06 | VER-02, VER-06 | integration | valid reference, malformed v1, archive and public removal | referenced derivative retained; malformed classification has zero effect; canonical revocation converges |
| Locale/IME/a11y/degraded UI | INV-09, INV-10 | AC-07 | VER-03, VER-04 | browser/device-equivalent | uk/bg/ru composition/transcript pipeline, iPhone/Pixel profiles, Android Emulator bound TalkBack plus AX/UIAutomator, forced colors | lossless text/selection, localized controls, no trap, explicit residual risks |
| Load/resource budget | INV-05, INV-10 | AC-08 | VER-03 | real browser | 100 entries/10 images and lost terminal event | PERF-01 (`journal_composer_mutation_latency`) — `journal_composer_mutation_latency` is at most 34 milliseconds and cancellation prevents late writes |
| Retirement/bundle isolation | INV-02, INV-11 | AC-06, AC-09 | VER-05, VER-06 | package/build | active and historical references plus route chunks | zero active Editor.js, one Lexical version, zero editor in public/read chunks |
| Exact-SHA live read-back | INV-08, INV-11, INV-12 | AC-10 | VER-07 | deployment/Linear | contained READY SHA and read-only browser journey | matching SHA, zero production mutation, rollback and digest receipts |

# Verification commands and required evidence

## VER-01 — Audit, node grammar, adapter, and security contract

* Phase: local
* Proves: `AC-01`, `AC-02`, `AC-06`
* Command status: `must_be_added`
* Expected receipt: audit has no blocking gap; exact 0.49.0 package/node
  decisions match <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue>; golden/property/hostile adapter and custom-node tests
  pass with stable domain IDs and typed closed failures.

```bash
cd apps/web
pnpm exec vitest run src/lib/garden/journal-document-lexical-adapter.test.ts src/components/garden/lexical-journal/journal-lexical-nodes.test.tsx
```

## VER-02 — Canonical, offline, session, media, privacy, and projection integration

* Phase: local/integration
* Proves: `AC-02`, `AC-03`, `AC-04`, `AC-05`, `AC-06`
* Command status: `existing`
* Expected receipt: canonical document, four-caller topology, offline/session,
  image reservation/object URL, media orphan, location, public/search, cover,
  replay/race and failure tests pass with zero another-owner or forbidden effect.

```bash
cd apps/web
pnpm exec vitest run src/lib/garden/journal-document.test.ts src/lib/garden/journal-composer-shared-owner.integration.test.ts src/lib/garden/inline-media-integrity.integration.test.ts src/lib/offline/drafts.test.ts src/lib/offline/journal-entry-sync.test.ts src/lib/offline/inline-media-intent-controller.test.ts src/lib/offline/owner-composer-durability.test.ts src/lib/offline/owner-composer-participants.test.ts src/server/media/media-lifecycle-enqueue.test.ts src/server/privacy/precise-location-boundaries.test.ts src/server/search/public-journal-document-contract.test.ts
```

## VER-03 — Real Lexical responsiveness, history, and no-wedge proof

* Phase: local/browser
* Proves: `AC-03`, `AC-07`, `AC-08`
* Command status: `existing`
* Expected receipt: the rewritten smoke loads the real installed Lexical
  node-tree composer, exercises semantic editing/reorder/history/selection at
  100 entries/10 images, proves the 1,500 ms recovery and zero late teardown
  emission, and records content-free threshold evidence.
* Performance proof: PERF-01 (`journal_composer_mutation_latency`) — target `smoke:journal-composer-responsiveness` measures `journal_composer_mutation_latency` at most 34 milliseconds and records a bounded threshold receipt.
* No-wedge proof: WAIT-01 — target `smoke:journal-composer-responsiveness` injects `Lexical composition deadline after a lost reorder terminal event`, proves `save journal button` and `cancel composer button` remain responsive, and records a bounded `recovery` receipt.

```bash
cd apps/web
pnpm smoke:journal-composer-responsiveness -- --base-url http://localhost:3000
```

## VER-04 — Cross-browser, device-equivalent accessibility, and real editor behavior

* Phase: local/browser/device-equivalent
* Proves: `AC-03`, `AC-05`, `AC-07`
* Command status: `must_be_added`
* Expected receipt: 18 browser/locale pairs covering Chromium, Firefox,
  WebKit, iPhone 17 Pro WebKit, Pixel 10 Chromium, and Android 16 Emulator
  Chrome with TalkBack bound. It proves the task-local composition, transcript
  insertion, clipboard, selection, toolbar, atomic-node, history,
  touch/keyboard reorder, media, focus, forced-color, reduced-motion, dense,
  teardown, CDP AX, and UIAutomator checks. The validated authorization digest
  and four residual risks are present; evidence is redacted/content-free and
  explicitly does not claim physical hardware, VoiceOver runtime, OS dictation,
  or current stable Android Chrome.

```bash
cd apps/web
pnpm smoke:lexical-journal-browser-matrix -- \
  --base-url http://127.0.0.1:3000 \
  --device-equivalent-authorization /tmp/ove317-device-equivalent-authorization \
  --android-cdp-url http://127.0.0.1:9224 \
  --adb-path /Users/yehor/Library/Android/sdk/platform-tools/adb
```

## VER-05 — Dependency retirement and bundle isolation

* Phase: local/build
* Proves: `AC-01`, `AC-06`, `AC-09`
* Command status: `must_be_added`
* Expected receipt: the exact historical allowlist is valid; active
  Editor.js/package/CSS/runtime references and transitives are zero; all Lexical
  packages resolve to 0.49.0 as one build, and every remaining Editor.js string
  is a classified historical fact.

```bash
cd apps/web
pnpm verify:editorjs-retirement
```

## VER-06 — Full repository, architecture, media, search, and release gates

* Phase: local/CI
* Proves: `AC-04`, `AC-05`, `AC-06`, `AC-07`, `AC-09`, `AC-10`
* Command status: `existing`
* Expected receipt: all generic real-editor smokes, locale/typography,
  mutation-surface, authenticated architecture, schema, lint, types, full tests,
  production build, task standard, and diff checks pass on the captured SHA.

```bash
cd apps/web
../../infra/run-with-local-infra-env pnpm local:bootstrap
../../infra/run-with-local-infra-env pnpm db:types:check
pnpm smoke:structured-journal-composer
pnpm smoke:journal-block-reorder
pnpm smoke:inline-media-integrity -- --environment local --confirm-environment local
pnpm smoke:journal-cover-selection
pnpm localization:coverage:check
pnpm typography:check
pnpm mutation:surface:audit -- --check
pnpm mutation:surface:enforce
pnpm exec vitest run scripts/smoke-authenticated-architecture.test.ts
pnpm test:a11y
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm why @editorjs/editorjs
pnpm linear:task:standard:check
git diff --check
```

## VER-07 — Exact-main, READY deployment, rollback, and Linear read-back

* Phase: main/deployment/live
* Proves: `AC-10`
* Command status: `existing`
* Expected receipt: implementation SHA is contained in current origin/main;
  exact-head CI succeeds; exact-SHA Vercel deployment is READY with canonical aliases;
  read-only production owner composer boot/type/cancel, public locale handoff,
  and public bundle checks pass with zero canonical/provider mutation; previous exact deployment remains
  promotable; saved description SHA-256 and <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> -> <issue id="3ca4330e-a1cf-4055-98cd-9ee556a05238" href="https://linear.app/overgarden/issue/OVE-186/drive2-parity-production-closeout-prove-the-complete-guest-to-journal">OVE-186</issue> relation match.

```bash
git fetch origin main
git merge-base --is-ancestor "$OVE317_IMPLEMENTATION_SHA" origin/main
cd apps/web
pnpm mainline:closeout:check
pnpm mainline:closeout:check
pnpm smoke:session-locale-convergence -- --environment production --confirm-environment production --base-url https://over.garden --expected-commit "$OVE317_IMPLEMENTATION_SHA"
# Authenticated Vercel read-back: compare the READY deployment Git SHA and canonical aliases with OVE317_IMPLEMENTATION_SHA, run only the read-only boot/type/cancel and public-bundle journey, and confirm zero production data/provider mutation.
# Authenticated Linear read-back: fetch complete OVE-317 fields, description, labels, milestone, status and relations; compare the saved UTF-8 SHA-256 with the validated task mirror before Done.
```

# Delivery, exact-SHA proof, and Linear closeout

* Delivery path: repository_change
* Delivery sequence: current_main -> preserve_local -> issue_branch -> conventional_commit -> branch_push -> pull_request -> exact_head_checks -> capture_feature_sha -> merge_without_bypass -> fetch_main -> containment -> mainline_closeout -> linear_readback -> done
* Issue branch: `codex/ove-317-lexical-structured-journal`
* Implementation SHA variable: `OVE317_IMPLEMENTATION_SHA`
* Direct main mutation: forbidden
* Local state preservation: required

Start from current main on `codex/ove-317-lexical-structured-journal`. Preserve all unrelated and ignored local files and secrets. Use a Conventional Commit, push, open a PR, and run exact-head checks. Before merge, record `OVE317_IMPLEMENTATION_SHA=$(git rev-parse HEAD)` exactly once in the redacted closeout receipt. Merge without bypass only after every required check passes. After merge, fetch origin/main, run `git merge-base --is-ancestor "$OVE317_IMPLEMENTATION_SHA" origin/main`, and then run `cd apps/web && pnpm mainline:closeout:check`. Perform the final Linear read-back and compare the saved-description SHA-256 before Done.

# Failure gates

* Stop before implementation if fetched main, <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> fields/relations,
  dependency metadata, official 0.49.0 sources, ADR numbering, caller inventory,
  or current behavior differs materially from the pinned evidence.
* Stop after the audit when any capability is `blocking_gap`, any implementation
  choice in this issue is still open, an experimental plugin/pipeline is
  required, licenses/peers mismatch, or multiple Lexical versions/builds cannot
  be excluded. Do not silently select another version or architecture.
* Do not implement a faux Editor.js block layer, tool/tune mapping, `data.*`
  canonical shape, raw Lexical persistence, nested quote editor, DOM source of
  truth, MutationObserver reorder, experimental draggable, or a second runtime.
* Do not remove Editor.js until red-first adapter/node/media/offline/browser
  tests are green and every valid existing v1 fixture round-trips with identical
  semantics, IDs, order, quote attribution, and media identities.
* Stop and rollback if unsupported nodes/marks disappear silently; unsafe paste
  triggers a fetch; precise location or private data reaches logs/public/search;
  malformed media classification can enqueue a revoke; another owner can read
  or mutate; object URLs, listeners, participants, or late generations survive.
* Do not accept jsdom-only, mocked API, opaque editor fixture, Chromium-only,
  desktop-only, unapproved simulator-only, HTTP 200, or local-only evidence for
  real `contentEditable`, IME, mobile accessibility, media, performance, bundle,
  or deployment claims. For <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> the only approved hardware substitute is
  the exact validated authorization plus the iPhone/Pixel profile and Android
  Emulator/TalkBack/CDP/UIAutomator matrix in AC-07/VER-04. Never relabel it as
  physical-device, VoiceOver-runtime, OS-dictation, or current-Android-Chrome
  proof.
* Stop rollout if the 1,500 ms recovery or WAIT-01 fails,
  public/read chunks contain an editor, authoring bundles contain Editor.js or
  duplicate Lexical, active retirement references remain, build/CI/browser/
  device/privacy/media/search/architecture gates fail, or historical evidence
  was erased instead of allowlisted.
* Production journal/media/user/search/provider mutation, a DB/backfill/schema
  change, environment flag mutation, destructive cleanup, or weakening a
  privacy/media/authorization boundary requires a new authorized contract and
  is forbidden here.
* Do not merge or mark Done when the PR is bypassed, implementation SHA is not
  contained in current main, Vercel is not READY for that SHA, rollback is not
  viable, <issue id="aefceed7-76ea-40eb-8e3e-0306d4b8ec6c" href="https://linear.app/overgarden/issue/OVE-317/replace-editorjs-with-lexical-preserve-the-complete-safe-journal">OVE-317</issue> -> <issue id="3ca4330e-a1cf-4055-98cd-9ee556a05238" href="https://linear.app/overgarden/issue/OVE-186/drive2-parity-production-closeout-prove-the-complete-guest-to-journal">OVE-186</issue> is missing/cyclic, saved description bytes differ,
  or the complete authenticated Linear read-back is absent.

# Required context

Repository authority:

* `AGENTS.md`
* `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`
* `docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md`
* `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
* `docs/MAINLINE_CLOSEOUT.md`
* `docs/TECH_STACK_DECISIONS.md`
* `docs/adr/ADR-0014-agentic-stack-realignment.md`
* `docs/INFRASTRUCTURE_REGISTRY.md`
* `docs/STRUCTURED_JOURNAL_COMPOSER.md`
* `docs/STRUCTURED_JOURNAL_BLOCK_REORDER.md`
* `docs/INTERFACE_LOCALE_CONTRACT.md`
* `docs/LOCALIZATION_COVERAGE_WORKFLOW.md`
* `docs/TYPOGRAPHY_CONTRACT.md`
* `docs/PRECISE_LOCATION_TEXT_FIREWALL.md`
* `docs/PUBLIC_PROJECTION_REVOCATION.md`
* `contracts/auth/authenticated-mutation-registry.v3.json`
* `docs/architecture/AUTHENTICATED_MUTATION_ADMISSION.md`
* `apps/web/package.json`
* `apps/web/pnpm-lock.yaml`
* `apps/web/src/lib/garden/journal-document.ts`
* `apps/web/src/components/garden/structured-journal-composer.tsx`
* `apps/web/src/server/media/media-lifecycle-enqueue.ts`

Product research:

* `docs/product-research/README.md`
* `docs/product-research/MVP_LOGGING_DESIGN-BRIEF.md` — constrains the migration to low-friction narrative title/body, optional photo/voice/backdate, and progressive disclosure without feature expansion.
* `docs/product-research/OverGarden_MVP_PRD_v0.md` — constrains offline capture, visible sync/retry, idempotent canonical save, media privacy, and narrative read-back.
* `docs/product-research/OverGarden_PAGE_ARCHITECTURE_v1.md` — constrains one shared transient composer across object/space contexts, drafts, and recovery while current locale/privacy canon wins over historical notes.
* `docs/product-research/ENTRY_DATA_AND_RANKABILITY_SPEC_v0.md` — constrains title/body semantics, supported narrative structure, and stable plain-text/public projections.

Linear baselines and relations:

* `OVE-202`, `OVE-206`, `OVE-207`, `OVE-213`, `OVE-243`, `OVE-292`,
  `OVE-284`, and `OVE-314` are completed behavior/evidence owners; `OVE-317`
  blocks `OVE-186` and relates to the nine declared predecessors.

Official primary external references:

* [Lexical overview](<https://lexical.dev/docs/intro>)
* [React integration](<https://lexical.dev/docs/getting-started/react>)
* [Editor state](<https://lexical.dev/docs/concepts/editor-state>)
* [Nodes and NodeState](<https://lexical.dev/docs/concepts/nodes>)
* [Serialization](<https://lexical.dev/docs/serialization/>)
* [Extensions](<https://lexical.dev/docs/extensions/intro>)
* [Testing](<https://lexical.dev/docs/testing>)
* [Keyboard accessibility](<https://lexical.dev/docs/concepts/keyboard-accessibility>)
* [Supported browsers](<https://github.com/facebook/lexical/blob/v0.49.0/README.md>)
* [Lexical v0.49.0 release](<https://github.com/facebook/lexical/releases/tag/v0.49.0>)
* [Lexical MIT license](<https://github.com/facebook/lexical/blob/v0.49.0/LICENSE>)
