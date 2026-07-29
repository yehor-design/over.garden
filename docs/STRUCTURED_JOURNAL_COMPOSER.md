# OVE-202 Structured Journal Composer

Status: done on main (founder iPhone Safari checklist confirmed)
Issue: OVE-202

## Package pins

| Package               | Version | License    |
| --------------------- | ------- | ---------- |
| `@editorjs/editorjs`  | 2.31.6  | Apache-2.0 |
| `@editorjs/header`    | 2.8.9   | MIT        |
| `@editorjs/list`      | 2.0.9   | MIT        |
| `@editorjs/quote`     | 2.7.6   | MIT        |
| `@editorjs/delimiter` | 1.4.2   | MIT        |

Image handling uses first-party `OverGardenImageTool` (no `@editorjs/image`, no CDN).

## Contract

- Persistence boundary: application-owned `JournalDocumentV1`
- Derived `body` remains plain-text projection for search/snippets/metrics
- Aggregate `journal_revision` + `journal_entry_mutation_receipts` for create/edit idempotency
- Max ten inline images (`MAX_JOURNAL_INLINE_IMAGES`)
- Offline photo Blob logical ceiling: 120 MiB (`MAX_OFFLINE_PHOTO_LOGICAL_BYTES`)
- Kill switch: `STRUCTURED_JOURNAL_AUTHORING_ENABLED` (default enabled; readers always accept V1)
- Typography: inherits `--font-overgarden-sans` / `font-sans` only; never persists `font-family`

## Surfaces

- Shared owner composer: `StructuredJournalComposer`
- Wired into first-entry, follow-up, space entry, and `/garden/entries/[entryId]/edit`
- Public/owner read: `JournalDocumentRenderer` (no Editor.js on public/read)
- Offline: Dexie `contentDocument` + multi `photoIntentsByBlockId`; sync uploads then remaps provisional media ids
- Locale: registers through existing OVE-205 `owner-composer-drafts` participant

## Verification

```bash
cd apps/web
pnpm smoke:structured-journal-composer
pnpm smoke:inline-media-integrity -- --environment local --confirm-environment local
pnpm lint && pnpm typecheck
pnpm test src/lib/garden/journal-document.test.ts src/server/erasure-execution.test.ts
```

## Inline media integrity

OVE-243 makes photo selection one shared atomic boundary across first-entry,
follow-up, space, and edit composers. Each file is synchronously reserved before
the first asynchronous read, so parallel picker callbacks cannot exceed ten
inline images or the logical byte budget through stale React state. Create flows
own a copied offline intent before a block becomes canonical; edit uploads obtain
a processed durable media identity before insertion. Preview object URLs have one
controller owner and are revoked on removal, owner or entry transition, cancel,
and unmount.

Explicit save waits at most 1500 ms for composition or reorder recovery and then
serializes the latest editor generation. The finite deadline prevents a lost
terminal browser event from leaving Save or Cancel permanently blocked. The
local-only smoke refuses preview/production and emits only bounded synthetic
counts and latency; it never uploads media or mutates a canonical journal.

Closeout pattern matches OVE-208: local suite + Vercel `READY` for exact SHA. GitHub Actions may remain `workflow_dispatch` under budget freeze.

## Physical iPhone checklist (founder)

Required before Linear Done (decision 1A):

1. Open first-entry composer on current-support iPhone Safari
2. Cyrillic IME composition in uk/bg/ru without truncated autosave
3. Bold/italic/link, H2/H3, list depth 2, quote, delimiter
4. Add/reorder/remove up to 10 device photos; reject 11th
5. Offline draft resume after airplane mode
6. Auth interruption resume without duplicate create
7. Edit existing entry with expectedRevision conflict path

Do not record private journal text, media URLs, or identities in evidence.

## OVE-213 responsiveness boundary

- Reorder chrome writes text, labels, and disabled state only when the value
  changes. Controller-owned cosmetic mutations are ignored by its subtree
  observer instead of feeding another synchronization delivery.
- Real Editor.js mutation bursts schedule at most one synchronization per
  animation frame. Destroy cancels that frame before disconnecting listeners
  and removing controller chrome, so a departed composer cannot receive a late
  write.
- `pnpm smoke:journal-composer-responsiveness` bundles the production controller
  source into a native Chromium DOM, proves zero no-op and five-second idle
  observer deliveries, converges a 100-block/10-image mutation burst within the
  34 ms policy, exercises the two wait-safe actions, and proves teardown fencing.
- Receipts contain only bounded state classes. Journal content, block/media IDs,
  identity, payloads, precise location, IP/user-agent, and credentials remain
  forbidden evidence.
