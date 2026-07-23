# Structured Journal Cover Selection (OVE-207)

Cover identity is aggregate state on `journal_entries.cover_media_asset_id`, not
part of `JournalDocumentV1`. Media rows use `usage_role` (`inline` |
`cover_only`). Cover-only assets do not consume one of the ten inline story
slots.

## Effective cover

Shared resolver: `apps/web/src/lib/garden/journal-cover-contract.ts`

1. Valid explicit `cover_media_asset_id` (inline or cover-only, processed with
   derivative).
2. Else first valid processed **inline** image in canonical document block
   order (`document_position` kept in sync on claim).
3. Else `null` (localized no-cover).

SQL consumers use `buildFirstProcessedMediaPerEntryQuery` /
`apps/web/src/server/journal-cover.ts` — never first-by-`created_at`.

## Composer

Progressive optional Cover controls on first / follow-up / space / edit
composers. Offline drafts store cover mode + separate photo intent; sync claims
cover after processing. Cover upload registers
`owner-composer-cover-upload` as locale in-flight.

Removing an explicit-inline cover image prompts keep-as-cover /
remove-everywhere / cancel.

## Proof

- `pnpm smoke:journal-cover-selection`
- Contract tests + consumer SQL compile tests
- Localization gate `separate-cover` is browser-backed with primary scenario
  `locale-transition-with-cover`

Do not treat this slice as final OVE-195/196/197 lifecycle/search/focal proof.
