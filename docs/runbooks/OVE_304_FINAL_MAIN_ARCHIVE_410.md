# OVE-304 final-main archive 410 proof

This runbook operates one disposable, non-personal production journal canary
after the implementation commit is contained in current `origin/main` and the
canonical Vercel Production deployment is `READY` at that exact SHA. It proves
the existing archive lifecycle and public-projection revocation boundary; it
does not change product behavior, indexing policy, or provider configuration.

Canonical behavior remains owned by:

- `apps/web/src/server/journal-repository.ts`
- `apps/web/src/server/search/public-projection-outbox.ts`
- `apps/web/src/lib/public-journal-entry-lifecycle.ts`
- `apps/web/src/proxy.ts`
- `docs/PUBLIC_PROJECTION_REVOCATION.md`

The harness creates one official Better Auth synthetic owner, calls the
deployed journal mutation route, publishes through the scoped repository,
proves the exact safe projection exists, archives once, proves the old route is
a generic content-free 410 and the exact search document is authoritatively
absent, then erases only task-owned state. Receipts never contain credentials,
cookies, owner identity, entry content, slug, raw HTML, precise location,
request metadata, provider payloads, or object keys.

The canonical unprefixed path may return one same-origin `307` to the exact
`/bg` or `/ru` path for the same slug. The harness follows only that one-hop
locale redirect, without query or fragment, and requires the terminal response
on `https://over.garden`. Any other redirect or a second hop fails closed.
This is the only approved one-hop locale redirect.

## Immutable authorization

Approved normalized operation:

```text
OVE-304|production|create and publish one owner-scoped disposable journal canary, archive it once, verify the old public route and search projection are gone, then erase the exact canary|baseline:c45ddb639bc1fdff15ca124eda736f2cd9af7ce7|one-canary|cleanup-required
```

Approved SHA-256:

```text
249d9b0d605e57a4c6bfb353f2121e6bc08c7ae8810e25e35a3e07b3130c87ff
```

This authorization permits exactly one apply. Environment, implementation SHA,
deployment SHA, plan digest, database target, task-canary count, recovered
identity, or provider drift invalidates it before mutation. If the apply is
uncertain or fails, never run a second apply under this digest; cleanup only.

## Preconditions

1. Fetch `origin/main` and prove the feature SHA is contained.
2. Read the Vercel deployment twice and require `READY`, Production, ref
   `main`, exact SHA, and canonical apex plus www aliases.
3. Read `/api/document-mutation-admission/readback` twice and require the
   exact SHA with enforcement enabled.
4. Run `pnpm mainline:closeout:check` from the clean exact-main checkout.
5. Use `vercel env run -e production`; never copy production secrets into
   evidence.
6. Run commands from `apps/web`. The package script supplies the required
   `react-server` condition.

## Read-only plan

```bash
cd apps/web
vercel env run -e production -- pnpm run ove304:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE304_IMPLEMENTATION_SHA" \
  --plan
```

Require `resultClass=zero_effect_plan`, `canaryCountBefore=0`,
`applyCount=0`, `state=code_deployed`, and the approved digest. If any field
differs, stop. Resolve only task-owned residue with cleanup and do not broaden a
selector or inspect a real gardener.

## One approved apply

Run exactly once after all read-backs and the zero-effect plan agree:

```bash
cd apps/web
vercel env run -e production -- pnpm run ove304:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE304_IMPLEMENTATION_SHA" \
  --apply \
  --approval-digest 249d9b0d605e57a4c6bfb353f2121e6bc08c7ae8810e25e35a3e07b3130c87ff
```

Terminal pass requires:

- one official-session owner-scoped synthetic journal with hidden location;
- initial canonical publication and exact safe search projection;
- one canonical archive transition to private/archived with a preserved gone
  slug, `public_noindex=true`, and non-null `public_gone_at`;
- terminal HTTP 410 through at most one approved locale redirect;
- `noindex, nofollow` in the generic application-owned tombstone;
- no synthetic title, body, owner marker, private marker, or coordinate-shaped
  text in that tombstone;
- canonical public eligibility revoked;
- durable outbox convergence to exact absence plus a strict direct
  Meilisearch missing-document read-back;
- zero another-owner effects;
- cleanup twice with zero database, route, search, or recovery-file residue;
- `resultClass=verified_archive_410`,
  `cleanupClass=authoritative_absent_twice`, and `state=cleaned`.

## Wait-safe controls

Read-only status remains independent of the apply lock:

```bash
vercel env run -e production -- pnpm run ove304:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE304_IMPLEMENTATION_SHA" --status
```

Cancel writes only the local task-scoped cancellation fence:

```bash
vercel env run -e production -- pnpm run ove304:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE304_IMPLEMENTATION_SHA" --cancel
```

## Recovery and cleanup

Timeout, partial success, provider uncertainty, unsafe tombstone evidence, or
cleanup uncertainty is terminal failure. Cleanup may archive and erase only the
deterministic OVE-304 synthetic owner and its one journal:

```bash
vercel env run -e production -- pnpm run ove304:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE304_IMPLEMENTATION_SHA" --cleanup
```

The harness stores at most one synthetic entry UUID and its matching public
path in a mode-0600 task-local recovery file. It stores no owner identity,
content, or credential. Cleanup rehydrates only that exact identity, applies
canonical archive/outbox convergence, idempotently deletes only the exact
derived Meilisearch document when necessary, then proves database, route, and
search absence twice. The recovery file is removed only after two clean
read-backs.

The official production missing-document shape is authoritative only when
nested `cause.code=document_not_found`, nested
`cause.type=invalid_request`, and response status 404 all agree. Top-level
official compatibility and an explicit SDK error message remain supported;
authentication, network, 5xx, and unknown errors remain uncertainty.

After any uncertain or partial apply, never run a second apply under this
digest. Save the redacted receipt, run cleanup, and require a separately
approved normalized operation plus digest before any later canary. A clean
replay returns `already_cleaned` with no effect.

## Closeout

Allowed terminal fields are exactly:

```text
version, environment, implementationSha, planDigest, authorizationDigest,
canaryCountBefore, applyCount, resultClass, cleanupClass, durationMs, state,
evidenceDigest
```

Before Linear `Done`, run focused and adjacent tests, lint, typecheck, full
test, build, `git diff --check`, exact-head CI, main containment,
`pnpm mainline:closeout:check`, exact-main deployment/runtime read-backs, one
approved apply, explicit cleanup/status/read-only-plan receipts, and two
matching authenticated Linear read-backs.
