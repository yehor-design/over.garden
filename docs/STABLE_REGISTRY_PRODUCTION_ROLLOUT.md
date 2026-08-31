# Stable Registry Production Rollout

Status: harness implemented by OVE-259; **production apply not authorized**
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

## Measured production state (read-only, 2026-08-31)

A read-only `classify` and `plan` were run against production on the exact
`origin/main` deployment SHA. **No plan could be produced**, and the four
closed gates are the honest reason:

| Blocked reason | What it means |
| -- | -- |
| `source_inventory_empty` | production has no completed OVE-254 observed capture |
| `source_inventory_digest_invalid` | consequently there is no manifest digest to plan against |
| `insufficient_storage_headroom` | `STABLE_REGISTRY_STORAGE_HEADROOM_CLASS` is unset, so headroom is unmeasured |
| `backup_not_fresh` | `STABLE_REGISTRY_BACKUP_FRESHNESS_CLASS` is unset, so backup freshness is unmeasured |

`deployment_sha_missing` did **not** fire: the deployment SHA resolved. None of
migrations `0023`–`0028` exists in production, which `classify` reports rather
than crashing on — discovering that is its job.

Phase B therefore cannot begin on approval alone. Its preconditions have to be
created first, in this order:

1. run the OVE-254 observed capture against production so a completed capture
   and its manifest digest exist;
2. measure and publish storage headroom and backup freshness as the two
   declared classes;
3. regenerate the plan, which will then produce a digest;
4. obtain maintainer approval of that exact digest.

## Open maintainer authorization gate

Applying migrations `0023`–`0028` to production, capturing the observed EPPO
source there, activating Foundation and extension packs, rebuilding search,
creating disposable proof effects, and executing rollback/forward all remain
**pending**. Nothing in this PR performs any of them, and no approval is implied
by the harness existing.
