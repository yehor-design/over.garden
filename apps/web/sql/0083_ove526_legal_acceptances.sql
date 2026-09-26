-- OVE-526 (ADR-0038 D2): one acceptance of Overgarden's three documents —
-- the terms of use, the privacy policy and the cookie rules — before a person
-- uses the product, and again, once, whenever any of them changes.
--
-- A receipt belongs to the account, never to content, so it survives deleting
-- entries and goes with the account on erasure (the pattern of `0079`). Each
-- row names the set of versions accepted (`legal-YYYY-MM-DD`, the
-- `LEGAL_BUNDLE_VERSION` of `src/lib/legal/legal-documents.ts`) and where it
-- was given: the sign-up form, written as soon as the account row exists, or
-- the acceptance screen a Google sign-in or an older account meets. A new
-- version adds a row; older rows stay as the history of what was accepted
-- when.
--
-- The `0079` publication receipts stay as historical evidence and are no
-- longer read or written. Nothing is backfilled: no account has accepted
-- these documents yet, and an older agreement is never read as this one.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists legal_acceptances (
  owner_user_id uuid not null references "user"(id) on delete cascade,
  bundle_version text not null
    check (bundle_version ~ '^legal-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  source text not null check (source in ('sign_up', 'acceptance_screen')),
  accepted_at timestamptz not null default now(),
  primary key (owner_user_id, bundle_version)
);

comment on table legal_acceptances is
  'One row per account and accepted version of the terms, privacy policy and cookie rules; no content. Cascades on account erasure.';
