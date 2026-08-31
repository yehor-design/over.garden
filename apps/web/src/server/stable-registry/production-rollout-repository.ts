import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  STABLE_REGISTRY_PRODUCTION_FLAGS,
  type BackupClass,
  type CapacityClass,
  type StableRegistryProductionPlanInputs,
} from "@/lib/catalog/stable-registry-production-plan";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * OVE-259 — aggregate, redacted read-back for the production landing.
 *
 * Every query here returns counts, classes, and digests. None returns a
 * catalog name, a source row, an object id, an owner id, or journal content, so
 * a rollout receipt can be pasted into an issue without redaction work.
 */
export const STABLE_REGISTRY_PRODUCTION_LOCK_KEY = 259_2026;

export interface StableRegistryProductionClassification {
  appliedMigrations: string[];
  sourceInventoryTotal: number;
  sourceInventoryDigest: string;
  activeReleaseId: string | null;
  productEligibleCount: number;
  publicCatalogRecordCount: number;
  affectedObjectCount: number;
  flagsPresent: Record<string, boolean>;
}

export interface StableRegistryProductionVerification {
  activeReleaseId: string | null;
  productProjectionCount: number;
  publicCatalogRecordCount: number;
  /** Rows the projection claims but the active release does not own. */
  projectionParityGap: number;
  /** Objects whose catalog identity is not in the active release. */
  orphanedObjectCount: number;
  userRowsMutated: 0;
}

export async function classifyStableRegistryProduction(
  executor: QueryExecutor = db,
  env: Record<string, string | undefined> = process.env,
): Promise<StableRegistryProductionClassification> {
  // There is no migration ledger: bootstrap replays every versioned SQL file
  // idempotently. "Applied" therefore means the objects a migration creates
  // exist, which is a directly verifiable signal rather than a bookkeeping row.
  const applied = await readAppliedRegistryMigrations(executor);

  // Classify runs against a database where none of these tables may exist yet:
  // discovering exactly that is its job. Each read is therefore conditional on
  // its own migration being present, and a missing one reports zero rather
  // than aborting the phase.
  const has = (migration: string) => applied.includes(migration);

  const capture = has("0023_ove254_eppo_observed_capture.sql")
    ? await sql<{ total: number | null; digest: string | null }>`
        select
          runs.inventory_end_total as total,
          runs.manifest_sha256 as digest
        from catalog_source_capture_runs as runs
        where runs.state = 'completed'
        order by runs.observed_ended_at desc nulls last
        limit 1
      `.execute(executor)
    : { rows: [] as Array<{ total: number | null; digest: string | null }> };

  const pointer = has("0024_ove255_stable_registry_foundation.sql")
    ? await sql<{ activeReleaseId: string | null }>`
        select active_release_id as "activeReleaseId"
        from catalog_registry_active_pointers
        where release_family = 'foundation'
      `.execute(executor)
    : { rows: [] as Array<{ activeReleaseId: string | null }> };
  const activeReleaseId = pointer.rows[0]?.activeReleaseId ?? null;

  const productEligibleCount = has("0024_ove255_stable_registry_foundation.sql")
    ? await countOf(
        executor,
        sql`
          select count(*)::int as count
          from catalog_registry_release_members as members
          where members.release_id = ${activeReleaseId}::uuid
            and members.eligibility = 'product_eligible'
        `,
      )
    : 0;

  const publicCatalogRecordCount = has(
    "0025_ove256_stable_registry_public_reads.sql",
  )
    ? await countOf(
        executor,
        sql`
          select count(*)::int as count
          from stable_registry_public_catalog_records as records
          where records.registry_release_id = ${activeReleaseId}::uuid
        `,
      )
    : 0;

  // `plant_objects` predates this program, so its count is always readable.
  const affectedObjectCount = await countOf(
    executor,
    sql`
      select count(*)::int as count
      from plant_objects
      where plant_objects.catalog_item_id is not null
    `,
  );

  return {
    appliedMigrations: applied,
    sourceInventoryTotal: Number(capture.rows[0]?.total ?? 0),
    sourceInventoryDigest: capture.rows[0]?.digest ?? "",
    activeReleaseId,
    productEligibleCount,
    publicCatalogRecordCount,
    affectedObjectCount,
    flagsPresent: Object.fromEntries(
      STABLE_REGISTRY_PRODUCTION_FLAGS.map((flag) => [
        flag,
        env[flag] === "true",
      ]),
    ),
  };
}

