# EPPO observed capture proof — 2026-09

Status: receipt for one completed capture. Re-read it with the verify command
at the end of this page; the capture itself is immutable and is never re-run to
reproduce this document.

Issue: OVE-375. Authority: `docs/adr/ADR-0016-stable-registry-observed-capture.md`
and `docs/STABLE_REGISTRY.md`. Procedure: `docs/EPPO_OBSERVED_CAPTURE.md`.

## What this is, and what it is not

This is an **OverGarden observed capture**: a bounded, digest-closed observation
of the documented EPPO API v2 list, overview, names, and taxonomy surfaces
during one recorded window. EPPO publishes no versioned release artifact, so
this is not an EPPO release and implies no EPPO endorsement. The EPPO Open Data
Licence applies and requires attribution.

Every row it wrote is quarantined source evidence. It created no catalog
identity, no release, no product eligibility, no public page, and no search
document. It ran against a loopback database; production was not touched.

## What was run

```
capture id           df3852ea-3233-4883-8886-92d9e68f5193
capture tool         d1edeee025c5dea7ce707eb2653bdec16f23aa39
window (UTC)         2026-09-03T18:19:19.048Z → 2026-09-04T02:53:54.814Z
elapsed              8 h 34 m 36 s
provider concurrency 1
request timeout      15000 ms
max attempts         2
openapi sha256       c76c883dfc251ffcc026f85ae18b65f0dacd0e0f844c6f92ee19199f0dd42d13
licence sha256       ecb6d92ce35c7e5bafd1b13d974b4774d2d06909a858f0d2d94fdf9c9550d812
```

The command ran from a detached git worktree pinned at the capture tool
revision, so that `main` could move during the run without invalidating a
resume. It did move — twice — and the capture did not notice.

## Closure

| Claim                                        | Value                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Ordered list total, start and end            | 129,214 / 129,214                                                          |
| Full ordered-inventory digest, start and end | `1543936bc32592fb99da455a4ad686254f591c58ac8bf8bc76b900052e02e846` (equal) |
| Inventory pages                              | 130                                                                        |
| Endpoint units                               | 387,642                                                                    |
| Normalized source records                    | 129,214                                                                    |
| Manifest digest                              | `23f6a5658e3e337c339be151225bff3657318b4424a8026d43dee5150e69cd8a`         |
| Product mutations                            | 0                                                                          |
| Search mutations                             | 0                                                                          |
| Zero-product fingerprint                     | verified — identical before and after                                      |

An independent `--mode verify` read-back reproduced the manifest digest byte for
byte from the database alone, without contacting the provider.

## Terminal unit classes

| Class            | Count   |
| ---------------- | ------- |
| `captured`       | 121,777 |
| `source_only`    | 243,554 |
| `not_applicable` | 22,311  |
| `forbidden`      | 0       |
| `failed`         | 0       |
| `pending`        | 0       |
| `in_progress`    | 0       |

121,777 + 243,554 + 22,311 = 387,642. Exactly one of the three detail responses
per active identifier — `taxonomy` — carried only public field names; `overview`
and `names` each carried at least one source-only field, which is what puts two
thirds of the units in `source_only`.

## Identifier classes

| Class                           | Count   | Detail requests                 |
| ------------------------------- | ------- | ------------------------------- |
| `documented_eppo_code` (active) | 121,777 | 3 each                          |
| `inactive_eppo_identifier`      | 6,329   | none — terminal `not_requested` |
| `legacy_schema_exception`       | 1,108   | none — terminal `not_requested` |

Of the legacy set, 1,048 are bounded alphanumeric values whose length falls
outside the current OpenAPI constraint and 60 use the observed legacy separators
`.`, `!`, `:`, or `/`. Observed code lengths run 1–8 characters.

Against the 2026-08-25 shape read (129,211 rows: 121,774 / 6,329 / 1,108) the
corpus moved by exactly three active identifiers in nine days. The inactive and
legacy counts are unchanged. The window held: the provider's declared total was
probed every thirty minutes for the length of the run and never left 129,214.

## Rights vectors

| Class           | Leaf count |
| --------------- | ---------- |
| `source_public` | 1,704,802  |
| `source_only`   | 387,642    |
| `forbidden`     | 0          |
| `unknown`       | 121,777    |

**Zero forbidden leaves.** No response in the capture carried a field name
matching the restricted family — coordinates, GPS, altitude, occurrence, media,
photograph, specimen, or rights holder.

**The `unknown` count is one field, and it needs a decision.** All 121,777
unknown leaves are the same field: `infos` on the `overview` response. It is a
free-text value, non-null for 36,504 identifiers. Because it is unclassified it
was not copied into `allowed_projection` or `source_only_fields`; it exists only
inside the raw evidence in the source layer. That is the intended fail-closed
default, not an omission — but `rights_cleared_source_public`, the next
admission gate, cannot pass this field without an explicit rights decision.
Free text of unrecorded provenance must not reach a public projection by
inheritance.

## Two defects this run exposed

Both were fixed and merged before or during the run, and both were about the
run being possible at all rather than about its evidence.

1. **The transport attempt budget was a lifetime quota per identifier.** Two
   transient failures on one unit — a roaming interface, a renewed lease, a
   briefly loaded upstream — failed the whole capture, and a failed capture is
   not resumable. Over 365,331 serial requests that made completion unlikely.
   The budget is now per invocation: a unit whose attempts were spent on a
   transport class was never observed, so the run pauses and one more resume
   returns exactly those units with a fresh budget. Evidence-level refusals
   still fail closed. Proved by `--fixture transport`.

2. **Every claim read the whole run.** The claim index led with
   `(capture_id, state, …)`, so a claim admitting two states could not take its
   ordering from it, and the planner read every remaining unit and sorted the
   set to return one row — 33.089 ms and 11,299 buffer hits per unit, degrading
   as the heap grew. Migration `0048` adds the ordering index: 0.073 ms and 7
   buffer hits. The live run went from 6.2 to 11.9 units per second, and the
   projected sixteen-hour run finished in eight and a half.

Neither changed what the capture records, only whether it could finish.

## Environment caveat

The run used the local scratch database. Its schema is behind `main` outside the
capture tables — `pnpm local:bootstrap` is blocked on that volume, so migrations
that dropped columns after `0034` were never applied there. Nothing the capture
reads or writes is affected: `0023` and `0042` are present, and every table in
the zero-product fingerprint exists and was unchanged across the window.

Migration `0048` is applied on that database and merged to `main`. It is **not**
applied to production; no capture runs there, and a production schema change is
a separate approval.

## How to re-read this

```bash
cd apps/web
pnpm eppo:observed-capture -- --mode verify --environment local --confirm-environment local \
  --concurrency 1 --request-timeout-ms 15000 --max-attempts 2 \
  --capture-id df3852ea-3233-4883-8886-92d9e68f5193
```

The command reads the database only. It re-derives both inventory digests, the
normalized source-record count, the terminal and rights vectors, the manifest
digest, and the zero-product fingerprint, and refuses to report `completed`
unless all of them still close.

## What this does not yet give the product

This capture satisfies the first admission gate, `captured`, and nothing beyond
it. `rights_cleared_source_public`, `identity_resolved`, `release_approved`, and
`product_eligible` each still need their own evidence. No gardener can see any
of these 129,214 identifiers until a Foundation release is built, approved, and
activated — and that release is assembled from corroborating sources too, with
Catalogue of Life as the canonical accepted-name authority.
