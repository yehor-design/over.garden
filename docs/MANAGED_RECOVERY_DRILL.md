# Managed Recovery Drill (OVE-201)

Status: done on main (live disposable PITR drill complete)  
Policy version: `ove201.restore-readiness.v1`  
Date: 2026-07-24

## Predeclared recovery targets (locked)

| Metric | Target | Mechanism |
| --- | --- | --- |
| RPO | ≤ 1 hour | DigitalOcean Managed PostgreSQL PITR (7-day window; registry-confirmed) |
| RTO | ≤ 4 hours | Wall-clock from disposable fork start until restore-readiness + ephemeral Meili zero-gap |

Expected measured RTO band: ~30–60 minutes on first manual drill. The 4h ceiling is intentional margin. A miss against these targets is a blocker or a documented product/ops decision — **thresholds are not rewritten after seeing results**.

## Source and target classes

- Source cluster class: `overgarden-postgres-prod-fra1` (FRA1, Postgres 18). Resolve live UUID via `doctl databases list`; never use production UUID as a restore *target*.
- Disposable target name pattern: `overgarden-pitr-drill-YYYYMMDD` only.
- Connectivity: private/restricted, TLS with CA, time-bounded. Credentials stay in env only.
- Teardown: separate exact disposable cluster-ID confirmation immediately after green checks (`pnpm teardown:restore-drill -- --confirm-delete-cluster-id … --execute`).

## Maintenance gate

1. Inspect live maintenance window (`pending` boolean).
2. Apply on-demand only after founder confirms the exact moment: `doctl databases maintenance-window install <production-id>` (API `PUT /v2/databases/{id}/install_update`).
3. If DO cannot install on-demand: record launch blocker (owner: Yehor, date: before launch) and continue the drill against the current cluster state.

## Fail-closed tooling

```bash
cd apps/web
pnpm smoke:restore-readiness -- \
  --environment recovery-drill \
  --confirm-environment recovery-drill \
  --confirm-cluster-id <disposable-uuid> \
  --production-cluster-id <production-uuid> \
  --disposable-cluster-name overgarden-pitr-drill-YYYYMMDD \
  --actual-rpo-ms <ms> \
  --actual-rto-ms <ms>

# Ephemeral loopback Meili + fork DATABASE_URL only (never production Meili)
pnpm smoke:public-index-parity -- \
  --environment recovery-drill \
  --confirm-environment recovery-drill \
  --confirm-cluster-id <disposable-uuid> \
  --production-cluster-id <production-uuid> \
  --mode classify
```

Any command whose confirm ID, cluster name, or `DATABASE_URL` host class resolves to production must refuse. Recovery-drill Meili must be loopback.

## Evidence rules

Allowed: timestamps, engine/schema versions, constraint/index booleans, bounded counts, effective-cover fingerprint hash, durations, RPO/RTO pass class, cleanup boolean.  
Forbidden: credentials, CA bodies, DB URLs, row IDs, emails, journal text, media keys, exact location, IP, user agent, raw backup contents.

Redacted live artifact: [`docs/managed-recovery-evidence-redacted.json`](managed-recovery-evidence-redacted.json).

## Live drill log (2026-07-24)

```
drill_date_utc: 2026-07-24
maintenance_pending_before: true
maintenance_action: applied
maintenance_founder_confirm_utc: 2026-07-24T11:57:16Z
post_maintenance_status: online (pending=false; backups=8; matching/site health 200)
selected_pitr_timestamp_utc: 2026-07-24 11:55:46 +0000 UTC
fork_started_utc: 2026-07-24T12:00:46Z
disposable_cluster_name: overgarden-pitr-drill-20260724
disposable_cluster_id_class: uuid_confirmed_non_production
fork_online_utc: 2026-07-24T12:07:37Z
restore_readiness_ok: true
meili_parity_zero_gap: true
actual_rpo_ms: 300000
actual_rto_ms: 662000
rpo_pass: true
rto_pass: true
teardown_confirmed_utc: 2026-07-24T12:13:10Z
teardown_deleted: true
production_available_throughout: true
```

## Cadence

Next drill: after any schema migration that touches journal/cover/identity/queue/search eligibility, or at least once before public launch if older than 30 days.
