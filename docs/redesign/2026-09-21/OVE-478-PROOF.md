# OVE-478 — the redesign, integrated, verified and released

Receipt for [OVE-478](https://linear.app/overgarden/issue/OVE-478/integrate-verify-and-release-the-complete-product-redesign),
the last task of OVE-474. Everything below is measured **locally** — a
production build of the tested tree, a real PostgreSQL 18, Meilisearch and an
S3 stand-in, Chromium 141 — unless it says **production**, and a local figure is
never offered as a production one.

- **Tested tree:** branch `claude/fervent-mendel-hnadyo`, on `main` at
  `1aa34d6f` (OVE-469, the last program merge). Release facts — PR, CI runs,
  merge commit, deployment — are in [Release](#release).
- **Evidence:** `docs/redesign/2026-09-21/ove-478/`. The sweeps write their
  rows to `apps/web/test-results/route-families/` and
  `apps/web/test-results/writing-journeys/` on every gate run; the copies here
  are from the run this receipt cites.

{{SUMMARY}}

## Criterion by criterion

{{CRITERIA}}

## Residuals, classified

{{RESIDUALS}}

## Validation

{{VALIDATION}}

## Release

{{RELEASE}}
