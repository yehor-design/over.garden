import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, JsonValue } from "@/db/schema";
import {
  EXTENSION_PACK_DECISION_ACTIONS,
  isExtensionPackExceptionClass,
  type ExtensionPackCenterReadModel,
  type ExtensionPackDecisionAction,
  type ExtensionPackExceptionGroupSummary,
  type ExtensionPackRowClass,
  type ExtensionPackSummary,
  type ExtensionPackUserNameGroupSummary,
} from "@/lib/stable-registry/extension-pack-actions";
import { buildEnqueueCatalogTypeaheadReindexJobQuery } from "@/server/catalog-repository";
import type { PackArtifact } from "@/server/catalog-source/pack-artifact-contract";
import type { RequestScope } from "@/server/request-scope";

import { stableRegistryDigest } from "./foundation-builder";
import { STABLE_REGISTRY_INTERACTIVE_DEADLINE_MS } from "./release-repository";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND =
  "stable_registry_extension_pack_build" as const;
export const STABLE_REGISTRY_EXTENSION_PACK_POLICY_VERSION =
  "ove328.extensionPack.v1" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export { EXTENSION_PACK_DECISION_ACTIONS };
export type {
  ExtensionPackCenterReadModel,
  ExtensionPackDecisionAction,
  ExtensionPackExceptionGroupSummary,
  ExtensionPackSummary,
};

export type ExtensionPackOutcome =
  | "accepted"
  | "confirmation_required"
  | "stale"
  | "blocked"
  | "forbidden"
  | "not_found";

export interface ExtensionPackImportResult {
  outcome: Extract<ExtensionPackOutcome, "accepted" | "blocked">;
  pack: ExtensionPackSummary | null;
  replayed: boolean;
}

export interface ExtensionPackActionResult {
  outcome: ExtensionPackOutcome;
  pack: ExtensionPackSummary | null;
}

export interface ExtensionPackActivationResult extends ExtensionPackActionResult {
  searchProjection: "queued" | "not_applicable";
}

/**
 * Persists one OVE-327 artifact as an immutable pack draft.
 *
 * Pack identity is the artifact, not the run: re-importing the same bytes
 * returns the existing pack unchanged, and changed bytes open a new pack rather
 * than mutating the prior one. A blocked-rights family is stored so its hold is
 * auditable, but no row of it can ever reach `product_eligible`.
 */
export async function importExtensionPackDraft(
  scope: RequestScope,
  input: { artifact: PackArtifact; writesEnabled: boolean },
  database: Kysely<Database> = db,
): Promise<ExtensionPackImportResult> {
  if (!input.writesEnabled) {
    return { outcome: "blocked", pack: null, replayed: false };
  }
  if (
    !SHA256_PATTERN.test(input.artifact.artifactDigest) ||
    !SHA256_PATTERN.test(input.artifact.artifactByteDigest)
  ) {
    return { outcome: "blocked", pack: null, replayed: false };
  }

  return database.transaction().execute(async (transaction) => {
    await setInteractiveDeadline(transaction);

    const existing = await readPackByArtifact(transaction, input.artifact);
    if (existing) {
      return { outcome: "accepted" as const, pack: existing, replayed: true };
    }

    const inserted = await sql<{ id: string }>`
      insert into catalog_registry_extension_packs (
        source_slug,
        declared_source_version,
        adapter_version,
        artifact_schema_version,
        artifact_digest,
        artifact_byte_digest,
        pack_kind,
        source_rights,
        state,
        safe_summary,
        created_by_user_id
      ) values (
        ${input.artifact.sourceSlug},
        ${input.artifact.declaredSourceVersion},
        ${input.artifact.adapterVersion},
        ${input.artifact.schemaVersion},
        ${input.artifact.artifactDigest},
        ${input.artifact.artifactByteDigest},
        ${input.artifact.packKind},
        ${input.artifact.sourceRights},
        'classified',
        ${JSON.stringify({ counts: input.artifact.counts })}::jsonb,
        ${requireUuid(scope.userId, "owner")}::uuid
      )
      on conflict (source_slug, declared_source_version, artifact_digest)
        do nothing
      returning id
    `.execute(transaction);

    const packId = inserted.rows[0]?.id;
    if (!packId) {
      // A concurrent import won the unique key; return its pack rather than a
      // second one for the same artifact.
      const raced = await readPackByArtifact(transaction, input.artifact);
      return raced
        ? { outcome: "accepted" as const, pack: raced, replayed: true }
        : { outcome: "blocked" as const, pack: null, replayed: false };
    }

    for (const row of input.artifact.rows) {
      const rowResult = await sql<{ id: string }>`
        insert into catalog_registry_extension_pack_rows (
          pack_id,
          source_record_key,
          official_denomination,
          normalized_denomination,
          locale,
          public_slug,
          parent_scientific_name,
          parent_evidence_class,
          row_class
        ) values (
          ${packId}::uuid,
          ${row.sourceRecordKey},
          ${row.officialDenomination},
          ${row.normalizedDenomination},
          ${row.locale},
          ${row.publicSlug || null},
          ${row.parentCandidate.scientificName},
          ${row.parentCandidate.evidenceClass},
          ${row.classification}
        )
        on conflict (pack_id, source_record_key) do nothing
        returning id
      `.execute(transaction);

      const packRowId = rowResult.rows[0]?.id;
      if (!packRowId) continue;

      await sql`
        insert into catalog_registry_extension_pack_names (
          pack_row_id, name_class, locale, display_name, normalized_name
        ) values (
          ${packRowId}::uuid,
          'official_denomination',
          ${row.locale},
          ${row.officialDenomination},
          ${row.normalizedDenomination}
        )
        on conflict do nothing
      `.execute(transaction);

      for (const alias of row.aliases) {
        await sql`
          insert into catalog_registry_extension_pack_names (
            pack_row_id, name_class, locale, display_name, normalized_name
          ) values (
            ${packRowId}::uuid,
            ${alias.nameClass},
            ${alias.locale},
            ${alias.displayName},
            ${alias.normalizedName}
          )
          on conflict do nothing
        `.execute(transaction);
      }
    }

    await enqueueExtensionPackBuild(transaction, packId);

    const pack = await requirePack(transaction, packId);
    return { outcome: "accepted" as const, pack, replayed: false };
  });
}

