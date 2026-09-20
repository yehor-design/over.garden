# Workspace failure classes, one injected fault each — 2026-09-20

Status: generated receipt. Regenerate with
`pnpm prove:workspace-failure-classes`. Issue: `OVE-457`. Decision:
`docs/adr/ADR-0023-workspace-resilience.md`.

## What was run

For each class, a real SQLSTATE was raised from a view standing in for
`plant_objects`, and `/garden` was fetched as a **document** — which is what
a hard load is, and the only shape the ADR-0023 defect reproduces in. Each
response had to answer 200, carry the surface's own heading, carry a
`data-section-failure` of that class, leave no Suspense boundary stranded and
error no boundary at all.

`connection_unavailable` is proved separately and across every surface by
`pnpm prove:workspace-resilience`, whose fault is a connection that is not
there — the honest injection for that class.

## Result

Passed 5 of 5 classes.

| Class | SQLSTATE | Status | Own heading | Class rendered | Stranded skeleton | Boundaries completed |
| -- | -- | -- | -- | -- | -- | -- |
| `permission_denied` | `42501` | 200 | yes | yes | none | 3 |
| `schema_missing` | `42P01` | 200 | yes | yes | none | 3 |
| `query_timeout` | `57014` | 200 | yes | yes | none | 3 |
| `serialization_failure` | `40001` | 200 | yes | yes | none | 3 |
| `unknown` | `P0001` | 200 | yes | yes | none | 3 |

Generated against `http://127.0.0.1:3181`.
