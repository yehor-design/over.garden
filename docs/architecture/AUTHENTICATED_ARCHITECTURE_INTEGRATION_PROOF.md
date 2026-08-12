# Authenticated architecture integration proof (OVE-292)

Status: active release proof contract

OVE-292 composes the authenticated-continuity children without becoming a new
authentication, mutation, offline-vault, provider, or sign-out authority. The
proof is intentionally asymmetric:

- immutable child receipts prove the effects their tasks already owned;
- an ephemeral Playwright context simulates races and failure modes that must
  never be injected into production;
- canonical production contributes only exact-runtime and read-only native UI
  observations;
- Vercel, GitHub, and Linear remain the authorities for READY deployment,
  current-main ancestry, saved description bytes, issue state, and relations.

The harness never signs in, creates an account, links or unlinks a provider,
submits a product mutation, queries production Postgres, touches R2 or
Meilisearch, writes analytics, or consumes a user's private session. The
`read_only_native_session` mode name describes the native application session
surface under inspection; the harness itself creates no authenticated session.
Claims about identity preservation, another-user isolation, mutation effects,
and sign-out behavior remain `child-inherited` or `browser-simulated`, never
mislabelled as directly production-observed.

## Permanent contract

The contract lives in:

- `apps/web/scripts/smoke-authenticated-architecture-contract.ts`
- `apps/web/scripts/smoke-authenticated-architecture.test.ts`
- `apps/web/scripts/smoke-authenticated-architecture.ts`
- `apps/web/package.json` command `smoke:authenticated-architecture`

Receipt schema: `overgarden.authenticated-architecture-receipt.v2`.

The manifest contains exactly twelve scenarios:

1. `facebook_login_retired_google_link_preserved`
2. `google_link_explicit_existing_credential_account`
3. `ordinary_recheck_remains_non_fencing`
4. `confirmed_invalidation_fences_synchronously`
5. `owner_inspection_unavailable_retains`
6. `vault_migration_target_readback_exact`
7. `matching_owner_foreground_sync_only`
8. `mutation_registry_receipt_continuity`
9. `stale_document_mutation_rejected_with_zero_effect`
10. `immediate_exit_before_first_await`
11. `account_a_exit_zero_effect_on_account_b`
12. `bfcache_persistent_marker_blocks_prior_content`

The source manifest digest at implementation time is
`0077a025a9facbaee60e4f78f21c77cb49ffeee9c2db30dfff9e6c088c896bc0`.
The authenticated relation projection digest is
`032e548766096d1be93d8b6c3f01dac163c68f94efe818468b405b065a8fbd61`.
Changing a scenario, assertion, provenance requirement, prerequisite receipt
version, strict-chain edge, or leaf edge changes the digest and invalidates the
prior receipt.

## Provenance classes

Every claim has exactly one class:

- `production-observed`: canonical `/garden` exposes the ordinary Google
  sign-in control, exposes no Facebook authentication control, and the
  read-only runtime endpoint reports the expected deployment SHA and enabled
  mutation admission. This class does not claim that a link or sign-out ran.
- `child-inherited`: the complete saved Linear description digest anchors the
  terminal child receipt for the exact behavior the child owned.
- `browser-simulated`: the ephemeral browser exercises timeout, synchronous
  fencing, owner isolation, foreground revision admission, intercepted stale
  writes, late epochs, immediate local exit, and persistent-marker behavior.

One claim ID cannot cross provenance classes. Missing, duplicated, renamed, or
overclaimed evidence fails before a receipt is emitted.

## Authenticated Linear evidence input

The runner accepts one temporary, recursively redacted JSON file with schema
`overgarden.authenticated-architecture-evidence-input.v1`. It contains only:

- SHA-256 of the complete descriptions of OVE-285 through OVE-298;
- child states (`Done` for all thirteen prerequisites and `In Progress` for
  OVE-292 while its receipt is being constructed);
- the direct `blocks` and `blockedBy` identifiers for those fourteen issues.

