# OVE-314 Obsolete Control-Plane Retirement

Status: authorized; code/database/provider closeout must follow this order

Authorization timestamp: 2026-08-11T14:44:26Z
Authorization receipt SHA-256:
`fc250128d02809526becee2d3b83c3c8406b2321f2c04c4b6b0f8a2d4498fe55`

## Scope

Retire the product-access invite/closed-pilot control plane and obsolete UI,
while preserving self-serve auth, lineage provenance, real operator tools, and
sealed-owner server authorization.

Route absence set:

- `/admin`
- `/admin/users`
- `/garden/pilot-health`
- `/garden/pilot-smoke`
- `/garden/pilot-learning/interviews`
- `/garden/pilot-learning/decision`
- `/join`

Sealed-owner avatar-menu set:

- `/admin/communities`
- `/admin/moderation/comments`
- `/garden/catalog/curation`
- `/garden/privacy/erasure-requests`

Preserved auth/provenance:

- email/password self-service;
- Google authentication and explicit account linking;
- `/garden/lineage/invitations/claim` and its existing consent/claim semantics;
- credential-only sealed-owner storage and direct-route authorization.

## Approved aggregate database plan

The production read-only preflight classified:

- grant rows: 43;
- historical closed-pilot rows: 6;
- historical founder-rehearsal rows: 37;
- attribution outbox rows: 0;
- hinted rows: 0;
- unfinished hinted rows: 0;
- incoming foreign keys: 0;
- view dependencies: 0;
- grant columns: 6;
- grant constraints: 9.

No identifier, segment, email, token, cookie, user content, media key,
connection string, or precise location is part of approval or evidence.

Mapping:

| Historical state                              | Current state                            |
| --------------------------------------------- | ---------------------------------------- |
| `real_closed_pilot` / closed-pilot grant      | `real_self_serve` / `self_serve_default` |
| `founder_rehearsal` / founder-rehearsal grant | `production_smoke` / `operator_plan`     |
| `invited_cohort` activation                   | `direct_garden`                          |
| `invite` source surface                       | `garden`                                 |

Existing explicit producer classifications win over a grant-derived default.
Orphan grants never create a user or attribution. Production apply fails closed
if the locked second snapshot contains an orphan.

## Mandatory order

1. Implement route/caller/schema retirement and owner avatar-menu projection.
2. Pass focused, broad, migration replay, localization, accessibility, and
   build gates.
3. Record the implementation SHA once; merge it into current `origin/main`.
4. Prove the Vercel production deployment is `READY` for the exact contained
   SHA and owns canonical aliases.
5. Prove the route/menu/self-serve/lineage browser matrix.
6. Run the production read-only retirement plan.
7. Apply migration `0021` only if the plan is exactly `code_deployed` and every
   approved aggregate matches under the locked second snapshot.
8. Read database completion, preservation, schema absence, and replay.
9. Remove only `PILOT_INVITE_SIGNING_SECRET` from Vercel production, preview,
   and development.
10. Read exact target-name absence twice without reading values.
11. Run current-main closeout and complete the authenticated Linear read-back.

Provider cleanup must not precede database completion. Database apply must not
precede exact-SHA route/menu deployment proof.

## Local proof

```bash
cd apps/web
NODE_OPTIONS=--conditions=react-server \
  ../../infra/run-with-local-infra-env pnpm db:bootstrap

../../infra/run-with-local-infra-env pnpm exec kysely-codegen \
  --dialect postgres \
  --out-file src/db/generated.ts

../../infra/run-with-local-infra-env pnpm db:types:check

OVE314_RUN_DB_INTEGRATION=1 \
  ../../infra/run-with-local-infra-env pnpm exec vitest run \
  scripts/retire-obsolete-control-plane.test.ts
```

The integration test refuses any non-loopback database target, wraps fixtures
in a transaction, proves both mappings plus orphan non-creation, checks
user/journal/object/media aggregates, applies twice, and rolls back.

## Production plan and apply

