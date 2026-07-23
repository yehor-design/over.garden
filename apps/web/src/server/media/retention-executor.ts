import "server-only";

import { sql } from "kysely";

import { db } from "@/db";
import type { JsonValue } from "@/db/types";
import { drainMediaLifecycleQueue } from "@/server/media/media-lifecycle-consumer";

/** Local literals keep the job-queue producer scanner deterministic. */
const MEDIA_LIFECYCLE_QUEUE = "media_lifecycle";
const MEDIA_QUARANTINE_EXPIRE_KIND = "media_quarantine_expire";

export const RETENTION_POLICY_VERSION = "ove195.retention.v1" as const;

const QUARANTINE_EXPIRE_DAYS = 7;
const ANALYTICS_EXPIRE_MONTHS = 13;
const AUDIT_EXPIRE_YEARS = 1;
const BATCH_LIMIT = 100;

export type RetentionMode = "dry_run" | "execute";

export interface RetentionSelectionReport {
  policyVersion: typeof RETENTION_POLICY_VERSION;
  mode: RetentionMode;
  quarantineExpireClass: CountClass;
  analyticsExpireClass: CountClass;
  adminAuditExpireClass: CountClass;
  communityAuditExpireClass: CountClass;
  erasureEvidenceExpireClass: CountClass;
  danglingCoverPointerClass: CountClass;
  orphanCoverOnlyClass: CountClass;
  pendingRevokeJobsClass: CountClass;
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
  quarantineExpireCount: number;
  analyticsExpireCount: number;
  adminAuditExpireCount: number;
  communityAuditExpireCount: number;
  erasureEvidenceExpireCount: number;
  danglingCoverPointerCount: number;
  orphanCoverOnlyCount: number;
  pendingRevokeJobsCount: number;
  quarantineExpireRows: Array<{ id: string; quarantineKey: string }>;
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

    if (mode === "execute") {
      try {
        await executeRetentionSelection(selection);
        drainedLifecycle = await drainMediaLifecycleQueue(BATCH_LIMIT);
        if (drainedLifecycle.failed > 0 || drainedLifecycle.dead > 0) {
          failureClass = "partial";
        }
      } catch {
        failureClass = "failed";
      }
    }

    const report: RetentionSelectionReport = {
      policyVersion: RETENTION_POLICY_VERSION,
      mode,
      quarantineExpireClass: countClass(selection.quarantineExpireCount),
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
          quarantineExpireCount: selection.quarantineExpireCount,
          analyticsExpireCount: selection.analyticsExpireCount,
          adminAuditExpireCount: selection.adminAuditExpireCount,
          communityAuditExpireCount: selection.communityAuditExpireCount,
          erasureEvidenceExpireCount: selection.erasureEvidenceExpireCount,
          danglingCoverPointerCount: selection.danglingCoverPointerCount,
          orphanCoverOnlyCount: selection.orphanCoverOnlyCount,
          pendingRevokeJobsCount: selection.pendingRevokeJobsCount,
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
  const quarantineCutoff = daysAgo(QUARANTINE_EXPIRE_DAYS);
  const analyticsCutoff = monthsAgo(ANALYTICS_EXPIRE_MONTHS);
  const auditCutoff = yearsAgo(AUDIT_EXPIRE_YEARS);

  const quarantineExpireRows = await db
    .selectFrom("media_assets")
    .select(["id", "quarantine_key as quarantineKey"])
    .where("status", "in", ["quarantined", "failed"])
    .where("original_deleted_at", "is", null)
    .where("created_at", "<", quarantineCutoff)
    .orderBy("created_at", "asc")
    .limit(BATCH_LIMIT)
    .execute();

  const [
    analyticsExpireCount,
    adminAuditExpireCount,
    communityAuditExpireCount,
    erasureEvidenceExpireCount,
    danglingCoverPointerCount,
    orphanCoverOnlyCount,
    pendingRevokeJobsCount,
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
            and ma.status = 'processed'
            and ma.derivative_key is not null
            and ma.revoked_at is null
        )
    `),
    scalarCount(sql`
      select count(*)::int as count
      from media_assets ma
      where ma.usage_role = 'cover_only'
        and ma.status = 'processed'
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
  ]);

  return {
    quarantineExpireCount: quarantineExpireRows.length,
    analyticsExpireCount,
    adminAuditExpireCount,
    communityAuditExpireCount,
    erasureEvidenceExpireCount,
    danglingCoverPointerCount,
    orphanCoverOnlyCount,
    pendingRevokeJobsCount,
    quarantineExpireRows,
  };
}

async function executeRetentionSelection(selection: RetentionSelection) {
  const analyticsCutoff = monthsAgo(ANALYTICS_EXPIRE_MONTHS);
  const auditCutoff = yearsAgo(AUDIT_EXPIRE_YEARS);

  for (const row of selection.quarantineExpireRows) {
    const payload = {
      kind: MEDIA_QUARANTINE_EXPIRE_KIND,
      mediaAssetId: row.id,
      bucket: "quarantine",
      objectKey: row.quarantineKey,
    } satisfies JsonValue;

    await db
      .insertInto("job_queue")
      .values({
        queue_name: MEDIA_LIFECYCLE_QUEUE,
        payload,
        idempotency_key: `media_quarantine_expire:${row.id}`,
      })
      .onConflict((oc) =>
        oc
          .column("idempotency_key")
          .where("idempotency_key", "is not", null)
          .doUpdateSet({
            payload,
            status: "pending",
            attempts: 0,
            locked_at: null,
            locked_by: null,
            last_error: null,
            available_at: sql`now()`,
            updated_at: sql`now()`,
          }),
      )
      .execute();
  }

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
          and ma.status = 'processed'
          and ma.derivative_key is not null
          and ma.revoked_at is null
      )
  `.execute(db);
}

async function acquireRetentionLeaderLock() {
  await sql`select pg_advisory_lock(hashtextextended('ove195.retention.v1', 0))`.execute(
    db,
  );
}

async function releaseRetentionLeaderLock() {
  await sql`select pg_advisory_unlock(hashtextextended('ove195.retention.v1', 0))`.execute(
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

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
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
