# Stable Registry Production Rollout

Status: superseded for the owner flow (ADR-0022, D5, 2026-09-03). The
plan-digest ceremony below is history; the owner builds, previews, confirms,
and activates from `/garden/catalog/registry` in production, and the
`--mode apply` path of the harness stays as a maintainer fallback only.
Production state: read it live in the Release Center
Harness: `apps/web/scripts/prove-stable-registry-production.ts`
Plan contract: `apps/web/src/lib/catalog/stable-registry-production-plan.ts`
Read-back: `apps/web/src/server/stable-registry/production-rollout-repository.ts`
Authorization status: `pending`

## The shape of this issue

OVE-259 is the only Stable Registry issue with `Direct production-state
mutation: yes`, and it is deliberately split:

- **Phase A (this PR)** lands the harness, its tests, and the read-only
  classify/plan path. It changes no production state.
- **Phase B** applies exactly one maintainer-approved plan, verifies, rehearses
  rollback, restores forward, cleans up, and closes.

Phase B cannot start until a maintainer approves one exact plan digest.

## Why the harness cannot mutate production on its own

Three independent gates, and none of them has a bypass flag:

1. **Environment confirmation.** `--environment` must equal
   `--confirm-environment` for any phase at all.
2. **Approved digest.** Every mutating phase (`apply`, `rollback`, `forward`,
   `cleanup`) requires an approved plan digest. `classify`, `plan`, and `verify`
   are read-only and always available.
3. **No apply implementation.** `prove-stable-registry-production-live.ts` has
   no write path. Even a correct approved digest returns
   `apply_execution_not_implemented_in_this_harness`, so Phase B is a
   deliberate, reviewable follow-up rather than something a stray flag unlocks.

Approval binds **one** digest. If any input drifts — deployment SHA, applied
migrations, source inventory total or digest, release policy, capacity class,
backup class, affected-object count, active release — the rebuilt plan produces
a different digest and authorization returns to pending. Approval is never
inherited by a later plan.

## Plan inputs

| Input                             | Where it comes from                                   |
| --------------------------------- | ----------------------------------------------------- |
| `deploymentSha`                   | `VERCEL_GIT_COMMIT_SHA` of the exact READY deployment |
| `appliedMigrations`               | probed from the schema; see below                     |
| `sourceInventoryTotal` / `Digest` | the latest completed OVE-254 capture                  |
| `releasePolicyVersion`            | `ove255.foundation.v1`                                |
| `storageHeadroomClass`            | `STABLE_REGISTRY_STORAGE_HEADROOM_CLASS`              |
| `backupFreshnessClass`            | `STABLE_REGISTRY_BACKUP_FRESHNESS_CLASS`              |
| `affectedObjectCount`             | garden objects that reference a catalog identity      |
| `activeReleaseId`                 | the `foundation` active pointer                       |

Unmeasured capacity is treated as `insufficient` and unmeasured backup
freshness as `unknown`; both block a plan. A plan must never be approved
against a number nobody measured.

### There is no migration ledger

Bootstrap replays every versioned SQL file idempotently, so this repository has
no `schema_migrations` table. "Applied" therefore means _the objects that
migration creates exist_, probed through one sentinel relation per migration:

| Migration | Sentinel relation                         |
| --------- | ----------------------------------------- |
| `0023`    | `catalog_source_capture_runs`             |
| `0024`    | `catalog_registry_releases`               |
| `0025`    | `stable_registry_public_catalog_records`  |
| `0026`    | `stable_registry_product_catalog_records` |
| `0027`    | `catalog_registry_extension_packs`        |
| `0028`    | `catalog_registry_activation_sequence`    |

That is a directly verifiable signal rather than a bookkeeping row that could
disagree with reality.

The same probe also reads every other relation in the registry namespace. Any
relation this program does not account for is reported as an unknown migration,
which the plan refuses on: it means production and this repository disagree
about schema history, and reconciling that is not something a rollout harness
should attempt. A unit test parses `0023`–`0028` and asserts the accounted set
covers every table they create, so adding a migration without listing its
tables fails here rather than reporting a correct production as drifted.

## Verification numbers that must be zero

`verify` reads two numbers back, and both must be `0`:

- **`projectionParityGap`** — projection rows the active release does not own.
- **`orphanedObjectCount`** — garden objects whose catalog identity is not in
  the active release.

A nonzero second number would mean a gardener's saved plant stopped resolving.
That is the failure this whole program exists to prevent.

## Commands

Read-only, safe to run at any time:

```bash
cd apps/web
pnpm stable-registry:production -- --mode classify \
  --environment production --confirm-environment production
pnpm stable-registry:production -- --mode plan \
  --environment production --confirm-environment production
```

Hermetic proofs:

```bash
cd apps/web
pnpm exec vitest run \
  scripts/prove-stable-registry-production.test.ts \
  src/lib/catalog/stable-registry-production-plan.test.ts
pnpm exec tsx scripts/prove-stable-registry-production.ts \
  --inject-meilisearch-timeout
```

