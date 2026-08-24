# Structured Journal Cover Selection

Status: current after OVE-349
Authority: ADR-0019 and `journal_entries.cover_media_asset_id`

Cover identity is aggregate state on `journal_entries.cover_media_asset_id`,
not part of `JournalDocumentV1`. Media rows use `usage_role` (`inline` or
`cover_only`); cover-only media do not consume one of the ten inline story
slots.

## Effective cover

Shared resolver: `apps/web/src/lib/garden/journal-cover-contract.ts`

1. A valid explicit final `cover_media_asset_id` (inline or cover-only).
2. Otherwise, the first valid final inline image in canonical document order.
3. Otherwise, `null` with localized no-cover presentation.

SQL consumers use `buildFirstProcessedMediaPerEntryQuery` and
`apps/web/src/server/journal-cover.ts`; the historical function name remains a
compatibility label, but eligibility is now exactly non-null final derivative
plus non-revoked state. Never choose first-by-creation-time.

## Composer and publication

Cover selection is transient in the shared local composer. A chosen source is
converted to the final WebP in the browser, previewed from those exact bytes,
and uploaded directly to short-lived edge staging. The media identity, order,
and cover pointer become durable together with the public journal in one atomic
Publish. No server draft, immediate source upload, process step, or later
publish action exists.

Removing an explicit inline cover still offers keep-as-cover,
remove-everywhere, or cancel. Failed conversion/staging leaves canonical state
unchanged and the transient image retryable/removable.

## Proof

```bash
cd apps/web
pnpm smoke:journal-cover-selection
pnpm smoke:inline-media-integrity
pnpm smoke:atomic-journal-codecs
pnpm exec tsx scripts/verify-retired-journal-media-runtime.ts
```

Cover evidence never includes object keys, capabilities, original bytes,
precise location, or account identity.
