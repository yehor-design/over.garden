# Matching worker idle contract

Status: executable runbook
Owner: OVE-356
Migration: `0044_ove356_worker_idle_contract.sql`

## Why this exists

Three defects shared one boundary: what the worker costs while it has nothing to
do, and what it reveals when its work fails.

**It carried a dependency tree nothing imported.** `splink==4.0.16` was declared
and no module under `services/matching/app` imported it. It pulled in pandas,
duckdb, numpy, altair, igraph, and sqlglot, and every image build, cold start,
and security review paid for code that never executed.

**It discovered work by asking.** The loop drained and claimed on a one-second
sleep. At the measured rate — 319 jobs over 56 days, about five a day — that is
roughly 17,000 polls per unit of work and about 173,000 idle queries a day. A
process that must ask cannot be cheap and cannot scale to zero on any platform
that bills for running time.

**It converged the erasure outbox in silence.** `_drain_public_projections`
caught every exception and returned. A drain failing on every attempt was
indistinguishable from an idle one — and a failed drain is exactly what leaves
erased and revoked content in the public index.

## Measured result

| | Before | After |
| -- | -- | -- |
| Resolved virtualenv | 227 MB | **83 MB** |
| Idle queries per day | ~173,000 | ~2,880 |
| Worst-case wake on a lost notification | 1 s | 30 s |
| A drain failing on every attempt | invisible | `drainClass: failing` |

## The wake source

The saved contract authorized a `LISTEN`/`NOTIFY` wake path but authorized
nothing that emits the `NOTIFY`; the repository had no `pg_notify` anywhere. A
listener with no notifier never wakes, so migration `0044` adds the triggers and
the correction is recorded on the issue.

Two things wake the worker, because two things give it work:

| Source | Fires when |
| -- | -- |
| `job_queue` insert | `status = 'pending'` **and** `available_at <= now()` |
| `public_projection_intents` insert | always |
| `public_projection_intents` update | `desired_generation` changed |

The second table matters as much as the first. Without it a revocation would
wait for the fallback, and this change would have made erasure convergence
**slower** — weakening the promise it exists to protect.

Two guards are load-bearing, and the proof removes each one to show it:

- **Future-dated jobs stay silent.** Waking now for work that becomes available
  in an hour only makes the worker claim nothing. The fallback owns delayed work.
- **The drain's own writes stay silent.** The drain writes `applied_state`,
  `applied_generation`, and `status` on every success. Notifying on those would
  wake the worker for its own work, forever. The update trigger fires only when
  `desired_generation` moves.

The payload is deliberately empty. A wake is advisory — the worker drains and
claims on every wake regardless — so the notification never needs to say which
row moved, and a payload could only leak the identity of the row that did.

## The fallback bound

`WORKER_POLL_SECONDS` keeps its name and changes its job: it now bounds the
**fallback**, not the primary loop, and its default moves from `1.0` to `30.0`.

A notification the transport loses costs at most that bound and never a job. The
expiry is not a failure — the loop drains and claims either way.

The heartbeat's reconnect backoff is deliberately **not** this value.
`HEARTBEAT_RECONNECT_BACKOFF_SECONDS` stays at 1 second: stretching it to the
fallback would make readiness slower to recover from a dropped connection, which
is the opposite of what this change is for.

`WORKER_NOTIFY_CHANNEL` defaults to `matching_worker_wake`. `LISTEN` takes no
parameters, so the channel is validated as a plain identifier before it is
interpolated; anything else is refused at startup.

## The drain-failure record

`matching_worker_heartbeats` gains two nullable columns:

| Column | Meaning |
| -- | -- |
| `last_drain_error_class` | a bounded lowercase token, or null |
| `last_drain_error_at` | when that class was recorded, or null |

A check enforces both-or-neither, and the class pattern is the same bounded
lowercase token the queue already uses for `last_error_class`. That check is the
only thing keeping a raw exception message out of the column — and an exception
message can carry a slug, a media URL, or an owner identifier.

`_drain_error_class` reduces an exception to its type name in snake case,
keeping acronyms whole: `OSError` becomes `os_error`, not `o_s_error`.

The loop still never fails on a drain error. A worker that died there would stop
converging everything else too. What changed is that the failure is written
down, and a later success clears it, so the row describes the **latest** attempt
rather than the worst one ever seen.

Readiness surfaces it as `dependencies.worker.drainClass`:

| Class | Meaning |
| -- | -- |
| `converging` | a heartbeat exists and records no drain error |
| `failing` | a heartbeat exists and records one |
| `unknown` | no heartbeat row — **not** a synonym for healthy |

`unknown` is honest rather than optimistic. Reporting `converging` when nobody
has said either way would turn missing evidence into a health claim.

## Running the proof

```bash
cd apps/web
pnpm exec tsx scripts/prove-worker-idle-contract.ts --mode verify --inject-notification-timeout
```

Hermetic, needs no database. Proves WAIT-01: a notification that never arrives
leaves the worker on its bounded fallback with **Worker status** and **Stop
worker** usable.

```bash
cd apps/web
pnpm exec tsx scripts/prove-worker-idle-contract.ts --mode verify --database
```

Creates its own disposable database, applies migrations `0001`, `0011`, and
`0044`, and drops it. It never writes to the database whose connection string it
borrows. It uses two connections on purpose — one listens, one writes — which is
also how the real worker and the app relate.

The Python half is proven by `uv run --frozen pytest` in `services/matching`.

## What the proof actually checks

| Claim | How |
| -- | -- |
| The trigger delivers | An available job wakes the listener inside the budget |
| The payload is empty | Every received notification carries `""` |
| Delayed work stays with the fallback | A future-dated job produces no notification |
| Revocations wake immediately | A new intent wakes the listener |
| The drain cannot wake itself | The drain's own write produces no notification |
| The class column takes a class | `os_error` is accepted and read back |
| ...and refuses a message | A raw message is rejected by the check |
| ...and refuses a half record | A class without a time is rejected |

## The proof is not vacuous

| Mutation | Result |
| -- | -- |
| Removed the `desired_generation` guard from the update trigger | `the_drain_woke_itself_and_would_never_stop` |
| Removed the availability guard from the insert trigger | `a_future_dated_job_woke_the_worker` |

## Rollback

```bash
WORKER_POLL_SECONDS=1.0
```

That restores today's cadence without a code change: the listener still
registers, but the fallback fires every second, which is exactly the old loop.

The dependency removal and the recorded failure class stay — neither is part of
the wake mechanism, and reverting them would give back cost and silence for
nothing.

## Boundaries

- Every supported job kind keeps its exact payload contract, attempt bound,
  dead-letter transition, and effect. The wake mechanism changes **when** work is
  discovered, never what the work does.
- `drain_public_projection_intents` keeps its lease, its generation check, and
  its per-intent `last_error_class` recording. Only the outer swallow changed.
- The heartbeat thread, its ten-second interval, and its three-times lease
  margin are unchanged.
- RapidFuzz, PyICU, and CyrTranslit remain declared and imported. Only the
  package nothing imported was removed, and `AGENTS.md` and
  `docs/TECH_STACK_DECISIONS.md` were corrected in the same change so the canon
  and the code agree.
- The matching API container is untouched; retiring it is a separate boundary.
