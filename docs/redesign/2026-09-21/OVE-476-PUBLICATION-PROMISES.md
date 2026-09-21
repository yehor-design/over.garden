# OVE-476 — public-only publication and truthful notices

Implementation receipt; production closeout is recorded in Linear after merge
and deployment verification. Baseline: `165471e014b3966f0b224048b9b02ba8bc3ce633`.

## Product boundary

There are **only public journal entries**. Unpublished text is transient input
in the open tab, not a private entry or a saved draft. This is the existing
ADR-0022 contract, reaffirmed by the owner during implementation. Editorial
pipeline drafts under ADR-0030 and protected lineage invitations are different
features and remain unchanged.

## Claim-to-contract ledger

The complete before/after source-key inventory is
[`OVE-476-CLAIM-LEDGER.json`](OVE-476-CLAIM-LEDGER.json). It includes Ukrainian,
Bulgarian, Russian and the base authored-content fallback. It is a copy ledger,
not a count of distinct defects: array insertions shift subsequent source keys.

| Journey / old promise | Correct statement | Runtime authority |
| --- | --- | --- |
| Sign-in, garden empty state, market CTA, tomato FAQ, guide and blog: save privately, optionally publish later | Publish creates a public entry; unsent writing is not saved | `journal-repository.ts` atomic create writes `visibility: public`; `use-local-journal-composer.ts`; ADR-0022 |
| Sign-out: local changes will be kept for this account | Leaving discards unpublished input | `sign-out-provider.ts` hard navigation and session signal; `unpublished-work-guard.tsx`; `ONLINE_ONLY_JOURNAL.md` |
| Original photo quarantine, server cleaning, seven days of processing | Browser prepares WebP; no source-original retention or server image processing | `browser-journal-image-encoder.ts`, `ephemeral-staging-client.ts`, staging Worker; `MEDIA_LIFECYCLE.md` |
| Abandoned staging cleaned after fifteen minutes | Two hours after the last touch; one-day bucket lifecycle is fallback | `ephemeral-staging-contract.ts`, Worker lease/alarm; `MEDIA_LIFECYCLE.md` |
| User entries excluded from search until later promotion | Published journal entries are eligible for indexing; actual external indexing is not guaranteed | ADR-0022, public surface indexing policy, public entry metadata and IndexNow |
| Archive and later restore implied | Entry deletion is final; public content disappears, scrubbed technical retention lasts at most seven days, external copies are not guaranteed removed | `buildDeleteJournalEntryQuery`, deletion retention worker, ADR-0021/0022 |
| Erasure request described as schema links, tombstones and HTTP codes | Submitting requests review; it does not erase automatically. The page shows status, outcome, retention and external-copy limits | `erasure-requests` actions, `erasure-execution.ts`, `erasure-dry-run-repository.ts` |
| Support unavailable after a root failure | Support and privacy are full-document links from the root error screen | `global-error.tsx`; ordinary anchors deliberately recover independently of the failed router |

Private source details, lineage invitations, account/session information and
private feedback are not journal entries. Their scoped protection is preserved;
this task does not indiscriminately replace every use of the word “private”.

## Acceptance evidence and migration

`first-publication-v6` describes the corrected public/indexable journal,
browser-prepared media and final deletion. Older versions retain their original
meaning and timestamp; they are never relabelled as v6.

Migration **0079** adds `publication_disclosure_acceptances` keyed by account
and version, with acceptance time and no content/request metadata. It backfills
surviving historic entry receipts. New acceptance and publication commit in the
same transaction; a failed publication cannot leave an acceptance behind.
The existing per-entry receipt remains historical evidence.

The composer sends the notice version. The API rejects a missing/stale version
before media claims or writes. The repository also checks the current version,
requires explicit acceptance if it is absent, and avoids another prompt after
that version was accepted. Entry deletion/purge cannot delete account-level
acceptance. Account erasure cascades it; erasure dry-run counts include it.
Previously purged receipts cannot be reconstructed and are not fabricated.

Apply 0079 before releasing the new reader. It is additive and compatible with
the previous release. A code rollback keeps the receipt table; the down script
deliberately does not destroy acceptance evidence.

## Proof ownership

- `publication-promises.test.ts`: consistent facts across the localized
  activation/help/composer/privacy journey, with regression checks against the
  observed false statements.
- Route tests: stale/missing notice version rejected before media or journal
  writes; current version reaches the scoped atomic repository.
- `publication-notice.spec.ts`, registered in the real browser gate: no-JS
  notices and support navigation in all three languages; an authenticated
  returning gardener with a v5 receipt, explicit v6 acceptance, idempotent
  replay, retention purge, subsequent publication without another prompt,
  unchanged acceptance timestamp, and account-deletion cascade.
- Notice/privacy route tests verify served text; root-error test verifies
  public support/privacy links without private exception details.
- Existing media, journal deletion, erasure and composer suites continue to
  own their underlying processing/mutation contracts.

Privacy and publication-notice loading boundaries are removed: these pages
already have no request-time content read. Support now also has a params-only
static document in each locale; the proxy resolves the existing unprefixed
address into that tree. The no-JavaScript browser proof caught and now guards
the previously blank support destination. The broader static-document migration
remains OVE-467; this correction does not claim its completion.

## Local verification (2026-09-21)

- Full `pnpm test`: unit suites and repository gates passed. Production build
  includes lint/typecheck. The registered notice browser spec passed both
  scenarios against `next start` and a fresh isolated database containing all
  migrations, including 0079.
- Manual browser inspection: Russian publication notice at 1440 × 900;
  Bulgarian support at 390 × 844. Text wrapped without clipping. Keyboard Tab
  exposed the visible skip link; Enter moved to main content; the next Tab
  focused the support mail link with a visible ring. No email was sent.
  This is targeted manual evidence, not a claim of a complete screen-reader
  audit of the product.
- The inspection caught an additional footer indexing guarantee; all three
  languages now say entries *may* appear in search. The claim ledger includes
  that correction.
- Production migration 0079 was applied before code release. The structural
  receipt and SQL hash are in `PRODUCTION_SCHEMA_STATE.md`.
