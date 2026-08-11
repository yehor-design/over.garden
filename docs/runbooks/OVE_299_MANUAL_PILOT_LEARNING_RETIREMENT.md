# OVE-299 Manual Pilot Learning Retirement

Status: authorized bounded production retirement. The code deployment must land
before the database step.

## Outcome

The two manual owner workflows are removed from routing, navigation, copy,
authorization inventories, smoke tests, fresh database bootstrap, and active
documentation. Their dedicated empty production relation is dropped only after
the containing `main` deployment is `READY` and both retired routes return exact
`404` responses.

The automated `/garden/pilot-health` learning aggregates,
`/garden/pilot-smoke`, closed-pilot invite/grant state, value-pulse events,
H1/H4/H6 measurement, catalog curation, erasure operations, and `/admin` were
outside this bounded operation. A later maintainer decision on 2026-08-11
approved a separate follow-up retirement of the pilot-status, product-access
invite, and redundant owner-status UI. This OVE-299 operator does not delete
gardener content, analytics events, invite grants, or any unrelated table.

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

## Enforceable operator

Run from `apps/web`. Obtain the production database connection through the
existing masked/native operator environment; never paste or persist a
connection value, credential, cookie, token, row, or private payload.

The plan is a repeatable-read, read-only transaction. It emits exactly one
aggregate JSON receipt and fails closed:

```bash
pnpm pilot-learning:retire -- \
  --mode plan \
  --environment production \
  --implementation-sha "$OVE299_CONTAINING_MAIN_SHA" \
  --route-absence-class exact_404
```

Review the exact receipt and retain only its digest/count/class fields. Apply
once with the exact `evidenceDigest` returned by that immediately preceding
plan:

```bash
pnpm pilot-learning:retire -- \
  --mode apply \
  --environment production \
  --implementation-sha "$OVE299_CONTAINING_MAIN_SHA" \
  --route-absence-class exact_404 \
  --expected-plan-digest "$OVE299_PLAN_DIGEST"
```

The operator first verifies the exact approved production database host, port,
and database name and emits only the preapproved binding digest. The apply
transaction obtains a task-specific advisory lock plus an `ACCESS EXCLUSIVE`
lock on the exact target, re-reads the full authorized aggregate shape after
the table lock, verifies the plan digest, executes only
`0020_ove299_remove_manual_pilot_learning.sql`, verifies relation absence in the
same transaction, and then commits. Lock, statement, query, connection, and
whole-process deadlines are finite. Re-running after success returns
`already_completed` without another effect.

## Deployment and verification order

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
