# OVE-202 Structured Journal Composer

Status: implemented; Linear Done awaits founder physical iPhone Safari checklist (decision 1A)
Issue: OVE-202

## Package pins

| Package | Version | License |
| --- | --- | --- |
| `@editorjs/editorjs` | 2.31.6 | Apache-2.0 |
| `@editorjs/header` | 2.8.9 | MIT |
| `@editorjs/list` | 2.0.9 | MIT |
| `@editorjs/quote` | 2.7.6 | MIT |
| `@editorjs/delimiter` | 1.4.2 | MIT |

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
pnpm lint && pnpm typecheck
pnpm test src/lib/garden/journal-document.test.ts src/server/erasure-execution.test.ts
```

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