The file contains no description body, comment body, title, person, email,
credential, token, cookie, session or owner identifier, provider subject,
callback data, content, media key, URL capability, request metadata, precise
location, or screenshot. Generate it only from two authenticated Linear
read-backs, set mode `0600`, and delete it after the receipt digest is captured.

The exact current graph is fail-closed. In particular:

- OVE-292 is blocked by exactly OVE-295, OVE-297, and OVE-298, and blocks only
  OVE-284;
- OVE-297 is the OVE-296 leaf into OVE-292;
- OVE-298 is the OVE-295 leaf into OVE-292;
- OVE-294 also retains its already-satisfied OVE-314 blocker relation;
- every other strict edge matches the saved Linear contract.

## Local headed proof

Start the exact integration checkout on loopback, then run:

```bash
cd apps/web
pnpm smoke:authenticated-architecture -- \
  --environment local \
  --confirm-environment local \
  --base-url http://127.0.0.1:3000 \
  --expected-sha "$OVE292_IMPLEMENTATION_SHA" \
  --mode full \
  --synthetic-write-policy intercept_before_server \
  --evidence-file "$OVE292_EVIDENCE_FILE" \
  --headed true
```

The browser uses one ephemeral context, blocks service workers, permits only
GET/HEAD/OPTIONS network requests, and closes the context and browser before
returning a receipt. Each scenario has a 20-second deadline and monotonically
increasing epoch. A late actor-A completion after actor B starts is discarded.
The confirmed private-tree removal budget is at most 100 ms. Public navigation
and locale switching remain responsive during the simulated session-recheck
timeout. No synthetic write may reach the server.

## Production-safe proof

First prove through authenticated Vercel and GitHub read-back that the canonical
READY deployment SHA equals current `origin/main` and contains
`OVE292_IMPLEMENTATION_SHA`. Then run the same checked-out implementation:

```bash
cd apps/web
pnpm smoke:authenticated-architecture -- \
  --environment production \
  --confirm-environment production \
  --base-url https://over.garden \
  --expected-sha "$OVE292_PRODUCTION_SHA" \
  --mode read_only_native_session \
  --synthetic-write-policy intercept_before_server \
  --evidence-file "$OVE292_EVIDENCE_FILE" \
  --headed true
```

Production-observed network scope is exactly normal GET navigation to
`/garden` and GET read-back from
`/api/document-mutation-admission/readback`. The runner does not click the
Google control, authenticate, sign out, open account-method mutation UI, or send
a POST. The runtime endpoint must report the exact expected SHA and enabled
admission. Google sign-in must be visible and the Facebook authentication
surface count must be zero.

The production receipt must contain:

- `scenarioCount: 12` and every scenario exactly once;
- fourteen description digests;
- all three truthful provenance classes;
- the exact manifest, relation, integration, and run digests;
- `deploymentClass: production_runtime_exact_sha`;
- `cleanupClass: ephemeral_browser_closed_no_session_created`;
- zero synthetic writes, product/provider mutations, session effects, and
  analytics events;
- the bounded performance and wait-safe classes.

The harness runtime class is additive to, not a replacement for, Vercel READY
and current-main containment evidence.

## Cleanup and retention

Closeout deletes the ephemeral Linear evidence file and any local receipt file
after computing their digests. Playwright closes its context and browser before
success. The runner creates no persistent browser profile and no authenticated
session, so the terminal production session cleanup class is `not created`.
Only the schema version, issue IDs, counts, closed enums, SHAs, and SHA-256
digests may be retained in Linear.

## Failure and rollback

Fail `inconclusive` and keep OVE-292 open on any nonterminal prerequisite,
relation drift, description-digest drift, scenario/claim drift, provenance
conflict, exact-SHA mismatch, missing Google sign-in control, reachable Facebook
auth control, slow synchronous fence, wedged wait-safe control, late-epoch
acceptance, transmitted write, unauthorized effect, cleanup failure, or
forbidden evidence. Product behavior failures reopen their owning child; the
OVE-292 harness must not patch child-owned product behavior. A defective
harness rolls back by reverting only its scripts, package command, and this
runbook.
