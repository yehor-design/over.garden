import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

import {
  APPROVED_RETIREMENT_EVIDENCE_DIGEST,
  classifyRetirementGate,
  parseRetirementOperatorArgs,
  stableEvidenceDigest,
  toRetirementGateSnapshot,
  validateZeroState,
  type AggregateCounts,
  type LegacyProductionReport,
  type ZeroStateEvidence,
} from "./legacy-journal-media-retirement-contract";

const EXPECTED_DATABASE = {
  hostname:
    "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com",
  port: "25060",
  database: "defaultdb",
} as const;
const EXPECTED_PUBLIC_BUCKET = "overgarden-public";
const EXPECTED_LEGACY_BUCKET = "overgarden-quarantine";
const ADVISORY_LOCK_NAME = "overgarden:ove349:legacy-journal-media-retirement";
const PROVIDER_REQUEST_TIMEOUT_MS = 5_000;
const PREFLIGHT_DEADLINE_MS = 60_000;

// Captured by two identical read-only preflights before the implementation
// commit. These supplement the founder-approved aggregate digest with a
// non-reversible hash of the exact candidate rows/keys, enabling safe retry
// after a partial object-only effect without ever printing those identifiers.
const APPROVED_DATABASE_EVIDENCE_DIGEST =
  "ae2dc6f294a5c232f06fde73e84c9838e7169b6e4c21f0917206bc2a0e5e7055";
const APPROVED_CANDIDATE_SET_DIGEST =
  "10d631dcdeae50dfd7c4b8f5a59b77cee525b9a4cdd54a60608d0d554091b697";
const APPROVED_DEPENDENCY_EVIDENCE_DIGEST =
  "a1fb23b420516632aaa3159efd10b0ae76212372e2049281949fc048198098eb";

type ObjectState = "present" | "not_found" | "provider_error";

interface InternalMediaRow {
  id: string;
  derivativeKey: string | null;
  entryVisibility: string | null;
  actorClass: string;
  contentClass: string;
  namespaceClass: string;
  status: string;
  readiness: string;
  revoked: boolean;
}

interface CandidateSet {
  privateEntryIds: string[];
  privateMediaIds: string[];
  unattachedMediaIds: string[];
  candidateMediaRows: InternalMediaRow[];
  publicMediaRows: InternalMediaRow[];
}

interface LegacyDatabaseEvidence {
  schemaDigest: string;
  drafts: AggregateCounts;
  privateEntries: AggregateCounts;
  privateEntryGroups: Array<Record<string, unknown>>;
  media: AggregateCounts;
  mediaGroups: LegacyProductionReport["mediaGroups"];
  jobs: AggregateCounts;
  visibility: AggregateCounts;
  mediaRows: InternalMediaRow[];
  candidates: CandidateSet;
  publicOverlap: number;
  outsideApprovedScope: number;
  databaseEvidenceDigest: string;
  candidateSetDigest: string;
  dependencyCounts: AggregateCounts;
  dependencyEvidenceDigest: string;
}

interface ProviderEvidence {
  publicDerivativeStates: LegacyProductionReport["publicDerivativeStates"];
  legacyQuarantineBucket: LegacyProductionReport["legacyQuarantineBucket"];
  objectStatesByMediaId: Map<string, ObjectState>;
}

interface ContractedEvidence {
  version: "ove349.contractedProduction.v1";
  environment: "production";
  databaseIdentity: "digitalocean_overgarden_production";
  schemaDigest: string;
  draftTableAbsent: boolean;
  retiredMediaColumnsAbsent: boolean;
  preservedMediaColumnsPresent: boolean;
  publicOnlyConstraint: boolean;
  publicEntries: number;
  publicMedia: number;
  unattachedMedia: number;
  nonFinalMedia: number;
  unfinishedLegacyEffects: number;
  publicObjectsPresent: number;
  publicObjectsMissing: number;
  providerErrors: number;
}

