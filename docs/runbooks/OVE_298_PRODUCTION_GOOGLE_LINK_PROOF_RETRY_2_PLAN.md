# OVE-298 Production Google Link Proof Second Retry Plan

Status: awaiting exact maintainer approval. This is a new immutable plan after
the first retry failed closed because its native Google handoff outlived Better
Auth's one-time OAuth state. No second-retry OverGarden effect is authorized
until the SHA-256 digest of this file and the exact implementation SHA are
approved together.

## Protected outcome

An ordinary verified email/password gardener can explicitly add Google as a
second sign-in method without an implicit merge, local identity change, or
last-method loss. The OVE-314 sealed owner remains credential-only: it receives
no Link Google control and direct link admission fails before OAuth state is
created.

This retry creates no database index. It verifies the two exact indexes already
preserved by both rollbacks, enables one existing server flag, and executes one
new, fully bounded disposable account lifecycle. It never selects or records an
existing email, user ID, Google subject, token, cookie, OAuth state, callback
query, provider credential, IP, user-agent, private payload, media key, or
precise location.

## Approval-bound second-retry plan

The literal `$OVE298_IMPLEMENTATION_SHA` token avoids an impossible Git
self-reference. The approval envelope supplies the exact 40-character
second-retry implementation SHA while the SHA-256 plan digest covers every byte
of this tracked file. Any file, SHA, count, index, target, configuration,
provider, fixture, deadline, effect-bound, rollback, or cleanup drift invalidates
approval before the next effect.

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

## First-retry failure and rollback receipt

- The approved first-retry plan digest was
  `546f556776f013fbabc368c4ba5adf5d35424d70b5a4be3e05ddc385609841a0`
  at implementation `b098ff02a0cef9cc1b314b6bec81ea135f6fda02`.
- It consumed one link initiation and one callback. The callback reached
  `/api/auth/callback/google` at `2026-08-12T09:46:38Z`, returned `302`, and
  Better Auth logged the closed class `Failed to parse state`. The library's
  database-backed flow signs a browser state cookie for 300 seconds and retains
  the matching verification row for 600 seconds; the interactive handoff
  completed outside both windows. No retry occurred.
- Authoritative read-back remained exactly one credential method and zero Google
  methods for the disposable user. Its local identity digest was unchanged, and
  no Google account row was created.
- Native Google connected-app search found no OverGarden grant. Production
  `GOOGLE_ACCOUNT_LINKING_ENABLED` was removed, exact `main` was redeployed, and
  both indexes remained exact.
- The failed-attempt disposable submitted one canonical erasure request. During
  cleanup, production exposed that `/erasure` had been excluded from both the
  private garden shell and the signed mutation-generation boundary. PR `#137`
  restored only the mutation boundary while keeping private navigation and the
  local session-convergence gate absent. Its full CI passed and exact `main`
  `17dcf25970126f442bec7e8a2374444c201507ac` reached `READY` as deployment
  `dpl_ALcBt5Hjyu8ZcdwfwUUE6n4drp1p` on both canonical aliases.
- Production then accepted exactly one request. The sealed-owner execution
  contract proved a credential-only fixture, completed erasure, anonymized its
  request, and read the original user/accounts/sessions/profile/handle footprint
  back as absent. The agent-owned inbox and all prior secret, environment,
  approval, and private-state files were deleted.
- Post-cleanup inventory is `googleAccountRowCount=1`, with all four safety
  counts zero. Both indexes retain the approved definition digests above, and
  the linking flag is absent.

## Provider pre-authentication boundary

After rollback and before this plan, the maintainer explicitly instructed the
operator to open a separate native Google account chooser and authenticated a
different Google account outside chat. The opaque browser profile was moved to
a new permission-restricted proof boundary after the prior OverGarden fixture
was erased. No cookie, credential, token, account identifier, provider page
payload, or profile file was inspected or copied individually.

Before the second retry creates any OAuth state, the operator must reopen that
same profile, require native Google Account UI without a credential prompt, and
confirm only the closed class `provider_session_ready`. The browser must show no
active private OverGarden session from the erased fixture. Failure closes the
plan without enabling the flag or creating an account.

## Exact second-retry sequence

No step retries automatically.

1. **Read-only provider preflight.** Reopen the promoted opaque browser profile.
   Require native Google Account UI and no credential prompt. Search connected
   apps for OverGarden and require zero matches. Do not inspect cookies, local
   storage, profile files, account identifiers, or provider page contents.
