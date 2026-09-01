# Garden workspace section observability

Status: current implementation contract
Owner: OVE-360
Instrument: `apps/web/scripts/prove-workspace-section-observability.ts`

## Why this exists

The garden workspace loads four sections independently through
`Promise.allSettled`, so a slow or failing dependency degrades its own section
and leaves the rest serving. That design is correct and unchanged.

What was wrong is that the degradation was **anonymous**. `resultSection`
mapped every rejection onto a bare `{ status: "error" }` and kept nothing of the
reason, so a permission refusal, a missing relation, a timeout, and an
unreachable database all rendered as the same em dash on a count.

The platform log could not help either. The page renders its degraded state and
returns its normal status, so a deployment's runtime log records a success for
exactly the request that failed. On 2026-09-01 the production workspace showed
two spaces and eight recent events beside an empty object count, while the
runtime log for the same two-hour window recorded only success statuses.

An operator therefore had no way to tell which of four candidate queries had
rejected, and neither did the repository: the reason was destroyed at the first
return on the way back.

## The closed set

`GARDEN_WORKSPACE_FAILURE_CLASSES` is the whole vocabulary. A section that
fails carries exactly one member and nothing else.

| Class | Cause |
| -- | -- |
| `permission_denied` | `42501` insufficient privilege |
| `schema_missing` | `42P01`, `42703`, `42883`, `42704` — an undefined table, column, function, or object |
| `query_timeout` | `57014`, `57P05`, an `AbortError`, or the section's own deadline |
| `connection_unavailable` | the `08…` connection family, `57P01`, `57P03`, and the `ECONN…` system codes |
| `serialization_failure` | `40001` serialization failure, `40P01` deadlock |
| `unknown` | anything the classifier has never seen |

`unknown` is a real member, not a fallback to be widened later. A cause with no
recognised code must report `unknown` rather than guess, and a new cause earns a
new mapping only with evidence.

## What is never recorded

`classifyGardenWorkspaceFailure` reads only a code. The rejection itself is
never returned, logged, or attached to the read model, because a driver error
carries the failing statement and its bound parameters, and those may contain
journal content.

`describeGardenWorkspaceSections` produces the class-only receipt: the section
name, its status, and its class. No query, parameter, connection string, row,
coordinate, or owner identifier appears in it.

## How an operator reads a degraded workspace

The failed section renders `data-section-failure="<class>"` on its own
`<section>` element. The class reaches an operator as an attribute and never as
rendered copy, so the `uk`, `bg`, and `ru` strings are unchanged and no locale
gains a machine-readable code.

```
# read the class from the deployed workspace
document.querySelector('[data-section-failure]')?.dataset.sectionFailure
```

## Running the proof

```bash
cd apps/web
pnpm exec vitest run scripts/prove-workspace-section-observability.test.ts
```

```bash
cd apps/web
pnpm exec tsx scripts/prove-workspace-section-observability.ts --mode verify --inject-inventory-query-timeout
```

Both are hermetic. The four sources are injected stubs, so no database,
network, or credential is touched, and the proof exercises the real
`loadGardenWorkspace` rather than a copy of its logic.

`scripts/neutralise-server-only.ts` exists only so the proof can import the real
repository under Node; it resolves the `server-only` guard to an empty module
exactly as `vitest.config.ts` does for the suites, and it must never be imported
from application code.

## What this issue does not settle

Which of the four candidate queries rejects in production is still unmeasured.
That is the point: the class had to become observable before the fault could be
named. The candidates are `buildGardenWorkspaceInventorySummaryQuery` and, in
`listMyPlantObjects`, `buildMyPlantObjectsQuery`,
`buildMyPlantObjectEntrySummariesQuery`, and
`buildMyPlantObjectCoverMediaQuery`.

Read the recorded class from the deployed workspace before proposing a repair.
A `schema_missing` and a `query_timeout` call for entirely different work, and
guessing between them is what this contract exists to prevent.