async function main() {
  const startedAt = performance.now();
  const args = parseRetirementOperatorArgs(process.argv.slice(2));
  if (args.envFile) {
    const result = loadEnv({
      path: args.envFile,
      override: false,
      quiet: true,
    });
    if (result.error) throw result.error;
  }
  assertProductionEnvironment();

  const pool = createProductionPool();
  try {
    const schemaState = await classifyRetirementSchemaState(pool);
    if (args.mode === "verify") {
      if (schemaState !== "contracted") {
        throw new Error(`ove349_verify_schema_${schemaState}`);
      }
      const evidence = await collectContractedEvidence(pool);
      assertContractedEvidence(evidence);
      printReceipt({
        ...evidence,
        evidenceDigest: stableEvidenceDigest(evidence),
        durationMs: Math.round(performance.now() - startedAt),
      });
      return;
    }

    if (args.mode === "migrate") {
      if (schemaState === "contracted") {
        const evidence = await collectContractedEvidence(pool);
        assertContractedEvidence(evidence);
        printReceipt({
          terminalState: "applied",
          replay: true,
          migration: "0038_ove349_retire_legacy_journal_media.sql",
          contractedEvidence: evidence,
          contractedEvidenceDigest: stableEvidenceDigest(evidence),
          durationMs: Math.round(performance.now() - startedAt),
        });
        return;
      }
      if (schemaState !== "legacy") {
        throw new Error(`ove349_migration_schema_${schemaState}`);
      }
      const before = await collectZeroStateEvidence(pool);
      const zeroStateDigest = stableEvidenceDigest(before);
      if (zeroStateDigest !== args.approvedZeroDigest) {
        throw new Error("ove349_zero_state_digest_drifted");
      }
      const zeroGate = validateZeroState(before);
      if (!zeroGate.ok)
        throw new Error(`ove349_migration_blocked:${zeroGate.reason}`);

      const client = await pool.connect();
      try {
        const migration = readFileSync(
          fileURLToPath(
            new URL(
              "../sql/0038_ove349_retire_legacy_journal_media.sql",
              import.meta.url,
            ),
          ),
          "utf8",
        );
        await client.query(migration);
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }

      const evidence = await collectContractedEvidence(pool);
      assertContractedEvidence(evidence);
      printReceipt({
        terminalState: "applied",
        migration: "0038_ove349_retire_legacy_journal_media.sql",
        approvedZeroStateDigest: zeroStateDigest,
        contractedEvidence: evidence,
        contractedEvidenceDigest: stableEvidenceDigest(evidence),
        durationMs: Math.round(performance.now() - startedAt),
      });
      return;
    }

    if (args.mode === "cleanup") {
      if (schemaState === "contracted") {
        const evidence = await collectContractedEvidence(pool);
        assertContractedEvidence(evidence);
        printReceipt({
          terminalState: "applied",
          replay: true,
          contractedEvidence: evidence,
          contractedEvidenceDigest: stableEvidenceDigest(evidence),
          observationReceipt: args.observationReceipt,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return;
      }
      if (schemaState !== "legacy") {
        throw new Error(`ove349_cleanup_schema_${schemaState}`);
      }
      const alreadyClean = await collectZeroStateEvidence(pool);
      if (validateZeroState(alreadyClean).ok) {
        printReceipt({
          terminalState: "applied",
          replay: true,
          zeroState: alreadyClean,
          zeroStateDigest: stableEvidenceDigest(alreadyClean),
          observationReceipt: args.observationReceipt,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return;
      }
      const receipt = await applyApprovedCleanup(pool, args.observationReceipt);
      printReceipt({
        ...receipt,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return;
    }

    if (schemaState !== "legacy") {
      throw new Error(`ove349_preflight_schema_${schemaState}`);
    }

    const preflight = await collectLegacyPreflight(pool, false);
    try {
      await preflight.client.query("commit");
    } catch (error) {
      await preflight.client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      preflight.client.release();
    }
    printReceipt({
      ...preflight.report,
      evidenceDigest: preflight.evidenceDigest,
      databaseEvidenceDigest: preflight.database.databaseEvidenceDigest,
      candidateSetDigest: preflight.database.candidateSetDigest,
      dependencyEvidenceDigest: preflight.database.dependencyEvidenceDigest,
      dependencyCounts: preflight.database.dependencyCounts,
      classification: preflight.classification,
      durationMs: Math.round(performance.now() - startedAt),
    });
  } finally {
    await pool.end();
  }
}

async function classifyRetirementSchemaState(
  pool: Pool,
): Promise<"legacy" | "contracted" | "drift"> {
  const result = await pool.query<{
    draft_table_present: boolean;
    retired_media_columns: string;
  }>(`
    select
      to_regclass('public.journal_entry_drafts') is not null as draft_table_present,
      (select count(*)::text
       from information_schema.columns
       where table_schema = 'public' and table_name = 'media_assets'
         and column_name in (
           'quarantine_key', 'status', 'original_deleted_at', 'declared_media_type',
           'admitted_media_type', 'media_readiness_state', 'processing_claim_token',
           'processing_claimed_at', 'upload_generation_id', 'public_object_id',
           'quality_policy_version', 'quality_class', 'quality_reason_codes',
           'quality_metrics', 'quality_evaluated_at'
         )) as retired_media_columns
  `);
  const row = result.rows[0];
  const retiredColumnCount = Number(row?.retired_media_columns);
  if (row?.draft_table_present && retiredColumnCount === 15) return "legacy";
  if (row && !row.draft_table_present && retiredColumnCount === 0) {
    return "contracted";
  }
  return "drift";
}

async function collectLegacyPreflight(pool: Pool, lockTables: boolean) {
  const deadline = AbortSignal.timeout(PREFLIGHT_DEADLINE_MS);
  const client = await pool.connect();
  try {
    await client.query(
      lockTables
        ? "begin isolation level serializable"
        : "begin isolation level repeatable read read only",
    );
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    const locked = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as locked",
      [ADVISORY_LOCK_NAME],
    );
    if (!locked.rows[0]?.locked)
      throw new Error("ove349_operator_lock_unavailable");
    if (lockTables) {
      await client.query(
        `lock table analytics_events, community_contributions,
          journal_entries, journal_entry_catalog_mentions, journal_entry_drafts,
          journal_entry_mutation_receipts, journal_entry_object_mentions,
          journal_entry_topic_signals, job_queue, media_assets,
          public_projection_intents, user_public_profiles
          in share row exclusive mode`,
      );
    }

    const database = await collectLegacyDatabaseEvidence(client);
    const provider = await collectProviderEvidence(
      database.mediaRows,
      deadline,
    );
    const report = buildLegacyReport(database, provider);
    const evidenceDigest = stableEvidenceDigest(report);
    const gate = toRetirementGateSnapshot(report, evidenceDigest);
    gate.publicOverlap = database.publicOverlap;
    gate.outsideApprovedScope += database.outsideApprovedScope;
    const classification = classifyRetirementGate(gate);
    return {
      client,
      database,
      provider,
      report,
      evidenceDigest,
      classification,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    client.release();
    throw error;
  }
}

async function applyApprovedCleanup(pool: Pool, observationReceipt: string) {
  const preflight = await collectLegacyPreflight(pool, true);
  const { client, database, provider, evidenceDigest, classification } =
    preflight;
  let revokedObjects = 0;
  let transactionOpen = true;
  let clientReleased = false;
  try {
    assertCapturedCandidateDigests(database);
    const recoveryEligible = isMonotonicObjectOnlyRecovery(preflight);
    if (
      evidenceDigest !== APPROVED_RETIREMENT_EVIDENCE_DIGEST &&
      !recoveryEligible
    ) {
      throw new Error("ove349_approved_preflight_digest_drifted");
    }
    if (
      evidenceDigest === APPROVED_RETIREMENT_EVIDENCE_DIGEST &&
      classification.state !== "eligible_zero"
    ) {
      throw new Error(
        `ove349_cleanup_blocked:${classification.state}:${classification.reason}`,
      );
    }

    const publicBucket = required("R2_PUBLIC_BUCKET");
    const r2 = createR2Client();
    const presentCandidateKeys = database.candidates.candidateMediaRows
      .filter((row) => provider.objectStatesByMediaId.get(row.id) === "present")
      .map((row) => row.derivativeKey)
      .filter((key): key is string => Boolean(key));
    await mapWithConcurrency(presentCandidateKeys, 8, async (objectKey) => {
      await r2.send(
        new DeleteObjectCommand({ Bucket: publicBucket, Key: objectKey }),
        { abortSignal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS) },
      );
      revokedObjects += 1;
    });

    const candidateAfter = await probeMediaRows(
      r2,
      publicBucket,
      database.candidates.candidateMediaRows,
      AbortSignal.timeout(30_000),
    );
    if ([...candidateAfter.values()].some((state) => state !== "not_found")) {
      throw new Error("ove349_candidate_object_revocation_inconclusive");
    }
    const publicAfter = await probeMediaRows(
      r2,
      publicBucket,
      database.candidates.publicMediaRows,
      AbortSignal.timeout(30_000),
    );
    if ([...publicAfter.values()].some((state) => state !== "present")) {
      throw new Error("ove349_public_object_preservation_inconclusive");
    }

    const databaseBeforeDelete = await collectLegacyDatabaseEvidence(client);
    if (
      databaseBeforeDelete.databaseEvidenceDigest !==
        database.databaseEvidenceDigest ||
      databaseBeforeDelete.candidateSetDigest !== database.candidateSetDigest ||
      databaseBeforeDelete.dependencyEvidenceDigest !==
        database.dependencyEvidenceDigest
    ) {
      throw new Error("ove349_concurrent_database_race_blocked");
    }

    const entryIds = database.candidates.privateEntryIds;
    const mediaIds = [
      ...database.candidates.privateMediaIds,
      ...database.candidates.unattachedMediaIds,
    ];
    const derivativeKeys = database.candidates.candidateMediaRows
      .map((row) => row.derivativeKey)
      .filter((key): key is string => Boolean(key));

    await client.query(
      "delete from public_projection_intents where entity_kind = 'journal_entry' and entity_id = any($1::uuid[])",
      [entryIds],
    );
    await client.query(
      `delete from job_queue
       where payload->>'mediaAssetId' = any($1::text[])
          or payload->>'journalEntryId' = any($2::text[])
          or payload->>'objectKey' = any($3::text[])`,
      [mediaIds, entryIds, derivativeKeys],
    );
    const unattachedDelete = await client.query(
      "delete from media_assets where id = any($1::uuid[]) and journal_entry_id is null",
      [database.candidates.unattachedMediaIds],
    );
    if (unattachedDelete.rowCount !== 8) {
      throw new Error("ove349_unattached_media_delete_count_drifted");
    }
    const entryDelete = await client.query(
      "delete from journal_entries where id = any($1::uuid[]) and visibility <> 'public'",
      [entryIds],
    );
    if (entryDelete.rowCount !== 203) {
      throw new Error("ove349_private_entry_delete_count_drifted");
    }

    const dependencyResidue = await collectDependencyCounts(
      client,
      entryIds,
      mediaIds,
      derivativeKeys,
    );
    if (Object.values(dependencyResidue).some((count) => count !== 0)) {
      throw new Error("ove349_dependency_cleanup_incomplete");
    }

    const zeroInsideTransaction = await collectZeroStateEvidenceFromClient(
      client,
      publicAfter,
    );
    const zeroGate = validateZeroState(zeroInsideTransaction);
    if (!zeroGate.ok) {
      throw new Error(`ove349_cleanup_zero_state_blocked:${zeroGate.reason}`);
    }
    await client.query("commit");
    transactionOpen = false;
    client.release();
    clientReleased = true;

    const zeroState = await collectZeroStateEvidence(pool);
    const committedGate = validateZeroState(zeroState);
    if (!committedGate.ok) {
      throw new Error(
        `ove349_cleanup_commit_readback_blocked:${committedGate.reason}`,
      );
    }
    return {
      terminalState: "applied",
      replay: false,
      approvedEvidenceDigest: APPROVED_RETIREMENT_EVIDENCE_DIGEST,
      databaseEvidenceDigest: database.databaseEvidenceDigest,
      candidateSetDigest: database.candidateSetDigest,
      dependencyEvidenceDigest: database.dependencyEvidenceDigest,
      observationReceipt,
      removed: {
        privateEntries: 203,
        attachedMedia: 29,
        unattachedMedia: 8,
        presentObjectsRevoked: revokedObjects,
      },
      preserved: { publicEntries: 10, publicMedia: 14, publicObjects: 14 },
      zeroState,
      zeroStateDigest: stableEvidenceDigest(zeroState),
    };
  } catch (error) {
    if (transactionOpen) {
      await client.query("rollback").catch(() => undefined);
    }
    if (!clientReleased) client.release();
    const reason = error instanceof Error ? error.message : "unknown_failure";
    throw new Error(
      `ove349_cleanup_inconclusive:${reason}:revoked_objects=${revokedObjects}:candidate_set_digest=${database.candidateSetDigest}`,
    );
  }
}

async function collectLegacyDatabaseEvidence(
  client: PoolClient,
): Promise<LegacyDatabaseEvidence> {
  const schema = await client.query<{ signature: string | null }>(`
    select string_agg(table_name || ':' || column_name || ':' || data_type || ':' || is_nullable, ',' order by table_name, ordinal_position) as signature
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('journal_entry_drafts', 'journal_entries', 'media_assets', 'job_queue')
  `);
  const schemaDigest = stableTextDigest(schema.rows[0]?.signature ?? "");
  const drafts = numbers(
    await one(
      client,
      `
      with classified as (
        select draft.id,
          case
            when attribution.actor_class in ('production_smoke', 'visual_fixture', 'automated_bot') then 'synthetic'
            when attribution.actor_class in ('real_self_serve', 'editorial_seed') then 'genuine'
            when exists (
              select 1 from journal_entries entry
              where entry.owner_user_id = draft.owner_user_id
                and entry.content_class in ('production_smoke', 'visual_fixture')
            ) and not exists (
              select 1 from journal_entries entry
              where entry.owner_user_id = draft.owner_user_id
                and entry.content_class not in ('production_smoke', 'visual_fixture')
            ) then 'synthetic'
            else 'ambiguous'
          end as class
        from journal_entry_drafts draft
        left join learning_actor_attributions attribution
          on attribution.user_id = draft.owner_user_id
      )
      select count(*)::text as total,
        count(*) filter (where class = 'synthetic')::text as synthetic,
        count(*) filter (where class = 'genuine')::text as genuine,
        count(*) filter (where class = 'ambiguous')::text as ambiguous
      from classified
    `,
    ),
  );
  const privateEntries = numbers(
    await one(
      client,
      `
      with classified as (
        select entry.id,
          case
            when attribution.actor_class in ('production_smoke', 'visual_fixture', 'automated_bot') then 'synthetic'
            when attribution.actor_class in ('real_self_serve', 'editorial_seed') then 'genuine'
            when entry.content_class in ('production_smoke', 'visual_fixture') then 'synthetic'
            else 'ambiguous'
          end as class
        from journal_entries entry
        left join learning_actor_attributions attribution
          on attribution.user_id = entry.owner_user_id
        where entry.visibility <> 'public'
      )
      select count(*)::text as total,
        count(*) filter (where class = 'synthetic')::text as synthetic,
        count(*) filter (where class = 'genuine')::text as genuine,
        count(*) filter (where class = 'ambiguous')::text as ambiguous
      from classified
    `,
    ),
  );
  const privateEntryGroups = (
    await client.query<{
      actor_class: string;
      content_class: string;
      lifecycle_state: string;
      namespace_class: string;
      rows: string;
      owners: string;
    }>(`
      select coalesce(attribution.actor_class, 'unclassified') as actor_class,
        coalesce(entry.content_class, 'unclassified') as content_class,
        entry.lifecycle_state,
        case
          when account.email like 'ove%@over.garden' then 'known_ove_canary_namespace'
          when account.email like '%@over.garden' then 'internal_other_namespace'
          else 'external_or_other_namespace'
        end as namespace_class,
        count(*)::text as rows,
        count(distinct entry.owner_user_id)::text as owners
      from journal_entries entry
      join "user" account on account.id = entry.owner_user_id
      left join learning_actor_attributions attribution
        on attribution.user_id = entry.owner_user_id
      where entry.visibility <> 'public'
      group by coalesce(attribution.actor_class, 'unclassified'),
        coalesce(entry.content_class, 'unclassified'), entry.lifecycle_state,
        namespace_class
      order by actor_class, content_class, lifecycle_state, namespace_class
    `)
  ).rows.map((row) => ({
    actorClass: row.actor_class,
    contentClass: row.content_class,
    lifecycleState: row.lifecycle_state,
    namespaceClass: row.namespace_class,
    rows: Number(row.rows),
    owners: Number(row.owners),
  }));
  const media = numbers(
    await one(
      client,
      `
      select count(*)::text as total,
        count(*) filter (
          where quarantine_key like 'atomic-create/%'
             or quarantine_key like 'atomic-edit/%'
        )::text as atomic_final_rows,
        count(*) filter (where quarantine_key like 'quarantine/%')::text as legacy_quarantine_rows,
        count(*) filter (
          where status <> 'processed'
             or media_readiness_state <> 'public_ready'
             or derivative_key is null
             or upload_generation is null
             or processing_claim_token is not null
             or processing_claimed_at is not null
        )::text as nonfinal_or_claimed_rows,
        count(*) filter (
          where processing_claim_token is not null
             or processing_claimed_at is not null
             or media_readiness_state in ('processing', 'derivative_written', 'retryable')
        )::text as inflight_or_retryable_rows,
        count(*) filter (
          where quality_policy_version is not null
             or quality_class is not null
             or quality_reason_codes is not null
             or quality_metrics is not null
             or quality_evaluated_at is not null
        )::text as quality_receipt_rows,
        count(*) filter (
          where journal_entry_id is not null and (
            derivative_key is null
            or upload_generation is null
            or declared_size_bytes is null
            or declared_media_type <> 'image/webp'
            or admitted_media_type <> 'image/webp'
            or status <> 'processed'
            or media_readiness_state <> 'public_ready'
          )
        )::text as attached_nonfinal_rows
      from media_assets
    `,
    ),
  );
  const mediaRows = (
    await client.query<{
      id: string;
      derivative_key: string | null;
      entry_visibility: string | null;
      actor_class: string;
      content_class: string;
      namespace_class: string;
      status: string;
      readiness: string;
      revoked: boolean;
    }>(`
      select media.id, media.derivative_key,
        entry.visibility as entry_visibility,
        coalesce(attribution.actor_class, 'unclassified') as actor_class,
        coalesce(entry.content_class, 'unattached') as content_class,
        case
          when account.email like 'ove%@over.garden' then 'known_ove_canary_namespace'
          when account.email like '%@over.garden' then 'internal_other_namespace'
          else 'external_or_other_namespace'
        end as namespace_class,
        media.status, media.media_readiness_state as readiness,
        media.revoked_at is not null as revoked
      from media_assets media
      join "user" account on account.id = media.owner_user_id
      left join journal_entries entry on entry.id = media.journal_entry_id
      left join learning_actor_attributions attribution
        on attribution.user_id = media.owner_user_id
      order by media.id
    `)
  ).rows.map((row) => ({
    id: row.id,
    derivativeKey: row.derivative_key,
    entryVisibility: row.entry_visibility,
    actorClass: row.actor_class,
    contentClass: row.content_class,
    namespaceClass: row.namespace_class,
    status: row.status,
    readiness: row.readiness,
    revoked: row.revoked,
  }));
  const mediaGroups = groupMediaRows(mediaRows);
  const jobs = numbers(
    await one(
      client,
      `
      select count(*) filter (
          where queue_name = 'media_lifecycle'
            and payload->>'kind' = 'media_quarantine_expire'
            and status in ('pending', 'processing', 'failed')
        )::text as unfinished_legacy_jobs,
        count(*) filter (
          where queue_name = 'media_lifecycle'
            and payload->>'kind' = 'media_staging_finalize'
            and status in ('pending', 'processing', 'failed')
        )::text as unfinished_staging_finalize_jobs,
        count(*) filter (
          where queue_name = 'media_lifecycle'
            and payload->>'kind' = 'media_derivative_revoke'
            and status in ('pending', 'processing', 'failed')
        )::text as unfinished_preserved_revoke_jobs
      from job_queue
    `,
    ),
  );
  const visibility = numbers(
    await one(
      client,
      `
      select count(*) filter (where visibility = 'public')::text as public_rows,
        count(*) filter (where visibility = 'private')::text as private_rows,
        count(*) filter (where visibility not in ('public', 'private'))::text as unexpected_rows
      from journal_entries
    `,
    ),
  );
  const privateEntryIds = (
    await client.query<{ id: string }>(
      "select id from journal_entries where visibility <> 'public' order by id",
    )
  ).rows.map((row) => row.id);
  const candidateMediaRows = mediaRows.filter(
    (row) => row.entryVisibility !== "public",
  );
  const publicMediaRows = mediaRows.filter(
    (row) => row.entryVisibility === "public",
  );
  const privateMediaIds = candidateMediaRows
    .filter((row) => row.entryVisibility !== null)
    .map((row) => row.id)
    .sort();
  const unattachedMediaIds = candidateMediaRows
    .filter((row) => row.entryVisibility === null)
    .map((row) => row.id)
    .sort();
  const publicOverlap = countSetOverlap(
    candidateMediaRows.map((row) => row.derivativeKey),
    publicMediaRows.map((row) => row.derivativeKey),
  );
  const restrictedContributions = Number(
    (
      await client.query<{ count: string }>(
        `select count(*)::text as count
         from community_contributions
         where journal_entry_id = any($1::uuid[])`,
        [privateEntryIds],
      )
    ).rows[0]?.count ?? 0,
  );
  const externalUnattached = candidateMediaRows.filter(
    (row) =>
      row.entryVisibility === null &&
      row.namespaceClass === "external_or_other_namespace",
  ).length;
  const candidates: CandidateSet = {
    privateEntryIds,
    privateMediaIds,
    unattachedMediaIds,
    candidateMediaRows,
    publicMediaRows,
  };
  const candidateMediaIds = [...privateMediaIds, ...unattachedMediaIds];
  const candidateDerivativeKeys = candidateMediaRows
    .map((row) => row.derivativeKey)
    .filter((key): key is string => Boolean(key));
  const dependencyCounts = await collectDependencyCounts(
    client,
    privateEntryIds,
    candidateMediaIds,
    candidateDerivativeKeys,
  );
  if (dependencyCounts.community_contributions !== restrictedContributions) {
    throw new Error("ove349_dependency_classification_inconsistent");
  }
  const databaseReport = {
    schemaDigest,
    drafts,
    privateEntries,
    privateEntryGroups,
    media,
    mediaGroups,
    jobs,
    visibility,
    restrictedContributions,
    externalUnattached,
  };
  const candidateSetDigest = stableEvidenceDigest({
    privateEntryIds,
    media: candidateMediaRows
      .map((row) => ({ id: row.id, derivativeKey: row.derivativeKey }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  });
  return {
    schemaDigest,
    drafts,
    privateEntries,
    privateEntryGroups,
    media,
    mediaGroups,
    jobs,
    visibility,
    mediaRows,
    candidates,
    publicOverlap,
    outsideApprovedScope:
      restrictedContributions +
      externalUnattached +
      dependencyCounts.external_cover_references +
      dependencyCounts.profile_avatar_references,
    databaseEvidenceDigest: stableEvidenceDigest(databaseReport),
    candidateSetDigest,
    dependencyCounts,
    dependencyEvidenceDigest: stableEvidenceDigest(dependencyCounts),
  };
}

async function collectDependencyCounts(
  client: PoolClient,
  entryIds: readonly string[],
  mediaIds: readonly string[],
  derivativeKeys: readonly string[],
): Promise<AggregateCounts> {
  return numbers(
    await one(
      client,
      `select
        (select count(*) from journal_entry_object_mentions
          where journal_entry_id = any($1::uuid[]))::text as object_mentions,
        (select count(*) from journal_entry_catalog_mentions
          where journal_entry_id = any($1::uuid[]))::text as catalog_mentions,
        (select count(*) from journal_entry_topic_signals
          where journal_entry_id = any($1::uuid[]))::text as topic_signals,
        (select count(*) from journal_entry_mutation_receipts
          where journal_entry_id = any($1::uuid[]))::text as mutation_receipts,
        (select count(*) from analytics_events
          where journal_entry_id = any($1::uuid[]))::text as analytics_references,
        (select count(*) from community_contributions
          where journal_entry_id = any($1::uuid[]))::text as community_contributions,
        (select count(*) from public_projection_intents
          where entity_kind = 'journal_entry'
            and entity_id = any($1::uuid[]))::text as projection_intents,
        (select count(*) from job_queue
          where payload->>'mediaAssetId' = any($2::text[])
             or payload->>'journalEntryId' = any($1::text[])
             or payload->>'objectKey' = any($3::text[]))::text as job_references,
        (select count(*) from journal_entries
          where cover_media_asset_id = any($2::uuid[])
            and id <> all($1::uuid[]))::text as external_cover_references,
        (select count(*) from user_public_profiles
          where avatar_media_asset_id = any($2::uuid[]))::text as profile_avatar_references`,
      [entryIds, mediaIds, derivativeKeys],
    ),
  );
}

async function collectProviderEvidence(
  mediaRows: InternalMediaRow[],
  signal: AbortSignal,
): Promise<ProviderEvidence> {
  const r2 = createR2Client();
  const legacyBucket = required("R2_QUARANTINE_BUCKET");
  if (legacyBucket !== EXPECTED_LEGACY_BUCKET) {
    throw new Error("ove349_legacy_bucket_identity_drifted");
  }
  const publicBucket = required("R2_PUBLIC_BUCKET");
  if (publicBucket !== EXPECTED_PUBLIC_BUCKET) {
    throw new Error("ove349_public_bucket_identity_drifted");
  }
  const legacyQuarantineBucket = await collectLegacyBucketAggregate(
    r2,
    legacyBucket,
    signal,
  );
  const objectStatesByMediaId = await probeMediaRows(
    r2,
    publicBucket,
    mediaRows,
    signal,
  );
  const publicDerivativeStates = {
    privateEntryPresent: 0,
    privateEntryAbsent: 0,
    publicEntryPresent: 0,
    publicEntryAbsent: 0,
    unattachedPresent: 0,
    unattachedAbsent: 0,
    providerErrors: 0,
  };
  for (const row of mediaRows) {
    if (!row.derivativeKey) continue;
    const reference =
      row.entryVisibility === "private"
        ? "privateEntry"
        : row.entryVisibility === "public"
          ? "publicEntry"
          : "unattached";
    const state = objectStatesByMediaId.get(row.id);
    if (state === "present") {
      publicDerivativeStates[`${reference}Present`] += 1;
    } else if (state === "not_found") {
      publicDerivativeStates[`${reference}Absent`] += 1;
    } else {
      publicDerivativeStates.providerErrors += 1;
    }
  }
  return {
    publicDerivativeStates,
    legacyQuarantineBucket,
    objectStatesByMediaId,
  };
}

function buildLegacyReport(
  database: LegacyDatabaseEvidence,
  provider: ProviderEvidence,
): LegacyProductionReport {
  return {
    version: "ove349.productionPreflight.v2",
    environment: "production",
    selectOnly: true,
    databaseIdentity: "digitalocean_overgarden_production",
    schemaDigest: database.schemaDigest,
    drafts: database.drafts,
    privateEntries: database.privateEntries,
    privateEntryGroups: database.privateEntryGroups,
    media: database.media,
    mediaGroups: database.mediaGroups,
    publicDerivativeStates: provider.publicDerivativeStates,
    jobs: database.jobs,
    visibility: database.visibility,
    legacyQuarantineBucket: provider.legacyQuarantineBucket,
  };
}

async function collectZeroStateEvidence(
  pool: Pool,
): Promise<ZeroStateEvidence> {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    await client.query("set local statement_timeout = '30000ms'");
    const publicRows = await client.query<{
      id: string;
      derivative_key: string;
    }>(`
      select media.id, media.derivative_key
      from media_assets media
      join journal_entries entry on entry.id = media.journal_entry_id
      where entry.visibility = 'public' and media.derivative_key is not null
      order by media.id
    `);
    const r2 = createR2Client();
    const states = await probeMediaRows(
      r2,
      required("R2_PUBLIC_BUCKET"),
      publicRows.rows.map((row) => ({
        id: row.id,
        derivativeKey: row.derivative_key,
        entryVisibility: "public",
        actorClass: "redacted",
        contentClass: "redacted",
        namespaceClass: "redacted",
        status: "redacted",
        readiness: "redacted",
        revoked: false,
      })),
      AbortSignal.timeout(30_000),
    );
    const evidence = await collectZeroStateEvidenceFromClient(client, states);
    await client.query("commit");
    return evidence;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function collectZeroStateEvidenceFromClient(
  client: PoolClient,
  publicObjectStates: Map<string, ObjectState>,
): Promise<ZeroStateEvidence> {
  const row = await one(
    client,
    `
    select
      (select count(*) from journal_entry_drafts)::text as drafts,
      (select count(*) from journal_entries where visibility <> 'public')::text as private_entries,
      (select count(*) from media_assets where journal_entry_id is null)::text as unattached_media,
      (select count(*) from media_assets media
        left join journal_entries entry on entry.id = media.journal_entry_id
        where entry.id is null or entry.visibility <> 'public'
          or media.derivative_key is null
          or media.status <> 'processed'
          or media.media_readiness_state <> 'public_ready')::text as non_final_media,
      (select count(*) from job_queue
        where status in ('pending', 'processing', 'failed') and payload->>'kind' in (
          'media_quarantine_expire', 'media_staging_finalize', 'media_derivative_revoke'
        ))::text as unfinished_effects,
      (select count(*) from journal_entries where visibility = 'public')::text as public_entries,
      (select count(*) from media_assets media
        join journal_entries entry on entry.id = media.journal_entry_id
        where entry.visibility = 'public')::text as public_media
  `,
  );
  const counts = numbers(row);
  return {
    drafts: counts.drafts,
    privateEntries: counts.private_entries,
    unattachedMedia: counts.unattached_media,
    nonFinalMedia: counts.non_final_media,
    unfinishedEffects: counts.unfinished_effects,
    publicEntries: counts.public_entries,
    publicMedia: counts.public_media,
    publicObjectsPresent: [...publicObjectStates.values()].filter(
      (state) => state === "present",
    ).length,
    publicObjectsMissing: [...publicObjectStates.values()].filter(
      (state) => state === "not_found",
    ).length,
    providerErrors: [...publicObjectStates.values()].filter(
      (state) => state === "provider_error",
    ).length,
  };
}

async function collectContractedEvidence(
  pool: Pool,
): Promise<ContractedEvidence> {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    await client.query("set local statement_timeout = '30000ms'");
    const schema = await client.query<{
      signature: string | null;
      draft_table_absent: boolean;
      retired_media_columns: string;
      preserved_media_columns: string;
      visibility_constraint: string | null;
    }>(`
      select
        (select string_agg(table_name || ':' || column_name || ':' || data_type || ':' || is_nullable, ',' order by table_name, ordinal_position)
         from information_schema.columns
         where table_schema = 'public' and table_name in ('journal_entries', 'media_assets', 'job_queue')) as signature,
        to_regclass('public.journal_entry_drafts') is null as draft_table_absent,
        (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'media_assets'
           and column_name in (
             'quarantine_key', 'status', 'original_deleted_at', 'declared_media_type',
             'admitted_media_type', 'media_readiness_state', 'processing_claim_token',
             'processing_claimed_at', 'upload_generation_id', 'public_object_id',
             'quality_policy_version', 'quality_class', 'quality_reason_codes',
             'quality_metrics', 'quality_evaluated_at'
           )) as retired_media_columns,
        (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'media_assets'
           and column_name in (
             'derivative_key', 'upload_generation', 'declared_size_bytes',
             'journal_entry_id', 'owner_user_id', 'usage_role', 'document_position',
             'alt_text', 'caption', 'focal_x', 'focal_y', 'intrinsic_width',
             'intrinsic_height', 'revoked_at', 'public_unreachable_at', 'created_at', 'updated_at'
           )) as preserved_media_columns,
        (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid = 'journal_entries'::regclass
           and conname = 'journal_entries_visibility_check') as visibility_constraint
    `);
    const counts = numbers(
      await one(
        client,
        `
        select
          (select count(*) from journal_entries where visibility = 'public')::text as public_entries,
          (select count(*) from media_assets)::text as public_media,
          (select count(*) from media_assets where journal_entry_id is null)::text as unattached_media,
          (select count(*) from media_assets media
            left join journal_entries entry on entry.id = media.journal_entry_id
            where entry.id is null or entry.visibility <> 'public' or media.derivative_key is null)::text as non_final_media,
          (select count(*) from job_queue
            where status in ('pending', 'processing', 'failed')
              and payload->>'kind' = 'media_quarantine_expire')::text as unfinished_legacy_effects
      `,
      ),
    );
    const mediaRows = await client.query<{
      id: string;
      derivative_key: string;
    }>("select id, derivative_key from media_assets order by id");
    await client.query("commit");
    const states = await probeMediaRows(
      createR2Client(),
      required("R2_PUBLIC_BUCKET"),
      mediaRows.rows.map((row) => ({
        id: row.id,
        derivativeKey: row.derivative_key,
        entryVisibility: "public",
        actorClass: "redacted",
        contentClass: "redacted",
        namespaceClass: "redacted",
        status: "redacted",
        readiness: "redacted",
        revoked: false,
      })),
      AbortSignal.timeout(30_000),
    );
    const schemaRow = schema.rows[0];
    if (!schemaRow) throw new Error("ove349_contracted_schema_read_missing");
    return {
      version: "ove349.contractedProduction.v1",
      environment: "production",
      databaseIdentity: "digitalocean_overgarden_production",
      schemaDigest: stableTextDigest(schemaRow.signature ?? ""),
      draftTableAbsent: schemaRow.draft_table_absent,
      retiredMediaColumnsAbsent: Number(schemaRow.retired_media_columns) === 0,
      preservedMediaColumnsPresent:
        Number(schemaRow.preserved_media_columns) === 17,
      publicOnlyConstraint:
        schemaRow.visibility_constraint
          ?.replaceAll('"', "")
          .includes("visibility = 'public'::text") ?? false,
      publicEntries: counts.public_entries,
      publicMedia: counts.public_media,
      unattachedMedia: counts.unattached_media,
      nonFinalMedia: counts.non_final_media,
      unfinishedLegacyEffects: counts.unfinished_legacy_effects,
      publicObjectsPresent: [...states.values()].filter(
        (state) => state === "present",
      ).length,
      publicObjectsMissing: [...states.values()].filter(
        (state) => state === "not_found",
      ).length,
      providerErrors: [...states.values()].filter(
        (state) => state === "provider_error",
      ).length,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function assertContractedEvidence(evidence: ContractedEvidence) {
  if (
    !evidence.draftTableAbsent ||
    !evidence.retiredMediaColumnsAbsent ||
    !evidence.preservedMediaColumnsPresent ||
    !evidence.publicOnlyConstraint ||
    evidence.publicEntries !== 10 ||
    evidence.publicMedia !== 14 ||
    evidence.unattachedMedia !== 0 ||
    evidence.nonFinalMedia !== 0 ||
    evidence.unfinishedLegacyEffects !== 0 ||
    evidence.publicObjectsPresent !== 14 ||
    evidence.publicObjectsMissing !== 0 ||
    evidence.providerErrors !== 0
  ) {
    throw new Error("ove349_contracted_production_readback_blocked");
  }
}

function assertCapturedCandidateDigests(database: LegacyDatabaseEvidence) {
  if (
    !/^[a-f0-9]{64}$/.test(APPROVED_DATABASE_EVIDENCE_DIGEST) ||
    !/^[a-f0-9]{64}$/.test(APPROVED_CANDIDATE_SET_DIGEST) ||
    !/^[a-f0-9]{64}$/.test(APPROVED_DEPENDENCY_EVIDENCE_DIGEST)
  ) {
    throw new Error("ove349_read_only_candidate_digest_capture_missing");
  }
  if (
    database.databaseEvidenceDigest !== APPROVED_DATABASE_EVIDENCE_DIGEST ||
    database.candidateSetDigest !== APPROVED_CANDIDATE_SET_DIGEST ||
    database.dependencyEvidenceDigest !== APPROVED_DEPENDENCY_EVIDENCE_DIGEST
  ) {
    throw new Error("ove349_exact_candidate_set_drifted");
  }
}

function isMonotonicObjectOnlyRecovery(
  preflight: Awaited<ReturnType<typeof collectLegacyPreflight>>,
) {
  const gate = toRetirementGateSnapshot(
    preflight.report,
    preflight.evidenceDigest,
  );
  gate.publicOverlap = preflight.database.publicOverlap;
  gate.outsideApprovedScope += preflight.database.outsideApprovedScope;
  return (
    preflight.database.databaseEvidenceDigest ===
      APPROVED_DATABASE_EVIDENCE_DIGEST &&
    preflight.database.candidateSetDigest === APPROVED_CANDIDATE_SET_DIGEST &&
    preflight.database.dependencyEvidenceDigest ===
      APPROVED_DEPENDENCY_EVIDENCE_DIGEST &&
    gate.drafts === 0 &&
    gate.privateEntries === 203 &&
    gate.privateAttachedMedia === 29 &&
    gate.unattachedMedia === 8 &&
    gate.candidatePresentObjects >= 0 &&
    gate.candidatePresentObjects <= 27 &&
    gate.candidatePresentObjects + gate.candidateAbsentObjects === 37 &&
    gate.publicEntries === 10 &&
    gate.publicMedia === 14 &&
    gate.publicPresentObjects === 14 &&
    gate.publicMissingObjects === 0 &&
    gate.providerErrors === 0 &&
    gate.publicOverlap === 0 &&
    gate.outsideApprovedScope === 0 &&
    gate.unfinishedLegacyJobs === 0 &&
    gate.unfinishedStagingJobs === 0 &&
    gate.unfinishedRevokeJobs === 0
  );
}

function groupMediaRows(mediaRows: InternalMediaRow[]) {
  const groups = new Map<string, number>();
  for (const row of mediaRows) {
    const referenceClass =
      row.entryVisibility === "private"
        ? "private_entry"
        : row.entryVisibility === "public"
          ? "public_entry"
          : "unattached";
    const key = [
      referenceClass,
      row.actorClass,
      row.contentClass,
      row.namespaceClass,
      row.status,
      row.readiness,
      row.derivativeKey ? "derivative_recorded" : "no_derivative",
      row.revoked ? "revoked" : "not_revoked",
    ].join("|");
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, rows]) => {
      const [
        referenceClass,
        actorClass,
        contentClass,
        namespaceClass,
        status,
        readiness,
        derivativeClass,
        revokeClass,
      ] = key.split("|");
      return {
        referenceClass: referenceClass ?? "invalid",
        actorClass,
        contentClass,
        namespaceClass,
        status,
        readiness,
        derivativeClass,
        revokeClass,
        rows,
      };
    });
}

async function collectLegacyBucketAggregate(
  r2: S3Client,
  bucket: string,
  signal: AbortSignal,
): Promise<LegacyProductionReport["legacyQuarantineBucket"]> {
  let continuationToken: string | undefined;
  let objectCount = 0;
  let totalBytes = 0;
  let newerThanDay = 0;
  let oneToSevenDays = 0;
  let olderThanSevenDays = 0;
  const now = Date.now();
  do {
    const page = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
      { abortSignal: signal },
    );
    for (const object of page.Contents ?? []) {
      objectCount += 1;
      totalBytes += Number(object.Size ?? 0);
      const age = object.LastModified
        ? now - object.LastModified.getTime()
        : Number.POSITIVE_INFINITY;
      if (age < 86_400_000) newerThanDay += 1;
      else if (age < 7 * 86_400_000) oneToSevenDays += 1;
      else olderThanSevenDays += 1;
    }
    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined;
  } while (continuationToken);
  return {
    identity: "overgarden-quarantine",
    objectCount,
    totalBytes,
    ageBands: { newerThanDay, oneToSevenDays, olderThanSevenDays },
  };
}

async function probeMediaRows(
  r2: S3Client,
  bucket: string,
  rows: InternalMediaRow[],
  signal: AbortSignal,
) {
  const result = new Map<string, ObjectState>();
  await mapWithConcurrency(rows, 8, async (row) => {
    if (!row.derivativeKey) return;
    try {
      const requestSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      ]);
      await r2.send(
        new HeadObjectCommand({ Bucket: bucket, Key: row.derivativeKey }),
        { abortSignal: requestSignal },
      );
      result.set(row.id, "present");
    } catch (error) {
      result.set(row.id, isNotFound(error) ? "not_found" : "provider_error");
    }
  });
  return result;
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, values.length)) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        await operation(values[index]!);
      }
    },
  );
  await Promise.all(workers);
}

