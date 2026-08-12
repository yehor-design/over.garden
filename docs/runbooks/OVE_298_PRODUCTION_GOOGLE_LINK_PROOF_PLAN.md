# OVE-298 Production Google Link Proof Plan

Status: awaiting exact maintainer approval. This file becomes the immutable,
byte-exact production plan only when its SHA-256 digest and the exact feature
implementation SHA are approved together.

## Protected outcome

An ordinary verified email/password gardener can explicitly add Google as a
second sign-in method without an implicit merge, local identity change, or
last-method loss. The OVE-314 sealed owner remains credential-only: it receives
no Link Google control and direct link admission fails before OAuth state is
created.

This plan applies two additive indexes, enables one existing server flag, and
executes one fully bounded disposable account lifecycle. It never selects or
records an existing email, user ID, Google subject, token, cookie, OAuth state,
callback query, provider credential, IP, user-agent, private payload, media key,
or precise location.

## Approval-bound plan

The literal `$OVE298_IMPLEMENTATION_SHA` token avoids an impossible Git
self-reference. The approval envelope supplies the exact 40-character feature
SHA while the SHA-256 plan digest covers every byte of this tracked file. Any
file, SHA, count, index, target, configuration, provider, fixture, effect-bound,
rollback, or cleanup drift invalidates approval before the next effect.

```json ove298-plan-v1
{
  "schema": "overgarden.google-linking-production-proof-plan.v1",
  "issue": "OVE-298",
  "environment": "production",
  "implementationSha": "$OVE298_IMPLEMENTATION_SHA",
  "migrationPath": "sql/0022_ove295_google_account_uniqueness.sql",
  "migrationDigest": "6392a41f971176eb9de748f54fc15beb76a6a77f8a755694d327fe8eae40f6bd",
  "counts": {
    "googleAccountRowCount": 1,
    "duplicateGoogleSubjectGroupCount": 0,
    "duplicateGoogleUserGroupCount": 0,
    "missingGoogleSubjectCount": 0,
    "invalidGoogleProviderRowCount": 0
  },
  "inventoryClass": "safe_to_apply",
  "preflightIndexState": "both_absent",
  "expectedIndexDefinitionDigests": {
    "providerSubject": "fed091a72b61aa8d9b9573dadeeb345dbcdea979b7173154dddac81a9fbe7dbe",
    "userProvider": "9e68f3c994090992c14869a501de524e96135484426b03dca2211b3bcdba4e66"
  },
  "configurationClass": "absent_or_false",
  "googleProviderClass": "configured",
  "disposableIdentityClass": "ordinary_credential_non_owner_non_admin",
  "terminalSuccessConfiguration": "enabled",
  "targetDigest": "84503a97fba4e9febf14db87091ce05d2866796d78109f812a649c23f9c36462",
  "effectBounds": {
    "indexCreates": 2,
    "configurationWrites": 1,
    "disposableAccountCreates": 1,
    "verificationCallbacks": 1,
    "linkInitiations": 1,
    "callbacks": 1,
    "unlinks": 1,
    "providerRevocations": 1,
    "erasureExecutions": 1
  },
  "mutationOrder": [
    "database_indexes",
    "vercel_flag",
    "disposable_signup",
    "email_verification",
    "disposable_link",
    "authoritative_readback",
    "fresh_session_unlink",
    "provider_revoke",
    "erasure_cleanup"
  ]
}
```

## Read-only preflight receipt

- Captured: 2026-08-12 Europe/Sofia.
- Environment: Vercel project `over-garden`, Production; canonical aliases
  `over.garden` and `www.over.garden`; DigitalOcean Managed Postgres production
  target resolved from the Vercel secret store without emitting the connection
  value.
- Inventory: `safe_to_apply`; `googleAccountRowCount=1`; all four safety counts
  are zero; transaction duration `415ms`.
- Index state: `both_absent`; neither approved index name exists.
- Migration digest:
  `6392a41f971176eb9de748f54fc15beb76a6a77f8a755694d327fe8eae40f6bd`.
