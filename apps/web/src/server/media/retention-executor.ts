import "server-only";

import { sql } from "kysely";

import { db } from "@/db";
import type { JsonValue } from "@/db/types";
import { drainMediaLifecycleQueue } from "@/server/media/media-lifecycle-consumer";

/** Local literals keep the job-queue producer scanner deterministic. */
const MEDIA_LIFECYCLE_QUEUE = "media_lifecycle";

export const RETENTION_POLICY_VERSION = "ove349.retention.v2" as const;

const ANALYTICS_EXPIRE_MONTHS = 13;
const AUDIT_EXPIRE_YEARS = 1;
const BATCH_LIMIT = 100;

export type RetentionMode = "dry_run" | "execute";

export interface RetentionSelectionReport {
  policyVersion: typeof RETENTION_POLICY_VERSION;
  mode: RetentionMode;
  analyticsExpireClass: CountClass;
  adminAuditExpireClass: CountClass;
  communityAuditExpireClass: CountClass;
  erasureEvidenceExpireClass: CountClass;
  danglingCoverPointerClass: CountClass;
  orphanCoverOnlyClass: CountClass;
  pendingRevokeJobsClass: CountClass;
  /** OVE-353: tombstones past their horizon, before terminal-receipt gating. */
  journalTombstoneDueClass: CountClass;
  /** OVE-353: tombstones this pass actually removed. Absent in dry run. */
  journalTombstonePurgedClass?: CountClass;
  failureClass: "none" | "partial" | "failed";
  drainedLifecycle?: {
    claimed: number;
    completed: number;
    failed: number;
    dead: number;
  };
}

type CountClass = "empty" | "low" | "elevated" | "high";

interface RetentionSelection {
  analyticsExpireCount: number;
  adminAuditExpireCount: number;
  communityAuditExpireCount: number;
  erasureEvidenceExpireCount: number;
  danglingCoverPointerCount: number;
  orphanCoverOnlyCount: number;
  pendingRevokeJobsCount: number;
  journalTombstoneDueCount: number;
}

export async function runRetentionWorkflow(
  mode: RetentionMode,
): Promise<RetentionSelectionReport> {
  const startedAt = new Date();
  await acquireRetentionLeaderLock();

  try {
    const selection = await collectRetentionSelection();
    let drainedLifecycle:
      | RetentionSelectionReport["drainedLifecycle"]
      | undefined;
    let failureClass: RetentionSelectionReport["failureClass"] = "none";
    let journalTombstonePurgedCount: number | undefined;

    if (mode === "execute") {
      try {
        await executeRetentionSelection(selection);
        drainedLifecycle = await drainMediaLifecycleQueue(BATCH_LIMIT);
        if (drainedLifecycle.failed > 0 || drainedLifecycle.dead > 0) {
          failureClass = "partial";
        }
        // After the drain, so a revoke receipt that became terminal in this
        // same pass can release its tombstone without waiting a whole cycle.
        journalTombstonePurgedCount =
          await purgeDueJournalTombstones(BATCH_LIMIT);
      } catch {
        failureClass = "failed";
      }
    }

    const report: RetentionSelectionReport = {
      policyVersion: RETENTION_POLICY_VERSION,
      mode,
      analyticsExpireClass: countClass(selection.analyticsExpireCount),
      adminAuditExpireClass: countClass(selection.adminAuditExpireCount),
      communityAuditExpireClass: countClass(
        selection.communityAuditExpireCount,
      ),
      erasureEvidenceExpireClass: countClass(
        selection.erasureEvidenceExpireCount,
      ),
      danglingCoverPointerClass: countClass(
        selection.danglingCoverPointerCount,
      ),
      orphanCoverOnlyClass: countClass(selection.orphanCoverOnlyCount),
      pendingRevokeJobsClass: countClass(selection.pendingRevokeJobsCount),
      journalTombstoneDueClass: countClass(selection.journalTombstoneDueCount),
      journalTombstonePurgedClass:
        journalTombstonePurgedCount === undefined
          ? undefined
          : countClass(journalTombstonePurgedCount),
      failureClass,
      drainedLifecycle,
    };

    await db
      .insertInto("media_lifecycle_retention_runs")
      .values({
        policy_version: RETENTION_POLICY_VERSION,
        mode,
        status:
          failureClass === "none"
            ? "ok"
            : failureClass === "partial"
              ? "partial"
              : "failed",
        failure_class: failureClass === "none" ? null : failureClass,
        selection: {
          analyticsExpireCount: selection.analyticsExpireCount,
          adminAuditExpireCount: selection.adminAuditExpireCount,
          communityAuditExpireCount: selection.communityAuditExpireCount,
          erasureEvidenceExpireCount: selection.erasureEvidenceExpireCount,
          danglingCoverPointerCount: selection.danglingCoverPointerCount,
          orphanCoverOnlyCount: selection.orphanCoverOnlyCount,
          pendingRevokeJobsCount: selection.pendingRevokeJobsCount,
          journalTombstoneDueCount: selection.journalTombstoneDueCount,
          journalTombstonePurgedCount: journalTombstonePurgedCount ?? null,
        } satisfies JsonValue,
        started_at: startedAt,
        finished_at: new Date(),
      })
      .execute();

    return report;
  } finally {
    await releaseRetentionLeaderLock();
  }
}