export async function readExtensionPackCenter(
  input: { writesEnabled: boolean; packId?: string },
  database: Kysely<Database> = db,
): Promise<ExtensionPackCenterReadModel> {
  return database.transaction().execute(async (transaction) => {
    await setInteractiveDeadline(transaction);
    const packs = await readPacks(transaction);
    const selectedPack = input.packId
      ? (packs.find((pack) => pack.id === input.packId) ?? null)
      : (packs[0] ?? null);

    return {
      packs,
      selectedPack,
      exceptionGroups: selectedPack
        ? await readExceptionGroups(transaction, selectedPack.id)
        : [],
      userNameGroups: selectedPack
        ? await readUserNameGroups(transaction, selectedPack.id)
        : [],
      writesEnabled: input.writesEnabled,
    };
  });
}

/**
 * Records one closed decision against a row group.
 *
 * `bind_parent` is the only action that can move a row toward eligibility, and
 * it resolves the parent through the active product projection so an inactive,
 * wrong-kind, or source-only parent cannot be bound.
 */
export async function decideExtensionPackGroup(
  scope: RequestScope,
  input: {
    packId: string;
    rowClass: ExtensionPackRowClass;
    action: ExtensionPackDecisionAction;
    expectedVersion: number;
    parentCatalogItemId?: string;
    writesEnabled: boolean;
  },
  database: Kysely<Database> = db,
): Promise<ExtensionPackActionResult> {
  if (!input.writesEnabled) return { outcome: "blocked", pack: null };
  if (!EXTENSION_PACK_DECISION_ACTIONS.includes(input.action)) {
    return { outcome: "blocked", pack: null };
  }
  const packId = normalizeUuid(input.packId);
  if (!packId) return { outcome: "not_found", pack: null };

  return database.transaction().execute(async (transaction) => {
    await setInteractiveDeadline(transaction);
    const pack = await readPackForUpdate(transaction, packId);
    if (!pack) return { outcome: "not_found" as const, pack: null };
    if (pack.version !== input.expectedVersion) {
      return { outcome: "stale" as const, pack };
    }
    if (pack.state === "approved" || pack.state === "active") {
      // Approved pack rows are immutable evidence.
      return { outcome: "blocked" as const, pack };
    }

    if (input.action === "bind_parent") {
      const parentId = normalizeUuid(input.parentCatalogItemId ?? "");
      if (!parentId) return { outcome: "blocked" as const, pack };

      const parent = await sql<{ objectKindScope: string }>`
        select records.object_kind_scope as "objectKindScope"
        from stable_registry_product_catalog_records as records
        join catalog_registry_active_pointers as pointers
          on pointers.release_family = 'foundation'
         and pointers.active_release_id = records.registry_release_id
        where records.catalog_item_id = ${parentId}::uuid
      `.execute(transaction);
      const scopeValue = parent.rows[0]?.objectKindScope;
      if (!scopeValue) {
        // No active product parent: the group stays held rather than binding
        // to a catalog row that is not currently a released identity.
        return { outcome: "blocked" as const, pack };
      }
      if (!parentScopeAllowsPackKind(scopeValue, pack.packKind)) {
        return { outcome: "blocked" as const, pack };
      }

      await sql`
        update catalog_registry_extension_pack_rows
        set parent_catalog_item_id = ${parentId}::uuid,
            row_class = 'clean',
            updated_at = now()
        where pack_id = ${packId}::uuid
          and row_class = ${input.rowClass}
          and row_class not in ('rights_blocked', 'rejected')
      `.execute(transaction);
    } else if (input.action === "reject") {
      await sql`
        update catalog_registry_extension_pack_rows
        set row_class = 'rejected', updated_at = now()
        where pack_id = ${packId}::uuid
          and row_class = ${input.rowClass}
      `.execute(transaction);
    } else if (input.action === "defer") {
      await sql`
        update catalog_registry_extension_pack_rows
        set row_class = 'review_needed', updated_at = now()
        where pack_id = ${packId}::uuid
          and row_class = ${input.rowClass}
          and row_class not in ('rights_blocked', 'rejected')
      `.execute(transaction);
    }
    // `same_item`, `different_item`, and `add_alias` record an owner judgement
    // about naming; they never change a row's eligibility on their own.

    await bumpPackVersion(transaction, packId);
    return {
      outcome: "accepted" as const,
      pack: await requirePack(transaction, packId),
    };
  });
}