function isNotFound(error: unknown) {
  const candidate = error as {
    name?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const name = candidate.name ?? candidate.code ?? "";
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    name === "NotFound" ||
    name === "NoSuchKey"
  );
}

function createR2Client() {
  if (required("R2_FORCE_PATH_STYLE") !== "true") {
    throw new Error("ove349_r2_addressing_drifted");
  }
  return new S3Client({
    region: "auto",
    endpoint: required("R2_ENDPOINT"),
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
}

function createProductionPool() {
  const databaseUrl = new URL(required("DATABASE_URL"));
  if (
    databaseUrl.hostname !== EXPECTED_DATABASE.hostname ||
    databaseUrl.port !== EXPECTED_DATABASE.port ||
    databaseUrl.pathname.slice(1) !== EXPECTED_DATABASE.database
  ) {
    throw new Error("ove349_production_database_identity_drifted");
  }
  databaseUrl.searchParams.delete("sslmode");
  return new Pool({
    connectionString: databaseUrl.toString(),
    max: 1,
    ssl: { rejectUnauthorized: false },
  });
}

function assertProductionEnvironment() {
  if (process.env.VERCEL_ENV !== "production") {
    throw new Error("ove349_requires_vercel_production_environment");
  }
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`OVE-349 operator requires ${name}.`);
  return value;
}

async function one(client: PoolClient, query: string, values: unknown[] = []) {
  const result = await client.query<Record<string, string>>(query, values);
  const row = result.rows[0];
  if (!row) throw new Error("ove349_aggregate_query_returned_no_row");
  return row;
}

function numbers(row: QueryResultRow) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(`ove349_invalid_aggregate:${key}`);
      }
      return [key, parsed];
    }),
  );
}

function stableTextDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function countSetOverlap(
  left: Array<string | null>,
  right: Array<string | null>,
) {
  const rightSet = new Set(
    right.filter((value): value is string => Boolean(value)),
  );
  return left.filter(
    (value): value is string => value !== null && rightSet.has(value),
  ).length;
}

function printReceipt(value: unknown) {
  const serialized = JSON.stringify(value, null, 2);
  if (
    /(?:derivatives\/|atomic-create\/|atomic-edit\/|quarantine\/|@[a-z0-9.-]+|postgres(?:ql)?:\/\/)/i.test(
      serialized,
    )
  ) {
    throw new Error("ove349_receipt_redaction_boundary_failed");
  }
  process.stdout.write(`${serialized}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
