# Public interaction admission

OVE-237 makes public comments, anonymous likes, and lineage questions bounded
mutations. It is deliberately an abuse-resistance boundary, not a behavioural
analytics system.

## Invariants

- A comment is admitted at most 12 times per author per UTC day and 3 times per
  author/target/day for roots, or 24 and 6 respectively for replies.
- A lineage question is admitted at most 6 times per asker/day, 2 times per
  asker/confirmed edge/day, and 2 times per asker/recipient/day.
- Every quota increment is a conditional PostgreSQL UPSERT in the same
  transaction as the canonical mutation. A 2-second statement timeout,
  500-millisecond lock timeout, and transaction advisory lock bound a
  contention burst. Replaying the same client mutation checks its previous
  result before spending quota again.
- An anonymous like has a target-bound HMAC capability, signed with the
  canonical versioned Better Auth secret policy. Its maximum lifetime is 24
  hours. The old unsigned `og_engagement_device` cookie is never accepted as
  identity and is removed by the likes route.
- The database stores only SHA-256 capability hashes. It never stores the raw
  capability, an IP address, user agent, e-mail, question/comment content in a
  quota record, or a cross-target anonymous identifier.
- Per public target, at most 64 active and 128 resident non-expired anonymous
  like rows exist. Expired and legacy unsigned rows are removed during that
  target's next admission; an empty target budget is removed too.
- `community_contribution` stays a comment-only target. It can never create an
  anonymous-like row or a like counter.

## Failure and rollback

The UI maps quota exhaustion to an action-local localized message. Capacity,
lock, timeout, and serialization failures map to the single localized
`interaction-unavailable` retry state; no counter, lock key, or capability is
shown to a visitor. No admission outcome emits a learning analytics event.

The migration is additive. To stop a faulty release, roll back application
traffic first. Do not drop `interaction_quota_windows`,
`engagement_like_target_budgets`, or `capability_expires_at` without explicit
maintainer approval: doing so would weaken the admission boundary. Expired
state self-cleans on ordinary traffic; a separately approved maintenance job
may delete only rows past their recorded expiry.

## Verification

```bash
cd apps/web
../../infra/run-with-local-infra-env pnpm local:bootstrap
../../infra/run-with-local-infra-env pnpm db:types
../../infra/run-with-local-infra-env pnpm vitest run src/server/interaction-admission.integration.test.ts
pnpm vitest run src/server/anonymous-like-capability.test.ts src/server/engagement-repository.test.ts src/server/lineage-interactions-repository.test.ts src/app/api/engagement/route.test.ts 'src/app/lineage/objects/[objectId]/actions.test.ts'
```
