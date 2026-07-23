# Current-schema account erasure (OVE-192)

Status: active contract  
Authority: Linear OVE-192 + this document + `apps/web/src/server/erasure-schema-coverage.ts`

## Goal

An approved account erasure request finishes against the **current** walking-skeleton schema without FK failure and without leaving the old user id in product, auth, community, social, catalog, analytics, queue, media, or search surfaces.

## Coverage manifest

Machine-readable inventory: `apps/web/src/server/erasure-schema-coverage.ts`  
Version: `ove192.erasure-schema.v1`  
Check: `cd apps/web && pnpm erasure:schema-coverage:check`

Every discovered user-reference path is classified as:

| Disposition | Meaning |
| --- | --- |
| `delete` | Row or payload removed |
| `anonymize` | Rekey to synthetic erased subject or null soft attribution |
| `retain-bounded` | Keep structural evidence without the old user id (e.g. media cleanup jobs until done) |
| `not-account-linkable` | Proven unlinkable to an account (`engagement_likes.anonymous_device_hash`) |

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

## Same-device offline cleanup

`purgeErasedOwnerOfflineStore(ownerUserId)` removes Dexie drafts/mutations/activity and revokes preview object URLs for the erased owner, including cover intents, without requiring a live sign-out fence.

## Verification

```bash
cd apps/web
pnpm erasure:schema-coverage:check
pnpm test src/server/erasure-dry-run.test.ts src/server/erasure-execution.test.ts \
  src/server/erasure-schema-coverage.test.ts \
  src/server/erasure-request-repository.test.ts src/server/erasure-request-access.test.ts \
  src/lib/offline/owner-session-lifecycle.test.ts
pnpm smoke:erasure-workflow -- --environment local --confirm-environment local
```

Smoke refuses non-loopback databases. Production account erasure remains separately approval-gated and is not part of implementation verification.

## Non-claims

This slice does not claim OVE-195 schedule/retention proof, OVE-196 search parity final proof, or live production destructive erasure.