/** Binds one immutable preview digest to the pack's current classified state. */
export async function approveExtensionPackPreview(
  scope: RequestScope,
  input: { packId: string; expectedVersion: number; writesEnabled: boolean },
  database: Kysely<Database> = db,
): Promise<ExtensionPackActionResult> {
  if (!input.writesEnabled) return { outcome: "blocked", pack: null };
  const packId = normalizeUuid(input.packId);
  if (!packId) return { outcome: "not_found", pack: null };

  return database.transaction().execute(async (transaction) => {
    await setInteractiveDeadline(transaction);
    const pack = await readPackForUpdate(transaction, packId);
    if (!pack) return { outcome: "not_found" as const, pack: null };
    if (pack.version !== input.expectedVersion) {
      return { outcome: "stale" as const, pack };
    }
    if (pack.state !== "classified" && pack.state !== "review_ready") {
      return { outcome: "blocked" as const, pack };
    }

    const blocking = await sql<{ count: number }>`
      select count(*)::int as count
      from catalog_registry_extension_pack_rows
      where pack_id = ${packId}::uuid
        and row_class in ('needs_parent', 'collision', 'duplicate', 'review_needed')
    `.execute(transaction);
    if (Number(blocking.rows[0]?.count ?? 0) > 0) {
      return { outcome: "blocked" as const, pack };
    }

    // Only a clean row with a bound parent becomes product eligible; a
    // rights-blocked row is never promoted by an approval.
    await sql`
      update catalog_registry_extension_pack_rows
      set row_class = 'product_eligible', updated_at = now()
      where pack_id = ${packId}::uuid
        and row_class = 'clean'
        and parent_catalog_item_id is not null
    `.execute(transaction);

    const previewDigest = stableRegistryDigest({
      packId,
      artifactDigest: pack.artifactDigest,
      policyVersion: STABLE_REGISTRY_EXTENSION_PACK_POLICY_VERSION,
    });
    await sql`
      update catalog_registry_extension_packs
      set state = 'approved',
          preview_digest = ${previewDigest},
          approved_by_user_id = ${requireUuid(scope.userId, "owner")}::uuid,
          approved_at = now(),
          version = version + 1,
          updated_at = now()
      where id = ${packId}::uuid
    `.execute(transaction);

    return {
      outcome: "accepted" as const,
      pack: await requirePack(transaction, packId),
    };
  });
}

/**
 * Activates one approved pack against its extension release.
 *
 * The activation reuses the OVE-257 product projection and the existing
 * typeahead rebuild; it never creates a second search owner.
 */
