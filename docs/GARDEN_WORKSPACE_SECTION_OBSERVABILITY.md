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

## What the class turned out to be

`query_timeout`, measured on the deployed workspace on 2026-09-01.

That **refuted** the hypothesis this contract was written with. The candidate
worth discarding cheaply was a read-model dependency present on `main` and
absent from the deployed database; that would have reported `schema_missing`.
No schema work is warranted.

## The failure is rare, and was not reproduced

| Shape | Samples | Inventory failures |
| -- | -- | -- |
| Sequential warm fetches | 13 | 0 |
| Concurrent bursts of 2, 4, and 8 | 14 | 0 |
| First request against a freshly deployed instance | 2 | 1 |

Twenty-seven warm samples, zero failures. Warm page latency 2205–3426 ms. The
one measured cold page took 4729 ms — about two seconds more — and **its
inventory section still settled in time**.

So a cold instance is a *correlate* of the single failure, not a demonstrated
cause: the first observation came from one, and a second did not reproduce it.
Nothing here is built on that story. It is recorded because it is what was seen,
not because it explains anything yet.

## Why inventory and only inventory

What is measured, and what the repair rests on, is the round-trip asymmetry.

The inventory read costs **four** database round trips where every other section
costs one. `prove-workspace-section-observability` measures this rather than
asserting it: an injected counting executor records four statements for an owner
with objects and two for an owner without, because the object page
short-circuits the dependent pair.

On the serverless pool default of one connection per instance those four do not
overlap — they queue. Every other section pays one round trip; inventory pays
four.

## The budget is a derivation, not a constant

A single deadline shared across sections of unequal work is a unit mismatch, not
a safety margin: it gave the largest section a quarter of the protection the
smallest one got. `gardenWorkspaceSectionDeadlineMs` therefore derives each
section's budget from its own declared round-trip cost, and
`GARDEN_WORKSPACE_SECTION_QUERY_COUNT` is checked against the measured count, so
a section that gains a query gains its budget with it and nobody hand-picks a
number.

This repair does not depend on knowing why the section was slow that once. The
recorded `query_timeout` proves the mismatch bites at least sometimes; how often
is still unmeasured.

The three single-query sections keep exactly the deadline they had. Only
inventory moves, to four times it — and only where the old deadline was already
being exceeded, because a deadline bites only when crossed. No load that already
fits gets slower. The cost is that such a load now spends up to the larger
budget before degrading. A gardener waiting a few seconds for their own object
list is better served than one whose list vanishes and who is told to refresh.

## What is still open

Reducing the four round trips is the structural fix and is **not** done here.
Merging the entry-summary aggregate with the cover-media selection is a real
correctness risk on a read path, and it is worth taking only against a
measurement that justifies it. Raising `DATABASE_POOL_MAX` is the larger lever
on the contention itself, and it is an infrastructure change with a
database-side blast radius that belongs to its own issue with its own
authorization.

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
