# Matching API retirement

Status: executable runbook
Owner: OVE-357
Scope of this document: **phase A only** — the repository half. The live
container, its reverse-proxy route, and its DNS record are still there.

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

## Phase B — not done

**The live container, its Caddy route, and the public matching DNS record still
exist.** Removing them is a maintainer-approved provider effect with its own
plan digest, and it has not been performed.

Until it is:

- `matching-api` may still be running on the host and answering;
- `https://matching.over.garden/*` may still resolve and serve;
- `docs/INFRASTRUCTURE_REGISTRY.md` keeps its live-state entries, which remain
  accurate.

Nothing in phase A depends on phase B. The worker, its heartbeat, its handler
set, and every job contract are unchanged, and no product route calls the retired
service, so the repository half is complete and safe on its own.

Phase B is also the part that depends on **where the host lives**. It is the one
piece of this issue a hosting decision touches.

## Rollback

Revert the commit. The endpoints return, the two proofs go back to HTTP, and
nothing on the host has to change — because nothing on the host was changed.

## Boundaries

- The worker loop, every job handler, the heartbeat write, its interval, and its
  lease margin are untouched.
- The Meilisearch host and its Caddy route are untouched; only the matching route
  is in scope, and only in phase B.
- `MATCHING_SERVICE_TOKEN` and every other secret stay in their platform store.
  No secret is read, moved, or recorded here.