2. **Read-only index gate.** Pull the current Production environment into a new
   permission-restricted artifact. Run the approval-bound operator. It repeats
   all five counts and the target digest in a transaction and accepts only
   `both_exact` with the two approved index-definition digests. It must report
   `already_exact`; executing migration SQL or creating an index is a refusal
   because `indexCreates=0`.
3. **Vercel flag.** Add exactly `GOOGLE_ACCOUNT_LINKING_ENABLED=true` to the
   Vercel Production environment. Do not add, delete, or edit another variable.
   Redeploy the current containing `origin/main` SHA, require `READY`, both
   canonical aliases, and exact runtime-SHA read-back.
4. **Fresh disposable boundary.** Create one new agent-owned inbox and distinct
   OverGarden credential in a new `0600` artifact. The promoted browser profile
   may be reused only because provider pre-authentication is already complete;
   it must show OverGarden as signed out before signup. No prior disposable
   email, credential, user ID, or account is reused.
5. **Disposable signup.** Create exactly one new self-serve email/password
   account. It must have no admin role, must not be the sealed owner, and must
   create no garden, object, journal, media, community, lineage, moderation, or
   public content.
6. **Email verification.** Validate exactly one expected message from
   `auth@over.garden`, consume exactly one canonical HTTPS verification link in
   the dedicated native browser, and store neither token nor URL in evidence.
   Authoritative read-back must show a verified ordinary user with one
   credential method.
7. **Deadline-bound explicit link.** Reload `/garden/profile`, require one
   visible localized Link Google control, and re-confirm
   `provider_session_ready`. Start the monotonic callback deadline immediately
   before exactly one link initiation. Use the already authenticated native
   Google UI and complete account selection/consent immediately. The canonical
   callback must reach OverGarden within 120 seconds. At 120 seconds, missing or
   uncertain callback is terminal failure: do not start another OAuth flow.
8. **Authoritative read-back.** Ignore redirect query success. Accept success
   only when the disposable account has exactly one credential and one Google
   method while its local email, name, role, public identity, and garden/content
   counts are unchanged.
9. **Fresh-session unlink.** End the current OverGarden session, open a fresh
   isolated context from the same durable profile, sign in by credential, and
   unlink Google once. Read back exactly one credential method, zero Google
   methods, and a still-usable credential session.
10. **Provider revocation.** In native Google account permissions, revoke the
    OverGarden grant once and read back its absence. No provider page contents or
    identity become evidence.
11. **Erasure cleanup.** Submit one erasure request from the disposable account,
    require the production form to carry the signed mutation-generation field,
    end its session, and execute exactly that request through the sealed-owner
    erasure contract. Require the disposable user, accounts, sessions, public
    identity, handles, inbox, secret artifact, and dedicated browser directory
    absent. Re-run the five-count inventory; it must equal the approved
    baseline. The sealed owner must still have exactly one verified credential
    and its four avatar-menu operator links.

Success leaves `GOOGLE_ACCOUNT_LINKING_ENABLED=true` and both indexes present.
Any failed or uncertain step first returns the flag to absent/false, preserves
both indexes and ordinary Google sign-in, cleans only the one second-retry
fixture, and requires another new plan before any further callback.

## Prepared operator commands

Run from `apps/web`. Production environment, approval, terminal receipt, inbox,
and browser-profile artifacts are permission-restricted local material; none is
committed or printed.

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
  --plan-file ../../docs/runbooks/OVE_298_PRODUCTION_GOOGLE_LINK_PROOF_RETRY_2_PLAN.md \
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

Approval is valid only for the exact plan SHA-256, second-retry implementation
SHA, Production environment, migration digest, five counts, target digest,
`both_exact` index state, provider-preauthenticated deadline boundary,
disposable identity class, terminal enabled configuration, and every effect
bound above. The local approval file uses the existing closed receipt schema:

```json
{
  "status": "approved",
  "planDigest": "<exact-second-retry-plan-sha256>",
  "implementationSha": "<exact-second-retry-implementation-sha>",
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
`overgarden.google-linking-production-receipt.v1`. It contains only the plan
digest, implementation and deployment SHAs, migration/index/evidence digests,
the five aggregate counts, deadline/result classes, and closed outcome classes.
`Done` also requires implementation containment in current `origin/main`,
canonical `READY` exact-main deployment, passing mainline closeout, and
authenticated Linear body, relations, comments, and status read-back.
