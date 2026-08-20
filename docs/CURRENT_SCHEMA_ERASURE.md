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

ADR-0017 forbids new durable browser journal writes. OVE-322 owns the only
successor: an exact-owner, read-only retirement bridge for legacy device state.
The bridge may migrate or delete verified residue on the returning physical
target, but it cannot accept a new local write or turn an unreachable device
into an erasure-success claim. Its exact transfer, discard, foreign-owner
retention, and two-read absence rules live in
`docs/LEGACY_DEVICE_DATA_RETIREMENT.md`.

Server-side account erasure cannot reach IndexedDB on an absent or different
browser and therefore must not claim that browser-local work was deleted.
`purgeErasedOwnerOfflineStore(ownerUserId)` remains a bounded compatibility
helper for exact-owner residue in the known legacy `overgarden-offline`
database; it is not a remote-erasure receipt and has no ordinary product caller.

Historical implementation status (2026-08-13): OVE-288 added the separate
signed-in current-device control documented in `docs/OFFLINE_OWNER_VAULT.md`.
ADR-0017 makes that document non-operative except as OVE-322 retirement
provenance. The existing action resolves the current
authoritative owner binding, fences and deletes only that physical target,
removes exact-owner legacy rows (including synced/privacy-blocked residue), and
shows confirmation only after an independent target-nonexistence check and
zero-row legacy read-back. Ordinary sign-out, account switching, and submission
of the non-destructive server erasure request delete no browser vault.

Implementation status (2026-08-21): OVE-322 mounts a non-blocking retirement
banner only after exact authenticated session convergence, keeps safe sign-out
available, and performs no browser deletion before authoritative server
verification. The explicit `/erasure` current-device action remains a separate
exact-device cleanup control during this temporary window. Neither surface may
clear cookies, session state, unrelated origin storage, another-owner records,
or an unreachable browser.

## Verification

```bash
# Historical retirement-window verification; OVE-322 re-pins this read-only proof.
cd apps/web
pnpm erasure:schema-coverage:check
pnpm test src/server/erasure-dry-run.test.ts src/server/erasure-execution.test.ts \
  src/server/erasure-schema-coverage.test.ts \
  src/server/erasure-request-repository.test.ts src/server/erasure-request-access.test.ts \
  src/lib/offline/owner-session-lifecycle.test.ts \
  src/lib/offline/owner-vault-migration.test.ts
pnpm smoke:erasure-workflow -- --environment local --confirm-environment local
```

Smoke refuses non-loopback databases. Production account erasure remains separately approval-gated and is not part of implementation verification.

## Non-claims

This slice does not claim OVE-195 schedule/retention proof, OVE-196 search parity final proof, or live production destructive erasure.