After a maintainer approves a digest, and only then:

```bash
pnpm stable-registry:production -- --mode apply \
  --environment production --confirm-environment production \
  --approved-plan-digest <the exact approved digest>
```

## Receipt safety

Receipts carry phase, status, terminal class, environment class, approval
status and reason, plan digest, pending-migration count, duration, parity and
orphan counts, and control booleans. `assertNoForbiddenRolloutMarkers` refuses
any receipt containing a connection string, password, authorization header, API
key, owner id, journal text, or coordinates — so a receipt can be pasted into an
issue without redaction work.

## No-wedge

`--inject-meilisearch-timeout` proves WAIT-01: a stalled search convergence
during verification ends in a bounded `rolled back` receipt with
`abortBeforeApplyEnabled` and `productionStatusCommandEnabled` both true, and
never a half-applied rollout. Measured 50.7 ms against a 5000 ms
`production_activation_to_picker_latency` budget.

## Environment identity: the declared environment is not evidence

`--environment production` is a claim. What matters is the database actually
reached, and the two can disagree in a way that produces a receipt reading as
proof of something that never happened.

`vercel env run -e production` loads the checkout's `.env.local` and that value
**wins** over the downloaded production one. Measured on 2026-08-31 by comparing
digests: the `DATABASE_URL` resolved under `vercel env run -e production` was
byte-identical to the local `.env.local` value. A `--environment production`
command run that way reads **localhost**.

The shadowing is per-variable, which is what makes it easy to miss: in the same
run, `DATABASE_SSL_CA` and `EPPO_DATA_PORTAL_API_KEY` came through from
production, because `.env.local` does not define them. Only the names it does
define fall back to local, silently.

The harness therefore does two things:

1. It no longer loads `.env.local` at all when the declared environment is
   `production`. A production command uses credentials the operator supplied.
2. Before opening a connection it compares the declared environment against the
   host class of the resolved connection string, and refuses a mismatch in
   either direction:

   | Declared | Reached | Result |
   | -- | -- | -- |
   | `production` | loopback | `declared_production_reached_loopback_database` |
   | anything else | remote | `declared_non_production_reached_remote_database` |

Every live receipt now carries `databaseHostClass` next to `environmentClass`:
what was reached, beside what was claimed. An unparseable or absent connection
string classifies as `remote`, because the safe reading of "I cannot tell" is
not "this is the local one".

### Running a real production read

`vercel env run -e production` is **not** sufficient from a checkout that has an
`.env.local` with a `DATABASE_URL`. Supply the production connection explicitly,
or run from a checkout without that file. If the guard reports
`declared_production_reached_loopback_database`, the command read your local
database and its numbers mean nothing about production.

## Measured production state

**Withdrawn as unverifiable.** An earlier revision of this document recorded a
"measured production state" dated 2026-08-31 listing `source_inventory_empty`,
`source_inventory_digest_invalid`, `insufficient_storage_headroom`, and
`backup_not_fresh`.

It is withdrawn because it cannot be told apart from a local read, not because
it has been shown to be one. The receipt of the day carried no evidence of which
database produced it, and the documented command demonstrably reads localhost
from a checkout with an `.env.local`. Whether that particular run reached
production is now unknowable.

One detail argues it may have reached production: it reported that none of
`0023`–`0028` existed, whereas the local database on this machine has the
`0023`–`0026` sentinels and lacks only `0027`/`0028`. That is also consistent
with the local database having gained those tables afterwards, during the
implementation of the upstream children. The point is precisely that the
evidence cannot settle it — which is the reason for the guard, and the reason a
finding that cannot name its own source is not a finding.

The first trustworthy measurement is the first one whose receipt carries
`databaseHostClass: "remote"`. Until then this document asserts no production
state.

### Order Phase B must follow, once production is actually measured

Independent of what the measurement turns out to be, approval alone cannot start
Phase B. Its preconditions have to exist first, in this order:

1. run the OVE-254 observed capture against production so a completed capture
   and its manifest digest exist;
2. measure and publish storage headroom and backup freshness as the two declared
   classes — a plan must never be approved against a number nobody measured;
3. regenerate the plan, which will then produce a digest;
4. obtain maintainer approval of that exact digest.

A change of managed-Postgres provider invalidates every one of these: the plan
digest binds environment identity, capacity class, and backup class, so a
provider move returns authorization to pending and the capture has to be redone
against the new instance. Landing before the provider is settled would be work
thrown away, and worse, a `Done` that quietly stops being true.

## The in-product flow replaces the authorization gate

Since ADR-0022 (D5) the owner activates from the product: `/garden/catalog/registry`
builds a Foundation draft (the worker builds it in the background and the page
shows the release state), the preview is approved, and activation requires the
confirm step with the affected counts; the same holds for extension packs and
edition pointer moves. Each irreversible action writes one
`admin_role_audit_log` row. The plan-digest approval and the
`--approved-plan-digest` apply mode are no longer part of the owner's path.