async function collectRetentionSelection(): Promise<RetentionSelection> {
  const analyticsCutoff = monthsAgo(ANALYTICS_EXPIRE_MONTHS);
  const auditCutoff = yearsAgo(AUDIT_EXPIRE_YEARS);

  const [
    analyticsExpireCount,
    adminAuditExpireCount,
    communityAuditExpireCount,
    erasureEvidenceExpireCount,
    danglingCoverPointerCount,
    orphanCoverOnlyCount,
    pendingRevokeJobsCount,
    journalTombstoneDueCount,
  ] = await Promise.all([
    scalarCount(
      sql`select count(*)::int as count from analytics_events where created_at < ${analyticsCutoff}`,
    ),
    scalarCount(
      sql`select count(*)::int as count from admin_role_audit_log where created_at < ${auditCutoff}`,
    ),
    scalarCount(
      sql`select count(*)::int as count from community_moderation_audit_log where created_at < ${auditCutoff}`,
    ),
    scalarCount(
      sql`select count(*)::int as count from erasure_requests where status = 'handled' and handled_at is not null and handled_at < ${auditCutoff}`,
    ),
    scalarCount(sql`
      select count(*)::int as count
      from journal_entries je
      where je.cover_media_asset_id is not null
        and not exists (
          select 1
          from media_assets ma
          where ma.id = je.cover_media_asset_id
            and ma.owner_user_id = je.owner_user_id
            and ma.derivative_key is not null
            and ma.revoked_at is null
        )
    `),
    scalarCount(sql`
      select count(*)::int as count
      from media_assets ma
      where ma.usage_role = 'cover_only'
        and ma.derivative_key is not null
        and ma.revoked_at is null
        and ma.journal_entry_id is not null
        and not exists (
          select 1
          from journal_entries je
          where je.id = ma.journal_entry_id
            and je.cover_media_asset_id = ma.id
        )
    `),
    scalarCount(sql`
      select count(*)::int as count
      from job_queue
      where queue_name = ${MEDIA_LIFECYCLE_QUEUE}
        and status in ('pending', 'processing', 'failed')
    `),
    scalarCount(sql`
      select count(*)::int as count
      from journal_entries je
      where je.lifecycle_state = 'deleted_retention'
        and je.purge_after is not null
        and je.purge_after <= now()
    `),
  ]);

  return {
    analyticsExpireCount,
    adminAuditExpireCount,
    communityAuditExpireCount,
    erasureEvidenceExpireCount,
    danglingCoverPointerCount,
    orphanCoverOnlyCount,
    pendingRevokeJobsCount,
    journalTombstoneDueCount,
  };
}

/**
 * OVE-353 / INV-04. Physically removes journal tombstones whose seven-day
 * horizon has passed *and* whose derived effects are terminal.
 *
 * Every predicate is re-evaluated inside this statement rather than trusted
 * from the earlier selection pass, so a tombstone whose media revoke or search
 * removal is still outstanding is simply left hidden and retried next pass. It
 * is never made visible again and never purged early. `media_assets` cascades
 * from this delete, which is exactly why the revoke receipt must already be
 * terminal — otherwise the purge would destroy the record of what to revoke.
 */
