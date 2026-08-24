# OVE-350 — Legacy quarantine provider retirement

Status: complete. The exact empty legacy provider was deleted on 2026-08-24,
the application credential is public-only, preserved canaries passed, and
rollback was not required. Do not rerun the apply procedure or recreate the
retired resource.

## Terminal receipt

- Plan digest:
  `41d026cf8539d2f201ef3594c7bdf8d0dc1728a0fe5a2e05ac72aa5c8853074d`
- Zero reads: `2026-08-24T15:08:31.999Z` and
  `2026-08-24T15:10:08.972Z`, both `0 objects / 0 bytes / 0 multipart`
- Provider delete completed: `2026-08-24T15:14:46.919Z`
- Apply receipt digest:
  `2206992541f1ab4283fdb18862e862f484780c0d7a6414b50748d99f439b7436`
- Independent terminal read-back digest:
  `9f57e25c4777e3221bebff19f86bc65cf44e29444fb9f867fc61b2512b7df4cf`
- Result: target absent twice, app credential `public_only`, public/staging
  buckets and domains healthy, exact-main deployment/env/DB/job checks green

The remaining command blocks document the fail-closed procedure that produced
this receipt. They are historical operational evidence, not an instruction to
recreate or delete the resource again. Only `--final-readback` may be replayed
for a later containing exact-main SHA.

## Exact scope

OVE-350 removes only the empty Cloudflare R2 bucket
`overgarden-quarantine`, its bucket-owned CORS/lifecycle configuration, and the
bucket scope on the existing application R2 credential. It preserves
`overgarden-public`, `overgarden-media-staging`, `media.over.garden`,
`media-stage.over.garden`, every public object, and every staging capability.

OVE-349 already removed the application routes, environment variable, schema,
jobs, packages, and test rows that formerly owned this provider surface. No
legacy runtime or environment variable may be restored by this runbook.

## Founder waiver and replacement safety gate

At `2026-08-24T13:45:54.000Z` the founder explicitly waived the earlier
seven-day observation and additional 24-hour read delay and directed immediate
execution. The replacement gate is all of the following:

1. Two complete authenticated reads at least 60 seconds apart return zero
   objects, zero bytes, and zero multipart uploads.
2. Both reads prove zero retired routes in the bounded available production-log
   window, zero 5xx for those routes, zero legacy jobs/claims, zero runtime
   owners, and absence of the retired Vercel environment names.
3. Both reads agree on the exact account, bucket, private-access state, CORS,
   lifecycle, production database, exact READY deployment, and preserved
   resources.
4. The verifier emits one immutable SHA-256 plan. A maintainer approval receipt
   binds the exact production account, bucket, plan digest, and timestamp.
5. Immediately before deletion, the current application credential is narrowed
   in place from `overgarden-public + overgarden-quarantine` to
   `overgarden-public` only. Read-back must prove public access still succeeds
   while quarantine and staging access are denied.
6. Cloudflare must still report the exact bucket empty. Cloudflare's bucket
   deletion is allowed to fail closed if any object or multipart upload exists.
7. Two absence reads and all preserved-resource canaries must pass after the
   effect.

Vercel Hobby runtime logs are retained for at most one hour, so OVE-350 records
the complete bounded available log window instead of claiming unavailable
seven-day log evidence. The repeated R2 reads, removal of every code/env/job
writer, credential narrowing, and empty-only delete are the writer-race gate.

## Historical read-only plan

Run from `apps/web` with the authenticated Vercel, Cloudflare, and production
database sessions already configured. The verifier pulls exact Vercel
Production values to a mode-0600 file in a private temporary directory, never
prints them, and deletes the file in `finally`.

```bash
pnpm exec tsx scripts/verify-legacy-quarantine-provider-retirement.ts \
  --read-only-plan \
  --environment production \
  --confirm-environment production > /tmp/ove350-read-1.json

# Run only after at least 60 seconds have elapsed.
pnpm exec tsx scripts/verify-legacy-quarantine-provider-retirement.ts \
  --read-only-plan \
  --environment production \
  --confirm-environment production \
  --previous-read-receipt /tmp/ove350-read-1.json \
  > /tmp/ove350-read-2-plan.json
```

The output is redacted and contains aggregate classes/digests only. It must be
classified `eligible_zero`. The second output contains
`ove350.providerRetirementPlan.v1`; copy only that plan to the task-owned plan
file and record its digest in Linear. Never copy production environment files,
credential identifiers, token values, object keys, request rows, or private
database rows into evidence.

## Completed provider action

The current Cloudflare token is shared between the public and retired legacy
buckets. Do not revoke it and do not create an unnecessary replacement. In the
authenticated Cloudflare R2 API-token UI, edit the existing application token
in place, preserve Object Read & Write for `overgarden-public`, and remove only
`overgarden-quarantine`. Do not add `overgarden-media-staging` or All buckets.

After IAM convergence, use the exact Vercel Production credential in a redacted
scope probe. The required result is `public_only`: public allowed, quarantine
denied, staging denied. Any other class stops the delete.

The approved apply command requires the exact immutable plan, exact approval
receipt, exact digest, and literal production confirmation:

```bash
pnpm exec tsx scripts/verify-legacy-quarantine-provider-retirement.ts \
  --apply \
  --environment production \
  --confirm-environment production \
  --plan-file /tmp/ove350-plan.json \
  --approval-file /tmp/ove350-approval.json \
  --approved-plan-digest "$OVE350_PLAN_DIGEST" \
  --confirm-production delete-approved-empty-overgarden-quarantine
```

The implementation must re-check the approved identities, current public-only
credential scope, exact empty provider state, retired environment absence,
database/repository writer absence, and preserved canaries before issuing only:

```bash
pnpm exec wrangler r2 bucket delete overgarden-quarantine
```

No wildcard, scripted bulk deletion, or object-emptying command is permitted.

## Terminal proof and rollback

Terminal read-back requires the implementation SHA from current `origin/main`:

```bash
pnpm exec tsx scripts/verify-legacy-quarantine-provider-retirement.ts \
  --final-readback \
  --environment production \
  --confirm-environment production \
  --expected-git-sha "$OVE350_IMPLEMENTATION_SHA" \
  --plan-file /tmp/ove350-plan.json
```

The expected SHA may be the immutable plan baseline or a later documentation
closeout SHA that contains that baseline; the verifier proves Git ancestry and
requires the expected SHA itself to be READY in production. Success means two
independent provider listings omit exactly
`overgarden-quarantine`; the application credential is `public_only`; the
public/staging buckets remain present; both domains remain healthy; retired env
names remain absent; and the exact expected SHA is READY in production. The
terminal receipt is aggregate-only and digest-bound.

The in-flight plan allowed exact empty-bucket recreation only if deletion had
succeeded while a preserved canary failed. That condition did not occur:
canaries passed and rollback is terminally `not_required`. Do not recreate the
bucket, its CORS/lifecycle, legacy env, routes, packages, schema, or worker. A
future change would require a new explicit ADR, production plan, and approval.
