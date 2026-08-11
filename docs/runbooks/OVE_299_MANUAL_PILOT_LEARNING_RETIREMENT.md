# OVE-299 Manual Pilot Learning Retirement

Status: completed on 2026-08-11; historical receipt only. OVE-314 removed the
one-off operator after its successful replay/closeout.

## Outcome

The two manual owner workflows are removed from routing, navigation, copy,
authorization inventories, smoke tests, fresh database bootstrap, and active
documentation. Their dedicated empty production relation is dropped only after
the containing `main` deployment is `READY` and both retired routes return exact
`404` responses.

Pilot status/smoke, product-access invite/grant state, `/admin`, and
`/admin/users` were outside OVE-299 and are now retired separately by OVE-314.
Value-pulse events, self-serve H1/H4/H6 learning, catalog curation, erasure
operations, and sealed-owner authorization remain. OVE-299 did not delete
gardener content, analytics events, grants, or any unrelated table.

## Authorization-bound preflight

The maintainer authorized exactly the two retired route trees and the dedicated
empty `public.pilot_interview_learnings` relation. The normalized authorization
receipt has SHA-256
`522a4ddb33603840b76160351e75d24db5a0220bef268c6ee82a8f251a53dec0`.

The production read-only inventory recorded only aggregate schema evidence:

- rows: `0`;
- columns: `14`;
- constraints: `20`;
- incoming foreign keys: `0`;
- dependent views/materialized views: `0`;
- approved shape digest:
  `43d409207c85e573f4462e7d2ecd3441b73d2860021c544c4fd4d9eceab0fda5`;
- production binding digest:
  `f8605495309948c9729e73c96c9dcf1d542b2c1983cf691a98fb90436be6fe3b`.

Any nonzero count, dependency, environment drift, schema-shape drift,
implementation-SHA drift, migration-byte drift, or non-404 retired route
invalidates this authorization. Stop without mutation and obtain a new exact
plan.

## Historical operator (removed)

The `pilot-learning:retire` package script and its one-off implementation no
longer exist in current source and must not be recreated or run. Migration
`0020` remains as immutable idempotent schema history.

That historical operator verified the approved database binding, locked and
re-read the target, executed only migration `0020`, and proved replay. Current
bootstrap replays the migration directly; no active command is needed.

## Historical completed deployment and verification order

1. Merge reviewed code through a PR and prove the implementation commit is
   contained in current `origin/main`.
2. Require terminal-success CI, a canonical production deployment with the
   containing main SHA, `READY` state, and apex/`www` aliases.
3. Prove guest, gardener, and owner requests to both retired routes return exact
   `404` without redirects or private content. Surviving operator routes are
   verified independently and may be retired only by their own bounded task.
4. Run the read-only production plan. Stop unless its state is `code_deployed`
   and every approved count/digest is exact.
5. Run apply with that exact plan digest. Require `completed` and
   `tableExists=false`.
6. Run plan twice more. Require deterministic `already_completed`, zero shape
   counts, and the canonical absent-shape digest.
7. Run the clean-main closeout check, save the redacted receipt to Linear, read
   the issue and relations back, then move OVE-299 to `Done`.

## Terminal receipt

Completed on 2026-08-11 with aggregate-only evidence:

- containing `main` SHA:
  `22a7fa1426a6803139ea9908cbdfc787f798a905`;
- final CI run `31492467470`: `success`;
- final matching-image release run `31492467574`: `success`;
- canonical production deployment `dpl_3BA6bZCt4Vr3JyZv8H2M7NyME9XT`:
  `READY`, with apex and `www` aliases;
- route absence: `12/12` direct `404` responses across both retired routes,
  `GET`/`HEAD`, and `uk`/`bg`/`ru`, with zero redirects;
- final pre-mutation plan: `state=code_deployed`, `rowCount=0`,
  `columnCount=14`, `constraintCount=20`,
  `incomingForeignKeyCount=0`, `viewDependencyCount=0`, evidence digest
  `3765ad72eb4e4abe8cf793638eaeb576d3fccf8f8c85f22fdf050f0b0eed1f2d`;
- apply: `state=completed`, `tableExists=false`, all aggregate counts zero,
  absent-shape digest
  `81cc80e997e5198d737482b7e928407ec2ee1592c061276fe8c417ebafd8759c`,
  evidence digest
  `b4e7a73a21e134a82a8baf3e9d2f1e81121f9c62ebdac9d7c3e5c9336d423d9a`;
- two independent post-apply plans: both `state=already_completed`, both
  `tableExists=false`, all aggregate counts zero, and the same evidence digest
  `9bec5ab2968a1808879e97b95d3b3b11d2fec9f2c34195e8c29ac6dfa47cc23d`;
- clean-main closeout: passed, including 36 authenticated CI/deployment proof
  URL read-backs.

The first preflight attempt before the final operator fixes failed before any
database action because the package-runner separator was rejected. A later
read-only plan exposed overlapping queries on one transaction-bound PostgreSQL
client; commit `3be2a4f3a124fc549d65c46eea8856b93e4547a3` serialized those reads and added
a regression test before the production apply. No production mutation occurred
until the final digest-bound transaction above.

The receipt contains no database connection, identifier-bearing row, user id,
email, note, cookie, token, credential, private content, or precise location.

## Failure and rollback

Before commit, any failure rolls the transaction back. After a verified drop,
rollback is forward-fix only: do not recreate the retired workflow or restore
its table automatically. Repair unrelated surviving behavior on a new reviewed
SHA while keeping both routes absent. If unexpected data or a dependency appears
before apply, preserve it in place, stop, and require a newly scoped maintainer
decision; never coerce, migrate, or delete it under this authorization.