/**
 * Reads the production state back after an apply.
 *
 * `projectionParityGap` and `orphanedObjectCount` are the two numbers that must
 * be zero: the first proves the derived projection owns exactly the active
 * release, the second proves no gardener's object was left pointing at an
 * identity the release does not contain.
 */
export async function verifyStableRegistryProduction(
  executor: QueryExecutor = db,
): Promise<StableRegistryProductionVerification> {
  // Verify can legitimately run before the schema exists — for example when an
  // apply was refused. It reports an unpopulated, zero-gap state rather than
  // throwing on a relation that is not there yet.
  const applied = await readAppliedRegistryMigrations(executor);
  if (
    !applied.includes("0024_ove255_stable_registry_foundation.sql") ||
    !applied.includes("0026_ove257_stable_registry_product_projection.sql")
  ) {
    return {
      activeReleaseId: null,
      productProjectionCount: 0,
      publicCatalogRecordCount: 0,
      projectionParityGap: 0,
      orphanedObjectCount: 0,
      userRowsMutated: 0,
    };
  }

  const pointer = await sql<{ activeReleaseId: string | null }>`
    select active_release_id as "activeReleaseId"
    from catalog_registry_active_pointers
    where release_family = 'foundation'
  `.execute(executor);
  const activeReleaseId = pointer.rows[0]?.activeReleaseId ?? null;

  const result = await sql<{
    projectionCount: number;
    publicCount: number;
    parityGap: number;
    orphanedObjects: number;
  }>`
    select
      coalesce((
        select count(*)::int from stable_registry_product_catalog_records as records
        where records.registry_release_id = ${activeReleaseId}::uuid
      ), 0) as "projectionCount",
      coalesce((
        select count(*)::int from stable_registry_public_catalog_records as records
        where records.registry_release_id = ${activeReleaseId}::uuid
      ), 0) as "publicCount",
      coalesce((
        select count(*)::int
        from stable_registry_product_catalog_records as records
        where records.registry_release_id = ${activeReleaseId}::uuid
          and not exists (
            select 1 from catalog_registry_release_members as members
            where members.release_id = records.registry_release_id
              and members.catalog_item_id = records.catalog_item_id
              and members.eligibility = 'product_eligible'
          )
      ), 0) as "parityGap",
      coalesce((
        select count(*)::int
        from plant_objects
        where plant_objects.catalog_item_id is not null
          and not exists (
            select 1 from catalog_registry_release_members as members
            where members.release_id = ${activeReleaseId}::uuid
              and members.catalog_item_id = plant_objects.catalog_item_id
          )
      ), 0) as "orphanedObjects"
  `.execute(executor);

  return {
    activeReleaseId,
    productProjectionCount: Number(result.rows[0]?.projectionCount ?? 0),
    publicCatalogRecordCount: Number(result.rows[0]?.publicCount ?? 0),
    projectionParityGap: Number(result.rows[0]?.parityGap ?? 0),
    orphanedObjectCount: Number(result.rows[0]?.orphanedObjects ?? 0),
    // The rollout writes registry state only. This is a declared invariant the
    // harness re-proves rather than a value read from a mutation counter.
    userRowsMutated: 0,
  };
}

/**
 * One sentinel relation per Stable Registry migration. If the relation exists,
 * that migration's schema is present in this database.
 */
const REGISTRY_MIGRATION_SENTINELS: ReadonlyArray<
  readonly [migration: string, relation: string]
> = [
  ["0023_ove254_eppo_observed_capture.sql", "catalog_source_capture_runs"],
  ["0024_ove255_stable_registry_foundation.sql", "catalog_registry_releases"],
  [
    "0025_ove256_stable_registry_public_reads.sql",
    "stable_registry_public_catalog_records",
  ],
  [
    "0026_ove257_stable_registry_product_projection.sql",
    "stable_registry_product_catalog_records",
  ],
  [
    "0027_ove328_stable_registry_extension_packs.sql",
    "catalog_registry_extension_packs",
  ],
  [
    "0028_ove258_stable_registry_editions.sql",
    "catalog_registry_activation_sequence",
  ],
];

