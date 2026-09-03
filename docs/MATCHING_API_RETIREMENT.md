# Matching API retirement

Status: complete
Owner: OVE-357
Scope of this document: both halves. Phase A removed the application from the
repository; phase B removed the container, its reverse-proxy route, and its DNS
record from the host on 2026-09-03.

## Why

`services/matching/app/main.py` defined exactly three endpoints — `/health`,
`/capabilities`, and `/ready` — and every one of them reported on the service
itself. None accepted product input. Nothing under `apps/web/src` ever called
them; the only consumers were two operator proof scripts.

To let an operator ask whether the worker was alive, the project ran a
container, a reverse-proxy route, a public hostname, and a TLS certificate. The
same worker already writes its release, image digest, schema class, handler set,
and last-seen time into `matching_worker_heartbeats`, one query away.

Asking a process about itself was also the weaker signal. A healthy HTTP
response proved the API was up. It never proved the worker was claiming jobs.

## What phase A did

| Change | Effect |
| -- | -- |
| Deleted `app/main.py` | the three self-reporting endpoints are gone |
| Removed `fastapi` and `uvicorn` | nothing else imported them |
| `Dockerfile` runs `python -m app.worker` | the worker is the service |
| Removed `EXPOSE 8000` | the image publishes no port |
| Removed `matching-api` from the release compose file | the service is no longer defined |
| Both operator proofs read Postgres | the heartbeat row is the source |

The virtualenv, already reduced from 227 MB to 83 MB by retiring an unused
dependency, drops to **69 MB** — 70 percent smaller than where it started.

## The contract did not change; its source did

`apps/web/src/lib/matching-runtime-proof.ts` keeps its parsers, its evidence
shape, its leak checks, and its bounded class sets. Only `readRuntimeDocument`
is gone, replaced by `buildRuntimeDocumentsFromHeartbeat`, which reconstructs the
same two documents from the heartbeat row.

Three things did move, and each is a correction rather than a convenience.

**`--base-url` is refused, not ignored.** It named a service that no longer
exists. A flag that still parses would let an operator runbook keep naming it and
believe the check happened. The refusal says what changed.

**`dependencies.api` is gone.** It described the retired application. Reporting
`api: available` from a heartbeat row would be reporting on nothing.

**`buildTimestamp` is gone.** This is the one field the saved contract claimed
the heartbeat row carries and it does not. `/capabilities` read it from the
image's own build environment; no column holds it. Inventing a value would be
fabricating evidence about a build nobody observed, and the image digest already
identifies the build exactly.

## The class the endpoints uniquely covered

`never_started`.

The endpoints could answer before a worker had ever run. A heartbeat row cannot
— there is no row. That is not the same as `missing`, which means a row should be
there and is not, so the class is kept explicitly rather than collapsed.

| Worker class | Meaning |
| -- | -- |
| `available` | fresh heartbeat, matching release, full handler set |
| `never_started` | no heartbeat row at all |
| `missing` | a row was expected and is absent |
| `stale` | the row exists and is older than the freshness window |
| `release_mismatch` | the worker runs a different commit or image |
| `capability_mismatch` | the handler set differs from the required six |

None of these report ready. A worker is only `available` when every one of its
own claims matches.

## Running the proofs

```bash
cd apps/web
pnpm smoke:matching-runtime-capabilities -- \
  --expected-commit <full-main-sha> --expected-digest sha256:<digest>
```

```bash
cd apps/web
pnpm exec vitest run scripts/prove-matching-api-retirement.test.ts
```

Both read Postgres. Neither issues an HTTP request.

## Phase B — done on 2026-09-03

The owner decided that the managed database and the droplet stay, then approved
the immutable teardown plan
`1463999c3956b0078daaf3e1f5f9c0e1bf320eb8255d728e41da4bda2bb1ee7f`. Before any
provider effect, both Postgres-sourced commands passed against production with
no HTTP call: queue health `ready` with all five dependencies `available`, and
runtime capabilities `ready` for release `003a0da6` / digest `sha256:4251c864…`
with the six required handlers and a heartbeat six seconds old, matching the
host's own `release-state/active.env`.

The removal ran in the order below, each step verified twice.

| Step | Effect | Verification |
| -- | -- | -- |
| 1. Route | The `matching.over.garden` site block deleted from `/opt/overgarden/Caddyfile`, `caddy reload` exit 0, retired certificate directory moved out of the `overgarden_caddy_data` volume | `meili.over.garden` still `200`; the retired hostname is no longer proxied |
| 2. DNS | The `A matching.over.garden` record deleted from the `over.garden` zone | three public resolvers return nothing, twice; every other record untouched |
| 3. Container | `overgarden-matching-api-1` stopped and removed; the service definition removed from both compose files on the host | `docker ps -a` has no `matching-api`; `compose config --services` lists `matching-worker` (release file) and `meilisearch`, `matching-worker`, `caddy` (legacy file) |

Throughout, `overgarden-matching-worker-1` stayed `healthy`, its heartbeat kept
updating inside the freshness bound, and both operator commands returned `ready`
again after the teardown.

### Rollback (still executable)

The sealed release image remains on the host, and every replaced file was kept
beside its original as `*.ove357-backup-2026-09-03`, with the retired
certificate directory under `/opt/overgarden/ove357-retired/`. Restoring means:
put the route block back and reload Caddy, recreate the `A` record pointing at
the droplet, restore the release compose file, and start the service with
`release-state/active.env`. No heartbeat row, secret, or worker state was
deleted at any point.

## Rollback of phase A

Revert the commit. The endpoints return in the image and the two proofs go back
to HTTP. Phase B's own rollback, above, restores the host resources; the two are
independent and can be applied separately.

## Boundaries

- The worker loop, every job handler, the heartbeat write, its interval, and its
  lease margin are untouched.
- The Meilisearch host and its Caddy route are untouched; only the matching route
  was in scope.
- `MATCHING_SERVICE_TOKEN` and every other secret stay in their platform store.
  No secret is read, moved, or recorded here.
