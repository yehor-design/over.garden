# Current-schema account erasure (OVE-192)

Status: active contract  
Authority: Linear OVE-192 + this document + `apps/web/src/server/erasure-schema-coverage.ts`

## ADR-0018 successor posture

ADR-0018 supersedes refusal-first behavior only when authorization, ownership,
or session state is unresolved: the request serves with the accepted
cross-account-read exposure, and OVE-332 owns that runtime cutover. Positively
resolved erasure remains canonical. The returning-device local-state bridge
below remains read-only under ADR-0017 and is owned by OVE-322; it must use the
ADR-0018 posture wording when its saved contract is reconciled by OVE-341.

## Goal

An approved account erasure request finishes against the **current** walking-skeleton schema without FK failure and without leaving the old user id in product, auth, community, social, catalog, analytics, queue, media, or search surfaces.

## Coverage manifest

Machine-readable inventory: `apps/web/src/server/erasure-schema-coverage.ts`  
Version: `ove192.erasure-schema.v1`  
Check: `cd apps/web && pnpm erasure:schema-coverage:check`

Every discovered user-reference path is classified as:

| Disposition            | Meaning                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `delete`               | Row or payload removed                                                                |
| `anonymize`            | Rekey to synthetic erased subject or null soft attribution                            |
| `retain-bounded`       | Keep structural evidence without the old user id (e.g. media cleanup jobs until done) |
| `not-account-linkable` | Proven unlinkable to an account (`engagement_likes.anonymous_device_hash`)            |

Dry-run and execution must both own every classified path. Drift fails CI.

## Storage saga

1. Capture media object keys inside the DB transaction.
2. Enqueue durable `job_queue` rows (`queue_name=erasure`, `kind=erasure_media_object_delete`) with requestId/bucket/objectKey only.
3. Clear `cover_media_asset_id`, delete media rows, rekey/anonymize dependents, scrub **all** `job_queue` statuses that still contain the old user id.
4. Mark request `handled_status=cleanup_pending` and delete the auth user.
5. Commit.
6. Delete R2/MinIO objects idempotently; mark cleanup jobs `done`.
7. Promote `handled_status` to `completed` only after controlled media deletes finish.

Search unindex remains recoverable via `journal_entry_unindex` jobs that use the synthetic owner id.

## Community restrict FKs

Do **not** weaken:

- `community_contributions.removed_by_user_id`
- `community_contribution_reports.resolved_by_user_id`
- `community_moderation_audit_log.actor_user_id`

Rekey those columns to the synthetic erased subject before deleting the auth user.

## OVE-203 / OVE-207

- Public profiles and handle registry cascade with the user row and are counted in dry-run.
- Journal cover (`cover_media_asset_id`, `usage_role=cover_only`) is cleared/deleted with media object cleanup; clearing only the pointer is insufficient.

## Browser-local retirement and cleanup

ADR-0017 forbids new durable browser journal writes. OVE-323 removed the offline
runtime and the explicit erasure-page device control after OVE-322 completed its
temporary migration window. The only current successor is
`apps/web/src/lib/retirement/known-client-storage.ts`: a dependency-free,
name-only returning-device boundary that may enumerate exact known database,
service-worker, and cache names and delete only targets whose OVE-322 control
state is terminal. It never hydrates journal content or writes server data.

Server-side account erasure cannot reach IndexedDB on an absent or different
browser and therefore must not claim that browser-local work was deleted.
An unresolved legacy owner binding is retained fail-closed and reported by the
returning-device boundary; it is not a remote-erasure receipt.

Historical implementation status (2026-08-13): OVE-288 added a separate
signed-in current-device control; ADR-0017 retired it, OVE-323 removed its
route, server owner, and current-device action, and ADR-0022 deleted the last
browser storage probe and banner. `docs/OFFLINE_RETIREMENT_PROVENANCE.md`
keeps the analytics receipt. Ordinary sign-out,
account switching, and submission of the non-destructive server erasure request
do not claim to clean an unreachable browser.

Implementation status (2026-08-21): the reduced OVE-323 boundary is non-blocking
for guests and authenticated users, keeps safe sign-out available when a session
exists, and deletes no unresolved owner database. It may not clear cookies,
session state, unrelated origin storage, another-owner records, or an
unreachable browser.

## Verification

```bash
# Current server erasure and returning-device successor verification.
cd apps/web
pnpm erasure:schema-coverage:check
pnpm test src/server/erasure-dry-run.test.ts src/server/erasure-execution.test.ts \
  src/server/erasure-schema-coverage.test.ts \
  src/server/erasure-request-repository.test.ts src/server/erasure-request-access.test.ts \
  src/lib/retirement/known-client-storage.test.ts \
  src/lib/retirement/legacy-device-retirement.test.ts
pnpm smoke:erasure-workflow -- --environment local --confirm-environment local
```

Smoke refuses non-loopback databases. Production account erasure remains separately approval-gated and is not part of implementation verification.

## Non-claims

This slice does not claim OVE-195 schedule/retention proof, OVE-196 search parity final proof, or live production destructive erasure.