After exact-SHA proof, export closed proof classes only:

```bash
export OVE314_ROUTE_ABSENCE_CLASS=exact_404
export OVE314_MENU_CONTRACT_CLASS=sealed_owner_exact_four
# Authenticated closeout read-back found the retired name on production only;
# preview and development are already absent. Re-read before every command.
export OVE314_VERCEL_ENV_TARGET_CLASS=mixed
export OVE314_CONTAINED_IMPLEMENTATION_SHA="$OVE314_IMPLEMENTATION_SHA"
export OVE314_VERCEL_READY_SHA="$OVE314_IMPLEMENTATION_SHA"
```

Read-only plan:

```bash
cd apps/web
vercel env run -e production -- pnpm exec tsx \
  scripts/retire-obsolete-control-plane.ts \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE314_IMPLEMENTATION_SHA" \
  --plan
```

Apply:

```bash
vercel env run -e production -- pnpm exec tsx \
  scripts/retire-obsolete-control-plane.ts \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE314_IMPLEMENTATION_SHA" \
  --apply \
  --approval-digest \
  fc250128d02809526becee2d3b83c3c8406b2321f2c04c4b6b0f8a2d4498fe55
```

The command prints one closed, aggregate-only JSON receipt. Any error prints
only `{"version":1,"state":"failed"}` and exits non-zero. Investigate raw
provider/database errors only in the secure operator environment.

## Post-apply database proof

Require all of the following before provider cleanup:

- plan/apply state is `database_completed` or replay-safe
  `already_completed`;
- `public.pilot_invite_grants` is absent;
- outbox `cohort` and `segment` columns are absent;
- retired actor/source/activation/surface values count is zero;
- current actor/source constraints are narrowed;
- user, journal, object, and media totals equal the locked pre-apply totals;
- a second migration/application attempt has no additional effect.

## Vercel cleanup

Use authenticated Vercel metadata and exact-name removal. Do not read or print
the value. Remove only `PILOT_INVITE_SIGNING_SECRET` from each target where an
immediate read proves that it still exists:

- production;
- preview;
- development.

`present_all` and `mixed` are valid pre-cleanup classes; both require provider
cleanup after database completion. `absent_all` is the only terminal provider
class. If removal is partial, leave code/database retirement in place, classify
only which environment names remain, and remove those exact remaining targets
after a fresh absence plan. Never touch Better Auth, Google, lineage, R2,
database, matching, analytics, or another Vercel setting.

## Failure gates

Stop without mutation on any count, shape, dependency, orphan, environment,
authorization, implementation SHA, deployment SHA, route, menu, provider-target,
lock, timeout, or preservation mismatch. Do not retry automatically.

The database controller uses one repeatable-read transaction, a task-specific
advisory transaction lock, an access-exclusive grant-table lock, a five-second
lock timeout, a thirty-second statement/process deadline, and a destructive
second snapshot. A late connection is destroyed so an uncommitted effect rolls
back.

## Rollback

Before database apply, rollback is the normal code revert. After database
apply, rollback is forward-fix only against the narrowed schema. Never restore
invite admission, a retired page, the grant table, hint columns, historical
cohort semantics, or the Vercel setting without a new product decision, SDD
issue, migration, and maintainer authorization.

## Terminal receipt

Fill this only after authoritative production read-back:

```text
implementation_sha: <contained exact SHA>
main_containment: <pass/fail>
vercel_ready_sha: <matching/nonmatching>
retired_route_matrix: <exact_404/pass/fail>
owner_menu_contract: <exact_four/pass/fail>
database_plan_state: <closed state>
database_apply_state: <closed state>
schema_absence: <pass/fail>
retired_attribution_count: <aggregate>
protected_aggregate_preservation: <pass/fail>
migration_replay: <pass/fail>
vercel_env_absence_first_read: <production/preview/development classes>
vercel_env_absence_second_read: <production/preview/development classes>
self_serve_and_lineage_preservation: <pass/fail>
redaction_boundary: <pass/fail>
```
