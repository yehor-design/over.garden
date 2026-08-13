# OVE-307 final-main public-search parity repair

This runbook owns the one approved launch-time repair for legacy derived-index
documents whose only drift is the calendar-date representation corrected by
OVE-306. It does not change Postgres, public eligibility, product behavior,
content, provider configuration, or another index.

## Immutable authorization

Approved plan:

```text
OVE-307-amendment-1|production|after two matching read-only parity classifications at exact main e95eb8d8de7d95128e085f5332da63e7edeea43d report ten stale public journal documents and drift field class entryDate only, execute one bounded canonical public-index repair batch for exactly reindex=10, unindexDelete=0, deleteInvalid=0, then perform two matching read-only classifications requiring zeroGap true and every gap and terminal class zero|baseline:e95eb8d8de7d95128e085f5332da63e7edeea43d|policy:ove242.publicIndexParity.v3|one-apply|cleanup:verified-convergence
```

SHA-256:
`765ab7a989c970f2ac9bd356f61d0ab83b88dde1749ba61835099f7f0d361356`.

The apply is single-use for the tuple of issue, deployed main SHA, and approval
digest. The attempt marker is written before the canonical repair call. After
the first apply invocation, never run apply again under this digest; use status,
cancel, and the read-only parity classifier only.

## Preconditions

1. OVE-284 and OVE-306 are authenticated `Done`.
2. The OVE-307 feature commit is contained in current `origin/main`.
3. Canonical Vercel production is READY and
   `/api/document-mutation-admission/readback` returns the current main SHA.
4. The working tree is clean and checked out at that exact main SHA.
5. A fresh plan reports policy `ove242.publicIndexParity.v3`, ten eligible
   documents, `stale=10`, only `entryDate` drift, no unsafe or queue/outbox
   debt, `reindex=10`, and both delete actions zero.

Any mismatch stops before effect.

## Execution

Set the deployed current-main SHA in the shell without recording it in chat or
Linear as a new credential:

```bash
cd apps/web
OVE307_DEPLOYED_MAIN_SHA="$(git rev-parse origin/main)"
vercel env run -e production -- pnpm run ove307:production-proof -- --environment production --confirm-environment production --implementation-sha "$OVE307_DEPLOYED_MAIN_SHA" --plan
```

Compare the complete counts-only plan with the immutable authorization. Then
invoke exactly once:

```bash
vercel env run -e production -- pnpm run ove307:production-proof -- --environment production --confirm-environment production --implementation-sha "$OVE307_DEPLOYED_MAIN_SHA" --apply --approval-digest 765ab7a989c970f2ac9bd356f61d0ab83b88dde1749ba61835099f7f0d361356
```

The terminal pass requires `applyCount=1`, `reindexUpserted=10`, `deleted=0`,
`resultClass=verified_zero_gap`,
`convergenceClass=matching_zero_gap_twice`, `zeroGap=true`, equal safe corpus
hashes, and zero for every gap, unsafe, queue, terminal, and projection-debt
class.

## Status, cancellation, and final read-back

Status is always non-mutating:

```bash
vercel env run -e production -- pnpm run ove307:production-proof -- --environment production --confirm-environment production --implementation-sha "$OVE307_DEPLOYED_MAIN_SHA" --status
```

Cancellation is useful only before the canonical repair starts:

```bash
vercel env run -e production -- pnpm run ove307:production-proof -- --environment production --confirm-environment production --implementation-sha "$OVE307_DEPLOYED_MAIN_SHA" --cancel
```

After a verified apply, run the canonical read-only classifier twice. Both
receipts must match and remain zero-gap:

```bash
vercel env run -e production -- pnpm smoke:public-index-parity -- --environment production --confirm-environment production
vercel env run -e production -- pnpm smoke:public-index-parity -- --environment production --confirm-environment production
```

## Failure and recovery

Before apply, rollback is zero effect. After apply starts, restoring the stale
calendar-date representation is forbidden. A timeout, partial result, uncertain
receipt, changed count, additional drift field, or failed convergence exhausts
the digest. Preserve the attempt marker, use status and read-only
classification, and create a new counts-only recovery plan with a new digest.
Never delete production documents or edit canonical Postgres rows to make this
gate pass.

Evidence retains only policy/environment classes, counts, booleans, durations,
exact SHA, safe corpus hashes, convergence state, and cryptographic digests.
Document IDs, owner identity, text, locations, media keys, requests, provider
payloads, and credentials are forbidden.
