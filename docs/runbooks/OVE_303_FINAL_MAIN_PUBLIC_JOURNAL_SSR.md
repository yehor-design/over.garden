# OVE-303 final-main public journal SSR proof

This runbook operates one disposable, non-personal production journal canary
after the implementation commit is contained in current `origin/main` and the
canonical Vercel Production deployment is `READY` at that exact SHA. It proves
the existing public-journal boundary; it does not create a second product
implementation or change indexing policy.

Canonical behavior remains owned by:

- `apps/web/src/server/journal-repository.ts`
- `apps/web/src/server/public-surface-indexing-policy.ts`
- `apps/web/src/server/search/public-journal-eligibility.ts`
- `apps/web/src/server/search/public-projection-outbox.ts`
- `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`

The harness creates one official Better Auth synthetic owner, calls the
deployed journal mutation route, publishes through the scoped journal
repository, converges the durable public projection, reads the initial HTTP
HTML, archives the entry, converges removal, and erases only the exact
task-owned rows. It prints only the closed OVE-303 receipt. Credentials,
cookies, owner identity, content, public slug, raw HTML, precise location,
request metadata, provider payloads, and database values are never printed or
retained in the receipt.

The canonical unprefixed journal path may return one same-origin `307` to the
exact `/bg` or `/ru` locale-prefixed form for the same slug. The harness follows
only that one-hop locale redirect, with no query or fragment, and requires the
terminal response on `https://over.garden`; any other redirect or a second hop
fails closed. Active proof requires terminal HTTP 200, while cleanup requires
terminal 410 or 404.

## Immutable authorization

Approved normalized operation:

```text
OVE-303|production|create one owner-scoped disposable journal canary with hidden location, publish it, read its public server-rendered response, then archive and erase the exact canary|baseline:c45ddb639bc1fdff15ca124eda736f2cd9af7ce7|one-canary|cleanup-required
```

Approved SHA-256:

```text
01ac266c46154a8dac4b56acd7b9855374e2aff1efd59aa18ad38c4cf81e3a1b
```

This approval permits one apply only. Environment, implementation SHA,
deployment SHA, plan digest, production database target, task-canary count, or
provider drift invalidates it before mutation. If an apply is uncertain or
fails, never run a second apply under this authorization.

## Preconditions

1. Fetch `origin/main` and record the contained OVE-303 implementation SHA.
2. Prove that SHA is an ancestor of `origin/main`.
3. Read the official Vercel deployment twice and require `READY`, Production,
   ref `main`, the canonical `over.garden` and `www.over.garden` aliases, and
   the same SHA.
4. Read `/api/document-mutation-admission/readback` twice and require the same
   exact deployment SHA with enforcement enabled.
5. Use `vercel env run -e production`; never copy production secrets to a
   receipt, log, Linear, or chat.
6. Run from `apps/web`. Apply and cleanup require the `react-server` condition,
   which the package script supplies.

## Read-only plan

The plan performs no canary or provider mutation. It must return
`resultClass=zero_effect_plan`, `canaryCountBefore=0`, `applyCount=0`,
`state=code_deployed`, and the approved digest.

```bash
cd apps/web
vercel env run -e production -- pnpm run ove303:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE303_IMPLEMENTATION_SHA" \
  --plan
```

Stop if the receipt is not an exact zero-effect plan. Resolve residue only with
the task-scoped cleanup command, then obtain a fresh read-only plan. Do not
broaden selectors or inspect a real gardener record.

## One approved apply

Run this command exactly once after the plan and exact deployment read-backs
agree. The database advisory lock admits one contender; a concurrent loser is
bounded and performs no effect.

```bash
cd apps/web
vercel env run -e production -- pnpm run ove303:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE303_IMPLEMENTATION_SHA" \
  --apply \
  --approval-digest 01ac266c46154a8dac4b56acd7b9855374e2aff1efd59aa18ad38c4cf81e3a1b
```

Terminal pass requires all of the following in the same bounded run:

- one official-session owner-scoped synthetic journal with hidden location;
- canonical publication with `public_noindex=true`;
- HTTP 200 initial HTML containing the server-rendered journal marker;
- `noindex, nofollow` metadata in that initial HTML;
- no task email, private storage marker, precise coordinate text, or private
  field marker in the HTML or public-search document;
- exact canonical public eligibility and an exact safe Meilisearch projection;
- archive makes the public route authoritatively 410 or 404;
- public projection becomes exact absence before row erasure;
- no another-owner effect;
- cleanup twice with zero database, route, and search residue;
- `resultClass=verified_public_journal_ssr`,
  `cleanupClass=authoritative_absent_twice`, and `state=cleaned`.

## Wait-safe controls

The status command is read-only and remains independent of the apply lock:

```bash
vercel env run -e production -- pnpm run ove303:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE303_IMPLEMENTATION_SHA" --status
```

The cancel command writes only a local task-scoped cancellation fence. It does
not delete a provider object or inspect another owner:

```bash
vercel env run -e production -- pnpm run ove303:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE303_IMPLEMENTATION_SHA" --cancel
```

## Recovery and cleanup

Timeout, provider uncertainty, partial publication, unsafe evidence, or cleanup
uncertainty is terminal failure. Recovery may archive and erase only the
deterministic OVE-303 synthetic owner and its one journal. It must run cleanup
twice and prove absence twice:

```bash
vercel env run -e production -- pnpm run ove303:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE303_IMPLEMENTATION_SHA" --cleanup
```

After any uncertain or partial apply, never run a second apply. Save the failed
redacted receipt, run cleanup, obtain a fresh zero-effect plan, and require a
new exact authorization before any new canary effect. A clean replay of an
already completed tuple returns `already_cleaned` without another effect.

## Closeout receipt

The only allowed terminal fields are:

```text
version, environment, implementationSha, planDigest, authorizationDigest,
canaryCountBefore, applyCount, resultClass, cleanupClass, durationMs, state,
evidenceDigest
```

Before Linear `Done`, run focused tests, lint, typecheck, the full test suite,
build, `git diff --check`, exact-head CI, main containment, and
`pnpm mainline:closeout:check`. Save the exact receipt and its digest, compare
the saved Linear description SHA-256, and read status, relations, and the
terminal comment back twice.
