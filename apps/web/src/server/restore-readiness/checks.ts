import { createHash } from "node:crypto";

import { type Kysely, sql } from "kysely";

import type { Database } from "@/db/types";
import {
  createKyselyPublicIdentityMigrationStore,
  publicIdentityIntegrityReady,
  type PublicIdentityIntegrityReport,
} from "@/server/public-identity-integrity";

import {
  evaluateRpoPass,
  evaluateRtoPass,
  PREDECLARED_RPO_MAX_MS,
  PREDECLARED_RTO_MAX_MS,
  RESTORE_READINESS_POLICY,
} from "./contract";

export interface RestoreSchemaPresenceReport {
  engineVersionMajor: number | null;
  hasJournalDocumentColumns: boolean;
  hasCoverMediaAssetId: boolean;
  hasCoverOnlyUsageRole: boolean;
  hasOneCoverOnlyUniqueIndex: boolean;
  hasIdentityRegistryTables: boolean;
  hasIdentityProvisionFunction: boolean;
  hasJobQueueDeadStatus: boolean;
  hasJobQueueClaimIndex: boolean;
  hasLearningActorAttributions: boolean;
}

export interface RestoreIntegrityCounts {
  journalEntries: number;
  mediaAssets: number;
  objects: number;
  authUsers: number;
  danglingCoverPointers: number;
  duplicateCoverOnlyAssociations: number;
  crossOwnerCoverClaims: number;
  quarantineOriginalStillPresent: number;
}

export interface RestoreReadinessReport {
  policyVersion: typeof RESTORE_READINESS_POLICY;
  issue: "OVE-201";
  evidenceSafety: "booleans_counts_hashes_durations_only";
  schema: RestoreSchemaPresenceReport;
  integrity: RestoreIntegrityCounts;
  identity: {
    ready: boolean;
    policyVersion: string;
    totals: Pick<
      PublicIdentityIntegrityReport,
      | "totalUsers"
      | "publicProfiles"
      | "currentHandleClaims"
      | "retiredHandleClaims"
      | "usersMissingCurrentHandle"
      | "duplicateCurrentHandles"
      | "usersWithMultipleCurrentHandles"
    >;
  };
  effectiveCoverFingerprint: string;
  appReadClasses: {
    publicJournalCandidates: number;
    archivedJournalCandidates: number;
    privateJournalCandidates: number;
  };
  queueCompatibility: {
    pendingOrProcessing: number;
    deadTerminal: number;
    done: number;
  };
  rpo: {
    predeclaredMaxMs: number;
    actualMs: number | null;
    pass: boolean | null;
  };
  rto: {
    predeclaredMaxMs: number;
    actualMs: number | null;
    pass: boolean | null;
  };
  ok: boolean;
}

function toCount(value: unknown): number {
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Restore readiness count is invalid.");
  }
  return Math.trunc(n);
}