- Database target digest:
  `84503a97fba4e9febf14db87091ce05d2866796d78109f812a649c23f9c36462`.
- Vercel configuration class: `GOOGLE_ACCOUNT_LINKING_ENABLED` absent;
  Google client credential names present. No value was read or recorded.
- Canonical production deployment before apply:
  `dpl_HMLdqNQE6U2nxSnpQ31DvRtESYKq`, `READY`, `PROMOTED`, SHA
  `9449455db4e4417f03ad08e7bdd4c212eb4f1f00`.
- Evidence safety: exactly five counts, bounded classes, durations, deployment
  identifiers, and digests. No row or identity value is evidence.

`targetDigest` is computed inside the operator over a canonical JSON payload
containing only the environment class plus parsed database protocol, host,
port, database name, schema `public`, and table `account`. The payload is never
emitted; only its digest may enter the approval or receipt. A different secret
connection value therefore invalidates approval without exposing it.

## Exact migration and index contract

Only `apps/web/sql/0022_ove295_google_account_uniqueness.sql` may execute. The
operator reads that tracked file, verifies its SHA-256 against the plan, opens a
serializable transaction, repeats all five counts and the index-state read-back,
and applies the file only when every approved value still matches.

The only accepted terminal definitions are:

1. `account_google_provider_subject_unique_idx` — unique
   `public.account ("providerId", "accountId")` where
   `"providerId" = 'google'`.
2. `account_google_user_provider_unique_idx` — unique
   `public.account ("userId", "providerId")` where
   `"providerId" = 'google'`.

The operator canonicalizes `pg_get_indexdef` semantics and compares the two
approved digests. Zero rows may be rewritten or deleted by the migration. A
partial, renamed, non-unique, reordered, re-predicated, or unexpected index is
`partial_or_drifted` and blocks apply and enablement.

## Approved production sequence

Execute once in the JSON `mutationOrder`. No step retries automatically.

1. **Database indexes.** Re-pull the current Production environment into a
   permission-restricted ephemeral file. Run the approval-bound `apply-indexes`
   operator. It repeats the five counts and target digest under the transaction,
   applies only migration `0022`, reads both exact definitions back, and commits
   only on `indexes_verified`. Keep both indexes on every later rollback.
2. **Vercel flag.** Add exactly `GOOGLE_ACCOUNT_LINKING_ENABLED=true` to the
   Vercel Production environment. Do not add, delete, or edit another variable.
   Redeploy the current containing `origin/main` SHA, require `READY` and
   `PROMOTED`, both canonical aliases, and the feature-SHA ancestry proof.
3. **Disposable signup.** Create exactly one new self-serve email/password
   account using an agent-owned disposable inbox. The account must have no
   admin role, must not equal the sealed-owner ID, and must create no garden,
   object, journal, media, community, lineage, moderation, or public content.
   Credentials and inbox address remain outside chat, logs, git, Linear, and
   receipts.
4. **Email verification.** Consume exactly one OverGarden verification link in
   the native browser. Do not copy the token or URL into chat, commands,
   screenshots, logs, git, Linear, or receipts. Authoritative session read-back
   must show a verified ordinary user and one credential method.
5. **Explicit link.** In `/garden/profile`, require a visible localized Link
   Google control. Initiate once and authenticate in native Google UI with a
   Google account not already connected to any OverGarden account. No provider
   credential is entered into chat or a shell command.
6. **Authoritative read-back.** Ignore redirect query success. Reload Profile
   and accept success only when the current disposable session reports exactly
   one credential and one Google method while its local email, name, role,
   public identity, and garden/content counts remain unchanged.
7. **Fresh-session unlink.** End the first OverGarden session, sign in again by
   credential, and unlink Google once. Read back exactly one credential method,
   zero Google methods, and a still-usable credential session.
8. **Provider revocation.** In native Google account permissions, revoke the
   OverGarden grant once and read back its absence. No provider page contents or
   identity are recorded.