export async function activateExtensionPack(
  scope: RequestScope,
  input: { packId: string; previewDigest: string; writesEnabled: boolean },
  database: Kysely<Database> = db,
): Promise<ExtensionPackActivationResult> {
  if (!input.writesEnabled) {
    return {
      outcome: "blocked",
      pack: null,
      searchProjection: "not_applicable",
    };
  }
  if (!SHA256_PATTERN.test(input.previewDigest)) {
    return { outcome: "stale", pack: null, searchProjection: "not_applicable" };
  }
  const packId = normalizeUuid(input.packId);
  if (!packId) {
    return {
      outcome: "not_found",
      pack: null,
      searchProjection: "not_applicable",
    };
  }

  return database.transaction().execute(async (transaction) => {
    await setInteractiveDeadline(transaction);
    const pack = await readPackForUpdate(transaction, packId);
    if (!pack) {
      return {
        outcome: "not_found" as const,
        pack: null,
        searchProjection: "not_applicable" as const,
      };
    }
    if (pack.state === "active") {
      return {
        outcome: "accepted" as const,
        pack,
        searchProjection: "queued" as const,
      };
    }
    if (
      pack.state !== "approved" ||
      pack.previewDigest !== input.previewDigest
    ) {
      return {
        outcome: "stale" as const,
        pack,
        searchProjection: "not_applicable" as const,
      };
    }

    const activeFoundation = await sql<{ activeReleaseId: string | null }>`
      select active_release_id as "activeReleaseId"
      from catalog_registry_active_pointers
      where release_family = 'foundation'
      for update
    `.execute(transaction);
    const foundationReleaseId =
      activeFoundation.rows[0]?.activeReleaseId ?? null;
    if (!foundationReleaseId) {
      // An extension has no meaning without an active Foundation to extend.
      return {
        outcome: "blocked" as const,
        pack,
        searchProjection: "not_applicable" as const,
      };
    }

    await sql`
      update catalog_registry_extension_packs
      set state = 'active',
          release_id = ${foundationReleaseId}::uuid,
          activated_by_user_id = ${requireUuid(scope.userId, "owner")}::uuid,
          activated_at = now(),
          version = version + 1,
          updated_at = now()
      where id = ${packId}::uuid
        and state = 'approved'
    `.execute(transaction);

    await sql`select materialize_stable_registry_extension_pack(${packId}::uuid)`.execute(
      transaction,
    );
    await buildEnqueueCatalogTypeaheadReindexJobQuery(
      transaction,
    ).executeTakeFirst();

    return {
      outcome: "accepted" as const,
      pack: await requirePack(transaction, packId),
      searchProjection: "queued" as const,
    };
  });
}

export async function abandonExtensionPack(
  _scope: RequestScope,
  input: { packId: string; writesEnabled: boolean },
  database: Kysely<Database> = db,
): Promise<ExtensionPackActionResult> {
  if (!input.writesEnabled) return { outcome: "blocked", pack: null };
  const packId = normalizeUuid(input.packId);
  if (!packId) return { outcome: "not_found", pack: null };

  return database.transaction().execute(async (transaction) => {
    await setInteractiveDeadline(transaction);
    const pack = await readPackForUpdate(transaction, packId);
    if (!pack) return { outcome: "not_found" as const, pack: null };
    if (pack.state === "approved" || pack.state === "active") {
      return { outcome: "blocked" as const, pack };
    }

    await sql`
      update catalog_registry_extension_packs
      set state = 'abandoned', version = version + 1, updated_at = now()
      where id = ${packId}::uuid
    `.execute(transaction);
    return {
      outcome: "accepted" as const,
      pack: await requirePack(transaction, packId),
    };
  });
}

export function parentScopeAllowsPackKind(
  objectKindScope: string,
  packKind: "plant_variety" | "breed",
): boolean {
  if (objectKindScope === "either") return true;
  return packKind === "breed"
    ? objectKindScope === "animal"
    : objectKindScope === "plant";
}

export function buildEnqueueExtensionPackBuildJobQuery(
  executor: QueryExecutor,
  packId: string,
) {
  const payload = {
    kind: STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND,
    packId,
  } satisfies JsonValue;

  return executor
    .insertInto("job_queue")
    .values({
      queue_name: "matching",
      payload,
      idempotency_key: `stable-registry-extension-pack:${packId}`,
    })
    .onConflict((conflict) =>
      conflict
        .column("idempotency_key")
        .where("idempotency_key", "is not", null)
        .doNothing(),
    )
    .returning("id");
}

async function enqueueExtensionPackBuild(
  executor: QueryExecutor,
  packId: string,
) {
  await buildEnqueueExtensionPackBuildJobQuery(
    executor,
    packId,
  ).executeTakeFirst();
}

