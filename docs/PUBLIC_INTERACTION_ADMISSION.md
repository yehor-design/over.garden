# Public interaction admission

Status: **partly superseded.** The comment and lineage-question quotas below are
current. **Everything this page says about likes was removed by ADR-0024 (D1, D2;
OVE-377) on 2026-09-04** — read that ADR, `docs/PROJECT_STATE.md`, and the header
of the like section below before treating any like rule here as live.

OVE-237 made public comments, anonymous likes, and lineage questions bounded
mutations. It is deliberately an abuse-resistance boundary, not a behavioural
analytics system.

## What likes are now, and what they are not

A like is a **permanent row with exactly one owner**: `engagement_likes` carries
nullable `user_id` and `visitor_id` with a check that exactly one is set. A
signed-in gardener's like belongs to the account and survives devices; a
signed-out reader's like rests on one signed site-wide visitor cookie, minted
only when somebody first likes something, and claimed onto the account at
sign-up. Both halves are permanent, uncapped, and counted publicly; only the
`user_id` half may ever feed ranking. Trust is decided at read time.

Migration `0049` dropped `engagement_like_target_budgets`, and with it
`anonymous_device_hash`, `capability_expires_at`, `toggle_window_started_at`,
`toggle_count` and `like_state`. Deleted with them, and **not to be rebuilt**:

- the target-bound HMAC like capability and its 24-hour lifetime — it embedded
  `target_ref` verbatim, and a Cyrillic slug overflowed the 256-character bound
  the server itself had minted past, so Like answered `500` on 7 of 8 public
  entries;
- the 64-active / 128-resident per-target budget — an entry could never show a
  65th like however many people wanted to give one;
- expiry-based counting, which silently stopped counting every like after 24
  hours.

The honest limit that replaces them: a reader who clears cookies can like the
same entry again. That is true of every anonymous counter on the web, and the
answer is that the anonymous half never drives ranking — not a budget table that
punishes popularity.

## Invariants (comments and lineage questions — current; like clauses — historical)

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
