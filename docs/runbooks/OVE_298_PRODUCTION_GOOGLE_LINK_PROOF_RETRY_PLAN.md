# OVE-298 Production Google Link Proof Retry Plan

Status: awaiting exact maintainer approval. This is a new immutable plan after
the first approved attempt failed closed between its one permitted OAuth
initiation and callback. No retry effect is authorized until the SHA-256 digest
of this file and the exact implementation SHA are approved together.

## Protected outcome

An ordinary verified email/password gardener can explicitly add Google as a
second sign-in method without an implicit merge, local identity change, or
last-method loss. The OVE-314 sealed owner remains credential-only: it receives
no Link Google control and direct link admission fails before OAuth state is
created.

This retry creates no database index. It verifies the two exact indexes already
preserved by rollback, enables one existing server flag, and executes one new,
fully bounded disposable account lifecycle. It never selects or records an
existing email, user ID, Google subject, token, cookie, OAuth state, callback
query, provider credential, IP, user-agent, private payload, media key, or
precise location.

## Approval-bound retry plan

The literal `$OVE298_IMPLEMENTATION_SHA` token avoids an impossible Git
self-reference. The approval envelope supplies the exact 40-character retry
implementation SHA while the SHA-256 plan digest covers every byte of this
tracked file. Any file, SHA, count, index, target, configuration, provider,
fixture, effect-bound, rollback, or cleanup drift invalidates approval before
the next effect.

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
  "preflightIndexState": "both_exact",
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
    "indexCreates": 0,
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

## First-attempt rollback receipt

- The first attempt consumed its single `linkInitiations=1` effect, then its
  isolated browser process ended before a callback. No callback, Google account
  row, or provider grant was accepted as proven.
- `GOOGLE_ACCOUNT_LINKING_ENABLED` was removed from Production and the current
  exact-main deployment was redeployed.
- The one disposable fixture was identified by closed server-side class,
  processed through the approved erasure contract, and read back as absent.
  Its erasure request is anonymized and `completed`.
- Post-cleanup inventory is
  `googleAccountRowCount=1`, with all four safety counts zero.
- Both indexes remain exact with the approved definition digests above.
- Canonical deployment `dpl_Aws4xUADKsWMSiQcQSNe22vK3HNA` is `READY`, owns
  both canonical aliases, and reports deployment SHA
  `657066b9e94972980e3a6109286c15e05c7c3de1`.
- No prior disposable identity value is reused by this retry.

## Exact retry sequence

No step retries automatically.

1. **Read-only index gate.** Re-pull the current Production environment into a
   permission-restricted ephemeral file. Run the approval-bound operator. It
   repeats all five counts and the target digest in a transaction and accepts
   only `both_exact` with the two approved index-definition digests. It must
   report `already_exact`; executing migration SQL or creating an index is a
   refusal because `indexCreates=0`.
2. **Vercel flag.** Add exactly `GOOGLE_ACCOUNT_LINKING_ENABLED=true` to the
   Vercel Production environment. Do not add, delete, or edit another variable.
   Redeploy the current containing `origin/main` SHA, require `READY`, both
   canonical aliases, and exact runtime-SHA read-back.
3. **Durable disposable secret boundary.** Before creating the account, create
   one stable, permission-restricted local secret artifact with mode `0600`
   outside volatile OS temporary directories. It holds only the agent-owned
   inbox credential and a distinct OverGarden credential. It is never printed,
   committed, uploaded, placed in Linear, or reused. A dedicated browser user
   data directory is created beside it and survives an interactive handoff.
4. **Disposable signup.** Create exactly one new self-serve email/password
   account using that agent-owned inbox. It must have no admin role, must not be
   the sealed owner, and must create no garden, object, journal, media,
   community, lineage, moderation, or public content.
5. **Email verification.** Validate exactly one expected message from
   `auth@over.garden`, consume exactly one canonical HTTPS verification link in
   the dedicated native browser, and store neither token nor URL in evidence.
   Authoritative read-back must show a verified ordinary user with one
   credential method.
6. **Explicit link.** In `/garden/profile`, require a visible localized Link
   Google control. Initiate once. The user authenticates in native Google UI
   with a Google account not already connected to any OverGarden account. The
   durable browser profile remains available across the credential handoff.
7. **Authoritative read-back.** Ignore redirect query success. If the browser
   process ended, reopen the same dedicated profile and sign in by the stored
   disposable credential. Reload Profile and accept success only when the
   disposable account has exactly one credential and one Google method while
   its local email, name, role, public identity, and garden/content counts are
   unchanged.
8. **Fresh-session unlink.** End the current OverGarden session, open a new
   isolated browser context from the same dedicated profile, sign in by
   credential, and unlink Google once. Read back exactly one credential method,
   zero Google methods, and a still-usable credential session.
9. **Provider revocation.** In native Google account permissions, revoke the
   OverGarden grant once and read back its absence. No provider page contents or
   identity become evidence.
10. **Erasure cleanup.** Submit one erasure request from the disposable account,
    end its session, and execute exactly that request through the sealed-owner
    erasure contract. Require the disposable user, accounts, sessions, public
    identity, handles, stable secret artifact, and dedicated browser directory
    absent. Re-run the five-count inventory; it must equal the approved
    baseline. The sealed owner must still have exactly one verified credential
    and its four avatar-menu operator links.

Success leaves `GOOGLE_ACCOUNT_LINKING_ENABLED=true` and both indexes present.
Any failed or uncertain step first returns the flag to absent/false, preserves
both indexes and ordinary Google sign-in, cleans only the one retry fixture,
and requires another new plan before any further callback.

## Prepared operator commands

Run from `apps/web`. Production environment, approval, terminal receipt, inbox,
and browser-profile artifacts are ephemeral local material; none is committed
or printed.

```bash
pnpm exec vitest run scripts/check-google-linking-production-proof-plan.test.ts

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
  --plan-file ../../docs/runbooks/OVE_298_PRODUCTION_GOOGLE_LINK_PROOF_RETRY_PLAN.md \
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

Approval is valid only for the exact plan SHA-256, retry implementation SHA,
Production environment, migration digest, five counts, target digest,
`both_exact` index state, disposable identity class, terminal enabled
configuration, and every effect bound above. The local approval file uses the
existing closed receipt schema:

```json
{
  "status": "approved",
  "planDigest": "<exact-retry-plan-sha256>",
  "implementationSha": "<exact-retry-implementation-sha>",
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

## Terminal evidence

The terminal receipt remains
`overgarden.google-linking-production-receipt.v1`. It contains only the retry
plan digest, implementation and deployment SHAs, migration/index/evidence
digests, the five aggregate counts, and closed outcome classes. `Done` also
requires retry implementation containment in current `origin/main`, canonical
`READY` exact-main deployment, passing mainline closeout, and authenticated
Linear body, relations, comments, and status read-back.