async function readPacks(
  executor: QueryExecutor,
): Promise<ExtensionPackSummary[]> {
  const result = await sql<ExtensionPackSummary>`
    select
      packs.id,
      packs.source_slug as "sourceSlug",
      packs.declared_source_version as "declaredSourceVersion",
      packs.pack_kind as "packKind",
      packs.source_rights as "sourceRights",
      packs.state,
      packs.artifact_digest as "artifactDigest",
      packs.preview_digest as "previewDigest",
      packs.release_id as "releaseId",
      packs.version,
      packs.created_at as "createdAt",
      packs.approved_at as "approvedAt",
      packs.activated_at as "activatedAt",
      (select count(*)::int from catalog_registry_extension_pack_rows as rows
        where rows.pack_id = packs.id) as "rowCount",
      (select count(*)::int from catalog_registry_extension_pack_rows as rows
        where rows.pack_id = packs.id and rows.row_class = 'clean') as "cleanRowCount",
      (select count(*)::int from catalog_registry_extension_pack_rows as rows
        where rows.pack_id = packs.id and rows.row_class = 'product_eligible')
        as "productEligibleRowCount",
      (select count(*)::int from catalog_registry_extension_pack_rows as rows
        where rows.pack_id = packs.id
          and rows.row_class in ('needs_parent', 'collision', 'duplicate', 'review_needed', 'rights_blocked'))
        as "exceptionRowCount"
    from catalog_registry_extension_packs as packs
    where packs.state <> 'abandoned'
    order by packs.created_at desc
    limit 50
  `.execute(executor);
  return result.rows;
}

async function readPackByArtifact(
  executor: QueryExecutor,
  artifact: PackArtifact,
): Promise<ExtensionPackSummary | null> {
  const packs = await readPacks(executor);
  return (
    packs.find(
      (pack) =>
        pack.sourceSlug === artifact.sourceSlug &&
        pack.declaredSourceVersion === artifact.declaredSourceVersion &&
        pack.artifactDigest === artifact.artifactDigest,
    ) ?? null
  );
}

async function readPackForUpdate(
  executor: QueryExecutor,
  packId: string,
): Promise<ExtensionPackSummary | null> {
  await sql`
    select 1 from catalog_registry_extension_packs
    where id = ${packId}::uuid
    for update
  `.execute(executor);
  const packs = await readPacks(executor);
  return packs.find((pack) => pack.id === packId) ?? null;
}

async function requirePack(executor: QueryExecutor, packId: string) {
  const pack = await readPackForUpdate(executor, packId);
  if (!pack) throw new Error("extension_pack_missing_after_write");
  return pack;
}

async function readExceptionGroups(
  executor: QueryExecutor,
  packId: string,
): Promise<ExtensionPackExceptionGroupSummary[]> {
  const result = await sql<{
    rowClass: ExtensionPackRowClass;
    rowCount: number;
    parentBoundCount: number;
    expectedVersion: number;
  }>`
    select
      rows.row_class as "rowClass",
      count(*)::int as "rowCount",
      count(rows.parent_catalog_item_id)::int as "parentBoundCount",
      (select packs.version from catalog_registry_extension_packs as packs
        where packs.id = ${packId}::uuid) as "expectedVersion"
    from catalog_registry_extension_pack_rows as rows
    where rows.pack_id = ${packId}::uuid
    group by rows.row_class
    order by rows.row_class
  `.execute(executor);

  return result.rows.filter((group) =>
    isExtensionPackExceptionClass(group.rowClass),
  );
}

async function readUserNameGroups(
  executor: QueryExecutor,
  packId: string,
): Promise<ExtensionPackUserNameGroupSummary[]> {
  const result = await sql<ExtensionPackUserNameGroupSummary>`
    select
      names.state,
      count(*)::int as "nameCount",
      max(names.expected_version)::int as "expectedVersion"
    from catalog_registry_extension_pack_user_names as names
    where names.pack_id = ${packId}::uuid
    group by names.state
    order by names.state
  `.execute(executor);
  return result.rows;
}

async function bumpPackVersion(executor: QueryExecutor, packId: string) {
  await sql`
    update catalog_registry_extension_packs
    set version = version + 1, updated_at = now()
    where id = ${packId}::uuid
  `.execute(executor);
}

async function setInteractiveDeadline(executor: QueryExecutor) {
  await sql`
    select set_config(
      'statement_timeout',
      ${`${STABLE_REGISTRY_INTERACTIVE_DEADLINE_MS}ms`},
      true
    )
  `.execute(executor);
}

function normalizeUuid(value: string) {
  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

function requireUuid(value: string | null | undefined, label: string) {
  const normalized = normalizeUuid(value ?? "");
  if (!normalized) throw new Error(`extension_pack_${label}_required`);
  return normalized;
}