async function countOf(
  executor: QueryExecutor,
  query: ReturnType<typeof sql>,
): Promise<number> {
  const result = await query.execute(executor);
  const row = result.rows[0] as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

/**
 * Every registry relation this program knows how to account for. A relation in
 * the registry namespace that is not listed here means production and this
 * program disagree about schema history, which the plan must refuse rather
 * than reconcile.
 */
const KNOWN_REGISTRY_RELATIONS: ReadonlySet<string> = new Set([
  "catalog_source_capture_runs",
  "catalog_source_capture_units",
  "catalog_item_revisions",
  "catalog_registry_releases",
  "catalog_registry_release_members",
  "catalog_registry_exception_groups",
  "catalog_registry_decisions",
  "catalog_registry_active_pointers",
  "catalog_registry_activations",
  "catalog_registry_search_outbox",
  "catalog_registry_extension_packs",
  "catalog_registry_extension_pack_rows",
  "catalog_registry_extension_pack_names",
  "catalog_registry_extension_pack_user_names",
  "catalog_registry_edition_diffs",
  "catalog_registry_item_relations",
  "catalog_registry_activation_sequence",
  "stable_registry_public_catalog_records",
  "stable_registry_public_catalog_search_terms",
  "stable_registry_public_eppo_records",
  "stable_registry_public_eppo_search_terms",
  "stable_registry_product_catalog_records",
  "stable_registry_product_catalog_names",
  "stable_registry_product_projection_outbox",
]);

/**
 * Returns the migrations whose schema is present, plus one synthetic
 * `unknown_registry_relation` entry for any registry relation this program does
 * not recognise. The plan refuses on the latter, so that guard is live rather
 * than reachable only from a unit test.
 */
export async function readAppliedRegistryMigrations(
  executor: QueryExecutor,
): Promise<string[]> {
  const present = await sql<{ tableName: string }>`
    select table_name as "tableName"
    from information_schema.tables
    where table_schema = 'public'
      and (
        table_name like 'catalog\\_registry\\_%'
        or table_name like 'stable\\_registry\\_%'
        or table_name like 'catalog\\_source\\_capture\\_%'
        or table_name = 'catalog_item_revisions'
      )
  `.execute(executor);
  const existing = new Set(present.rows.map((row) => row.tableName));

  const applied = REGISTRY_MIGRATION_SENTINELS.filter(([, relation]) =>
    existing.has(relation),
  ).map(([migration]) => migration);

  const unrecognised = [...existing]
    .filter((relation) => !KNOWN_REGISTRY_RELATIONS.has(relation))
    .sort()
    .map((relation) => `0029_unknown_registry_relation_${relation}.sql`);

  return [...applied, ...unrecognised];
}

export function toPlanInputs(input: {
  classification: StableRegistryProductionClassification;
  deploymentSha: string;
  releasePolicyVersion: string;
  storageHeadroomClass: CapacityClass;
  backupFreshnessClass: BackupClass;
}): StableRegistryProductionPlanInputs {
  return {
    environment: "production",
    deploymentSha: input.deploymentSha,
    appliedMigrations: input.classification.appliedMigrations,
    sourceInventoryTotal: input.classification.sourceInventoryTotal,
    sourceInventoryDigest: input.classification.sourceInventoryDigest,
    releasePolicyVersion: input.releasePolicyVersion,
    storageHeadroomClass: input.storageHeadroomClass,
    backupFreshnessClass: input.backupFreshnessClass,
    affectedObjectCount: input.classification.affectedObjectCount,
    activeReleaseId: input.classification.activeReleaseId,
  };
}

/**
 * One production rollout writer at a time. A second operator receives
 * `rollout_already_running` and performs no effect at all.
 */
export async function withProductionRolloutLock<T>(
  database: Kysely<Database>,
  run: (executor: Transaction<Database>) => Promise<T>,
): Promise<
  { status: "ran"; value: T } | { status: "rollout_already_running" }
> {
  return database.transaction().execute(async (transaction) => {
    const acquired = await sql<{ locked: boolean }>`
      select pg_try_advisory_xact_lock(${STABLE_REGISTRY_PRODUCTION_LOCK_KEY}) as locked
    `.execute(transaction);
    if (!acquired.rows[0]?.locked) {
      return { status: "rollout_already_running" as const };
    }
    return { status: "ran" as const, value: await run(transaction) };
  });
}