async function tableExists(
  db: Kysely<Database>,
  table: string,
): Promise<boolean> {
  const row = await sql<{ exists: boolean }>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${table}
    ) as exists
  `.execute(db);
  return Boolean(row.rows[0]?.exists);
}

async function columnExists(
  db: Kysely<Database>,
  table: string,
  column: string,
): Promise<boolean> {
  const row = await sql<{ exists: boolean }>`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${table}
        and column_name = ${column}
    ) as exists
  `.execute(db);
  return Boolean(row.rows[0]?.exists);
}

async function indexExists(
  db: Kysely<Database>,
  indexName: string,
): Promise<boolean> {
  const row = await sql<{ exists: boolean }>`
    select exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = ${indexName}
    ) as exists
  `.execute(db);
  return Boolean(row.rows[0]?.exists);
}

async function functionExists(
  db: Kysely<Database>,
  functionName: string,
): Promise<boolean> {
  const row = await sql<{ exists: boolean }>`
    select exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = ${functionName}
    ) as exists
  `.execute(db);
  return Boolean(row.rows[0]?.exists);
}

export async function collectRestoreSchemaPresence(
  db: Kysely<Database>,
): Promise<RestoreSchemaPresenceReport> {
  const versionRow = await sql<{ version: string }>`
    select version() as version
  `.execute(db);
  const versionText = versionRow.rows[0]?.version ?? "";
  const majorMatch = versionText.match(/PostgreSQL\s+(\d+)/i);
  const engineVersionMajor = majorMatch ? Number(majorMatch[1]) : null;

  const hasJobQueueDeadStatus = await sql<{ ok: boolean }>`
    select exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'job_queue'
        and c.conname = 'job_queue_status_check'
        and pg_get_constraintdef(c.oid) like '%dead%'
    ) as ok
  `.execute(db);

  return {
    engineVersionMajor,
    hasJournalDocumentColumns:
      (await columnExists(db, "journal_entries", "content_document")) &&
      (await columnExists(db, "journal_entries", "content_schema_version")) &&
      (await columnExists(db, "journal_entries", "journal_revision")) &&
      (await tableExists(db, "journal_entry_mutation_receipts")),
    hasCoverMediaAssetId: await columnExists(
      db,
      "journal_entries",
      "cover_media_asset_id",
    ),
    hasCoverOnlyUsageRole: await columnExists(db, "media_assets", "usage_role"),
    hasOneCoverOnlyUniqueIndex: await indexExists(
      db,
      "media_assets_one_cover_only_per_entry_uidx",
    ),
    hasIdentityRegistryTables:
      (await tableExists(db, "user_handle_registry")) &&
      (await tableExists(db, "user_public_profiles")),
    hasIdentityProvisionFunction: await functionExists(
      db,
      "overgarden_provision_user_public_profile",
    ),
    hasJobQueueDeadStatus: Boolean(hasJobQueueDeadStatus.rows[0]?.ok),
    hasJobQueueClaimIndex: await indexExists(db, "job_queue_claim_idx"),
    hasLearningActorAttributions: await tableExists(
      db,
      "learning_actor_attributions",
    ),
  };
}

export async function collectRestoreIntegrityCounts(
  db: Kysely<Database>,
): Promise<RestoreIntegrityCounts> {
  const counts = await sql<{
    journal_entries: unknown;
    media_assets: unknown;
    objects: unknown;
    auth_users: unknown;
    dangling_cover_pointers: unknown;
    duplicate_cover_only: unknown;
    cross_owner_cover_claims: unknown;
    quarantine_original_still_present: unknown;
  }>`
    select
      (select count(*)::bigint from journal_entries) as journal_entries,
      (select count(*)::bigint from media_assets) as media_assets,
      (select count(*)::bigint from plant_objects) as objects,
      (select count(*)::bigint from "user") as auth_users,
      (
        select count(*)::bigint
        from journal_entries je
        where je.cover_media_asset_id is not null
          and not exists (
            select 1
            from media_assets ma
            where ma.id = je.cover_media_asset_id
              and ma.journal_entry_id = je.id
              and ma.owner_user_id = je.owner_user_id
              and ma.status = 'processed'
              and ma.revoked_at is null
          )
      ) as dangling_cover_pointers,
      (
        select count(*)::bigint
        from (
          select journal_entry_id
          from media_assets
          where usage_role = 'cover_only'
            and journal_entry_id is not null
          group by journal_entry_id
          having count(*) > 1
        ) d
      ) as duplicate_cover_only,
      (
        select count(*)::bigint
        from journal_entries je
        join media_assets ma on ma.id = je.cover_media_asset_id
        where ma.owner_user_id is distinct from je.owner_user_id
           or ma.journal_entry_id is distinct from je.id
      ) as cross_owner_cover_claims,
      (
        select count(*)::bigint
        from media_assets
        where status = 'processed'
          and derivative_key is not null
          and original_deleted_at is null
      ) as quarantine_original_still_present
  `.execute(db);

  const row = counts.rows[0];
  if (!row) throw new Error("Restore integrity counts unavailable.");

  return {
    journalEntries: toCount(row.journal_entries),
    mediaAssets: toCount(row.media_assets),
    objects: toCount(row.objects),
    authUsers: toCount(row.auth_users),
    danglingCoverPointers: toCount(row.dangling_cover_pointers),
    duplicateCoverOnlyAssociations: toCount(row.duplicate_cover_only),
    crossOwnerCoverClaims: toCount(row.cross_owner_cover_claims),
    quarantineOriginalStillPresent: toCount(
      row.quarantine_original_still_present,
    ),
  };
}

/**
 * Fingerprint of effective cover resolution using non-content identifiers only.
 * Evidence emits the digest — never the raw UUIDs.
 */
export async function collectEffectiveCoverFingerprint(
  db: Kysely<Database>,
): Promise<string> {
  const rows = await sql<{
    entry_id: string;
    cover_media_id: string | null;
    source_class: string;
  }>`
    with candidates as (
      select
        je.id as entry_id,
        je.cover_media_asset_id as explicit_cover_id,
        ma.id as media_id,
        ma.usage_role,
        ma.document_position,
        case
          when je.cover_media_asset_id is not null
            and ma.id = je.cover_media_asset_id
            then 0
          when ma.usage_role = 'inline' then 1
          else 2
        end as rank_class
      from journal_entries je
      left join media_assets ma
        on ma.journal_entry_id = je.id
       and ma.owner_user_id = je.owner_user_id
       and ma.status = 'processed'
       and ma.derivative_key is not null
       and ma.revoked_at is null
       and (
         ma.id = je.cover_media_asset_id
         or ma.usage_role = 'inline'
       )
    ),
    ranked as (
      select distinct on (entry_id)
        entry_id,
        media_id as cover_media_id,
        case
          when explicit_cover_id is not null and media_id = explicit_cover_id
            and usage_role = 'cover_only' then 'dedicated'
          when explicit_cover_id is not null and media_id = explicit_cover_id
            then 'explicit_inline'
          when media_id is not null then 'automatic_inline'
          else 'none'
        end as source_class
      from candidates
      order by entry_id, rank_class asc, document_position asc nulls last, media_id asc nulls last
    )
    select entry_id, cover_media_id, source_class
    from ranked
    order by entry_id
  `.execute(db);

  const hash = createHash("sha256");
  for (const row of rows.rows) {
    hash.update(
      `${row.entry_id}|${row.cover_media_id ?? "null"}|${row.source_class}\n`,
    );
  }
  hash.update(`count=${rows.rows.length}\n`);
  return hash.digest("hex");
}

export async function collectAppReadClasses(db: Kysely<Database>): Promise<{
  publicJournalCandidates: number;
  archivedJournalCandidates: number;
  privateJournalCandidates: number;
}> {
  const row = await sql<{
    public_candidates: unknown;
    archived_candidates: unknown;
    private_candidates: unknown;
  }>`
    select
      (
        select count(*)::bigint
        from journal_entries
        where visibility = 'public'
          and archived_at is null
      ) as public_candidates,
      (
        select count(*)::bigint
        from journal_entries
        where archived_at is not null
      ) as archived_candidates,
      (
        select count(*)::bigint
        from journal_entries
        where visibility = 'private'
          and archived_at is null
      ) as private_candidates
  `.execute(db);

  const first = row.rows[0];
  if (!first) throw new Error("App read class counts unavailable.");
  return {
    publicJournalCandidates: toCount(first.public_candidates),
    archivedJournalCandidates: toCount(first.archived_candidates),
    privateJournalCandidates: toCount(first.private_candidates),
  };
}

export async function collectQueueCompatibility(db: Kysely<Database>): Promise<{
  pendingOrProcessing: number;
  deadTerminal: number;
  done: number;
}> {
  const row = await sql<{
    pending_or_processing: unknown;
    dead_terminal: unknown;
    done: unknown;
  }>`
    select
      (
        select count(*)::bigint
        from job_queue
        where status in ('pending', 'processing')
      ) as pending_or_processing,
      (
        select count(*)::bigint
        from job_queue
        where status = 'dead'
      ) as dead_terminal,
      (
        select count(*)::bigint
        from job_queue
        where status = 'done'
      ) as done
  `.execute(db);
  const first = row.rows[0];
  if (!first) throw new Error("Queue compatibility counts unavailable.");
  return {
    pendingOrProcessing: toCount(first.pending_or_processing),
    deadTerminal: toCount(first.dead_terminal),
    done: toCount(first.done),
  };
}

export async function buildRestoreReadinessReport(
  db: Kysely<Database>,
  timing?: {
    actualRpoMs?: number | null;
    actualRtoMs?: number | null;
  },
): Promise<RestoreReadinessReport> {
  const schema = await collectRestoreSchemaPresence(db);
  const integrity = await collectRestoreIntegrityCounts(db);
  const identityStore = createKyselyPublicIdentityMigrationStore(db);
  const identityReport = await identityStore.collectReport();
  const identityReady = publicIdentityIntegrityReady(identityReport);
  const effectiveCoverFingerprint = await collectEffectiveCoverFingerprint(db);
  const appReadClasses = await collectAppReadClasses(db);
  const queueCompatibility = await collectQueueCompatibility(db);

  const actualRpoMs =
    timing?.actualRpoMs === undefined ? null : timing.actualRpoMs;
  const actualRtoMs =
    timing?.actualRtoMs === undefined ? null : timing.actualRtoMs;

  const schemaOk =
    schema.engineVersionMajor !== null &&
    schema.engineVersionMajor >= 18 &&
    schema.hasJournalDocumentColumns &&
    schema.hasCoverMediaAssetId &&
    schema.hasCoverOnlyUsageRole &&
    schema.hasOneCoverOnlyUniqueIndex &&
    schema.hasIdentityRegistryTables &&
    schema.hasIdentityProvisionFunction &&
    schema.hasJobQueueDeadStatus &&
    schema.hasJobQueueClaimIndex;

  const integrityOk =
    integrity.danglingCoverPointers === 0 &&
    integrity.duplicateCoverOnlyAssociations === 0 &&
    integrity.crossOwnerCoverClaims === 0;

  const rpoPass =
    actualRpoMs === null ? null : evaluateRpoPass(actualRpoMs);
  const rtoPass =
    actualRtoMs === null ? null : evaluateRtoPass(actualRtoMs);

  const timingOk =
    (rpoPass === null || rpoPass) && (rtoPass === null || rtoPass);

  const ok = schemaOk && integrityOk && identityReady && timingOk;

  return {
    policyVersion: RESTORE_READINESS_POLICY,
    issue: "OVE-201",
    evidenceSafety: "booleans_counts_hashes_durations_only",
    schema,
    integrity,
    identity: {
      ready: identityReady,
      policyVersion: identityReport.policyVersion,
      totals: {
        totalUsers: identityReport.totalUsers,
        publicProfiles: identityReport.publicProfiles,
        currentHandleClaims: identityReport.currentHandleClaims,
        retiredHandleClaims: identityReport.retiredHandleClaims,
        usersMissingCurrentHandle: identityReport.usersMissingCurrentHandle,
        duplicateCurrentHandles: identityReport.duplicateCurrentHandles,
        usersWithMultipleCurrentHandles:
          identityReport.usersWithMultipleCurrentHandles,
      },
    },
    effectiveCoverFingerprint,
    appReadClasses,
    queueCompatibility,
    rpo: {
      predeclaredMaxMs: PREDECLARED_RPO_MAX_MS,
      actualMs: actualRpoMs,
      pass: rpoPass,
    },
    rto: {
      predeclaredMaxMs: PREDECLARED_RTO_MAX_MS,
      actualMs: actualRtoMs,
      pass: rtoPass,
    },
    ok,
  };
}