9. **Erasure cleanup.** Submit one erasure request from the disposable account,
   end its session, and execute exactly that request through the existing
   sealed-owner erasure workflow under this approved one-fixture scope. Require
   the disposable user, accounts, sessions, public identity, handles, and any
   other dry-run-owned rows absent. Re-run the five-count inventory: it must
   equal the approved baseline. The sealed owner must still have exactly one
   verified credential and its four avatar-menu operator links.

Success leaves `GOOGLE_ACCOUNT_LINKING_ENABLED=true` and both indexes present.
Any failed or uncertain step first returns the flag to absent/false, preserves
both indexes and ordinary Google sign-in, cleans the one approved fixture, and
requires a new plan before another callback.

## Prepared operator commands

Run from `apps/web`. The Production environment file and approval JSON are
ephemeral local secret artifacts with mode `0600`; neither is committed or
printed. Never paste a provider credential, token, cookie, verification URL, or
identity into a command.

```bash
pnpm exec vitest run scripts/check-google-linking-production-proof-plan.test.ts
pnpm exec vitest run src/lib/admin/owner-account-contract.test.ts src/server/admin-access.test.ts src/lib/auth/explicit-google-linking.test.ts src/server/auth/account-methods.test.ts

pnpm google-linking:production-proof \
  --env-file "$OVE298_PRODUCTION_ENV_FILE" \
  --mode inventory \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE298_IMPLEMENTATION_SHA"

pnpm google-linking:production-proof \
  --env-file "$OVE298_PRODUCTION_ENV_FILE" \
  --mode apply-indexes \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE298_IMPLEMENTATION_SHA" \
  --plan-file ../../docs/runbooks/OVE_298_PRODUCTION_GOOGLE_LINK_PROOF_PLAN.md \
  --approval-file "$OVE298_APPROVAL_FILE"

pnpm google-linking:production-proof \
  --env-file "$OVE298_PRODUCTION_ENV_FILE" \
  --mode verify-indexes \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE298_IMPLEMENTATION_SHA"

pnpm google-linking:production-proof \
  --mode verify-receipt \
  --receipt-file "$OVE298_TERMINAL_RECEIPT_FILE"
```

## Approval receipt shape

Approval is valid only for the exact plan SHA-256, feature SHA, Production
environment, migration digest, five counts, target digest, disposable identity
class, terminal enabled configuration, and every effect bound above. The local
approval file contains exactly these fields:

```json
{
  "status": "approved",
  "planDigest": "<exact-plan-sha256>",
  "implementationSha": "<exact-feature-sha>",
  "environment": "production",
  "migrationDigest": "6392a41f971176eb9de748f54fc15beb76a6a77f8a755694d327fe8eae40f6bd",
  "counts": {
    "googleAccountRowCount": 1,
    "duplicateGoogleSubjectGroupCount": 0,
    "duplicateGoogleUserGroupCount": 0,
    "missingGoogleSubjectCount": 0,
    "invalidGoogleProviderRowCount": 0
  },
  "targetDigest": "84503a97fba4e9febf14db87091ce05d2866796d78109f812a649c23f9c36462",
  "disposableIdentityClass": "ordinary_credential_non_owner_non_admin",
  "terminalSuccessConfiguration": "enabled"
}
```

## Stop, rollback, and cleanup

Stop before the first mutation on missing approval, plan-byte drift, feature or
main SHA drift, target drift, migration drift, nonzero safety count, index
drift, provider/configuration drift, absent disposable inbox, sealed-owner or
admin eligibility, or inability to use an unconnected Google account.

After any partial external effect, read authoritative state before
compensation. Never drop either index. Never implicitly merge, select a winner,
delete an existing account, change an existing credential, or reuse the
disposable identity. Rollback disables only the explicit-link flag, preserves
credential login and ordinary Google sign-in, and completes only the one
approval-bound fixture erasure.

Terminal evidence is one recursively redacted receipt containing the exact
field set validated by `verify-receipt`. It reports only counts, closed outcome
classes, SHAs, and digests. `Done` additionally requires feature containment in
current `origin/main`, canonical `READY`/`PROMOTED` deployment at that current
main SHA, passing mainline closeout, and authenticated Linear body/relations
read-back.