export function buildDueJournalTombstonePurgeQuery(limit: number) {
  return sql<{ id: string }>`
    with due as (
      select je.id
      from journal_entries je
      where je.lifecycle_state = 'deleted_retention'
        and je.purge_after is not null
        and je.purge_after <= now()
        and not exists (
          select 1
          from media_assets ma
          where ma.journal_entry_id = je.id
            and (ma.revoked_at is null or ma.public_unreachable_at is null)
        )
        and not exists (
          select 1
          from public_projection_intents ppi
          where ppi.entity_kind = 'journal_entry'
            and ppi.entity_id = je.id
            and not (
              ppi.status = 'applied'
              and ppi.applied_state = 'absent'
              and ppi.applied_generation = ppi.desired_generation
            )
        )
        -- community_contributions is ON DELETE RESTRICT. Proving closure here
        -- keeps one stale dependent row from failing the whole batch.
        and not exists (
          select 1
          from community_contributions cc
          where cc.journal_entry_id = je.id
        )
      order by je.purge_after
      limit ${limit}
      for update of je skip locked
    )
    delete from journal_entries victim
    using due
    where victim.id = due.id
    returning victim.id as id
  `;
}

async function purgeDueJournalTombstones(limit: number): Promise<number> {
  const purged = await buildDueJournalTombstonePurgeQuery(limit).execute(db);

  const purgedIds = purged.rows.map((row) => row.id);
  if (purgedIds.length === 0) return 0;

  // Residue the cascade cannot reach: the projection intent is keyed by entity
  // id with no foreign key, and finished revoke jobs still carry the entry id.
  await sql`
    delete from public_projection_intents
    where entity_kind = 'journal_entry'
      and entity_id = any(${purgedIds}::uuid[])
  `.execute(db);
  await sql`
    delete from job_queue
    where queue_name = ${MEDIA_LIFECYCLE_QUEUE}
      and status in ('done', 'dead')
      and payload->>'journalEntryId' = any(${purgedIds}::text[])
  `.execute(db);

  return purgedIds.length;
}

async function executeRetentionSelection(selection: RetentionSelection) {
  const analyticsCutoff = monthsAgo(ANALYTICS_EXPIRE_MONTHS);
  const auditCutoff = yearsAgo(AUDIT_EXPIRE_YEARS);

  if (selection.analyticsExpireCount > 0) {
    await db
      .deleteFrom("analytics_events")
      .where("created_at", "<", analyticsCutoff)
      .execute();
  }
  if (selection.adminAuditExpireCount > 0) {
    await db
      .deleteFrom("admin_role_audit_log")
      .where("created_at", "<", auditCutoff)
      .execute();
  }
  if (selection.communityAuditExpireCount > 0) {
    await db
      .deleteFrom("community_moderation_audit_log")
      .where("created_at", "<", auditCutoff)
      .execute();
  }
  if (selection.erasureEvidenceExpireCount > 0) {
    await db
      .deleteFrom("erasure_requests")
      .where("status", "=", "handled")
      .where("handled_at", "is not", null)
      .where("handled_at", "<", auditCutoff)
      .execute();
  }

  await sql`
    update journal_entries je
    set cover_media_asset_id = null,
        updated_at = now()
    where je.cover_media_asset_id is not null
      and not exists (
        select 1
        from media_assets ma
        where ma.id = je.cover_media_asset_id
          and ma.owner_user_id = je.owner_user_id
          and ma.derivative_key is not null
          and ma.revoked_at is null
      )
  `.execute(db);
}

async function acquireRetentionLeaderLock() {
  await sql`select pg_advisory_lock(hashtextextended('ove349.retention.v2', 0))`.execute(
    db,
  );
}

async function releaseRetentionLeaderLock() {
  await sql`select pg_advisory_unlock(hashtextextended('ove349.retention.v2', 0))`.execute(
    db,
  );
}

async function scalarCount(
  query: ReturnType<typeof sql<{ count: string | number }>>,
): Promise<number> {
  const result = await query.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

function countClass(count: number): CountClass {
  if (count <= 0) return "empty";
  if (count <= 10) return "low";
  if (count <= 100) return "elevated";
  return "high";
}

function monthsAgo(months: number): Date {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

function yearsAgo(years: number): Date {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date;
}
