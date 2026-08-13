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

## Immutable authorization history

The first authorization is consumed and must never be reused. Its normalized
operation was:

```text
OVE-303|production|create one owner-scoped disposable journal canary with hidden location, publish it, read its public server-rendered response, then archive and erase the exact canary|baseline:c45ddb639bc1fdff15ca124eda736f2cd9af7ce7|one-canary|cleanup-required
```

Its consumed SHA-256 was:

```text
01ac266c46154a8dac4b56acd7b9855374e2aff1efd59aa18ad38c4cf81e3a1b
```

That tuple performed exactly one apply at main SHA
`711b24581160800a343fee7281bd7b78cfb145ff`, returned failed evidence
`434803887b36da42de787a6a8c2c62e525a8df4dcae73127f1d5f8e4b6899206`,
and was followed by authoritative cleanup evidence
`f75f973317c6c5496d058508741a350412ccfea215a4498be7f33d163333b668`.
It cannot authorize another effect.

The separately authorized remediation amendment is:

```text
OVE-303-amendment-1|production|after the consumed first tuple failed only on authoritative Meili absence classification and cleanup proved task residue absent, create one replacement owner-scoped disposable journal canary with hidden location, publish it, verify SSR and exact safe search, then archive and erase the exact canary|baseline:711b24581160800a343fee7281bd7b78cfb145ff|one-replacement-canary|cleanup-required|prior-failure:434803887b36da42de787a6a8c2c62e525a8df4dcae73127f1d5f8e4b6899206|prior-cleanup:f75f973317c6c5496d058508741a350412ccfea215a4498be7f33d163333b668
```

Its SHA-256 is:

```text
52332cfec814815e44cf141aec546331a23423fed76e72a323a2b8c07fd28a02
```

This amendment permits one replacement apply only after its implementation is
contained in a newer exact-main deployment. Environment, implementation SHA,
deployment SHA, plan digest, production database target, task-canary count, or
provider drift invalidates it before mutation. If it is uncertain or fails,
never run another apply under this amendment.

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

## One amendment apply

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
  --approval-digest 52332cfec814815e44cf141aec546331a23423fed76e72a323a2b8c07fd28a02
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

The harness persists at most one synthetic entry UUID and its matching public
path in a mode-0600 task-local recovery file. It never stores owner identity,
content, credentials, or those values in the receipt. Cleanup rehydrates only
that exact identity, applies canonical archive/outbox convergence first, then
idempotently deletes the exact derived Meilisearch document and proves route,
search, and database absence twice. The recovery file is erased only after two
clean read-backs.

The official production SDK missing-document shape is accepted only when all
three fields agree: nested `cause.code=document_not_found`, nested
`cause.type=invalid_request`, and response status 404. Authentication, network,
5xx, and unknown errors remain uncertainty.

After any uncertain or partial apply, never run a second apply under the same
digest. Save the failed redacted receipt, run cleanup, obtain a fresh zero-effect
plan, and require a separately digested exact authorization before any new
canary effect. A clean replay of an already completed tuple returns
`already_cleaned` without another effect.

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
