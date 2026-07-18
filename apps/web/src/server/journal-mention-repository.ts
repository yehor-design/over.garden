import "server-only";

import { createHash } from "node:crypto";

import { sql, type Insertable, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  Database,
  LineageSourceReferenceKind,
} from "@/db/schema";
import type {
  JournalMentionSelection,
  JournalMentionSuggestion,
  JournalMentionTargetKind,
} from "@/lib/garden/journal-mentions";
import { normalizeJournalMentionSelections } from "@/lib/garden/journal-mentions";
import {
  SELECTABLE_CATALOG_STATUSES,
  findSelectableCatalogItem,
} from "@/server/catalog-repository";
import {
  buildInsertProvenanceEdgeQuery,
  normalizeLineageSourceReferenceLabel,
} from "@/server/lineage-repository";
import {
  sealPublicHandleMentionTarget,
  unsealPublicHandleMentionTarget,
} from "@/server/public-handle-mention-token";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const MAX_MENTION_QUERY_LENGTH = 80;
const MAX_MENTION_SUGGESTIONS = 8;
const MAX_PUBLIC_SUGGESTIONS_PER_KIND = 3;
const MAX_OWN_OBJECT_SUGGESTIONS = 4;
const MIN_PUBLIC_MENTION_QUERY_LENGTH = 2;

export interface PersistJournalEntryMentionsInput {
  journalEntryId: string;
  ownerUserId: string;
  spaceId: string;
  subjectPlantObjectId: string;
  clientMutationId: string;
  mentionSelections: unknown;
}

export interface NormalizedMentionQuery {
  raw: string;
  search: string;
  pattern: string;
  prefixPattern: string;
  canSearchPublic: boolean;
}

interface ResolvedOwnObjectMention {
  id: string;
}

interface ResolvedPublicObjectMention {
  id: string;
  ownerUserId: string;
}

interface ResolvedHandleMention {
  userId: string;
}

interface ResolvedCatalogMention {
  id: string;
  canonicalName: string;
}

export async function searchJournalMentionSuggestions(
  scope: RequestScope,
  query: string,
  limit = MAX_MENTION_SUGGESTIONS,
  executor: QueryExecutor = db,
): Promise<JournalMentionSuggestion[]> {
  const normalized = normalizeMentionQuery(query);
  const boundedLimit = normalizeMentionLimit(limit);

  const [ownObjects, publicObjects, handles, catalogItems] = await Promise.all([
    buildOwnObjectMentionSuggestionsQuery(
      executor,
      scope,
      normalized,
      Math.min(MAX_OWN_OBJECT_SUGGESTIONS, boundedLimit),
    ).execute(),
    normalized.canSearchPublic
      ? buildPublicObjectMentionSuggestionsQuery(
          executor,
          scope,
          normalized,
          MAX_PUBLIC_SUGGESTIONS_PER_KIND,
        ).execute()
      : Promise.resolve([]),
    normalized.canSearchPublic
      ? buildPublicHandleMentionSuggestionsQuery(
          executor,
          scope,
          normalized,
          MAX_PUBLIC_SUGGESTIONS_PER_KIND,
        ).execute()
      : Promise.resolve([]),
    normalized.canSearchPublic
      ? buildCatalogMentionSuggestionsQuery(
          executor,
          normalized,
          MAX_PUBLIC_SUGGESTIONS_PER_KIND,
        ).execute()
      : Promise.resolve([]),
  ]);

  return dedupeMentionSuggestions([
    ...ownObjects.map((row) => ({
      kind: "own_object" as const,
      id: row.id,
      label: row.displayName,
      insertText: mentionInsertText(row.displayName),
      detail: `Your object · ${row.spaceDisplayName}`,
      disambiguationLabel:
        row.catalogCanonicalName ?? row.varietyText ?? "Private garden object",
      catalogKind: row.catalogKind as CatalogKind | null,
    })),
    ...publicObjects.map((row) => ({
      kind: "public_object" as const,
      id: row.id,
      label: row.displayName,
      insertText: mentionInsertText(row.displayName),
      detail: publicObjectDetail(row),
      disambiguationLabel:
        row.catalogCanonicalName ?? row.varietyText ?? "Public journal object",
      catalogKind: row.catalogKind as CatalogKind | null,
    })),
    ...handles.map((row) => toPublicHandleMentionSuggestion(row, scope.userId)),
    ...catalogItems.map((row) => ({
      kind: "catalog_item" as const,
      id: row.id,
      label: row.displayName,
      insertText: mentionInsertText(row.displayName),
      detail: `Catalog · ${catalogKindMentionLabel(row.catalogKind)}`,
      disambiguationLabel: row.canonicalName,
      catalogKind: row.catalogKind as CatalogKind,
    })),
  ]).slice(0, boundedLimit);
}

export async function persistJournalEntryMentions(
  executor: QueryExecutor,
  scope: RequestScope,
  input: PersistJournalEntryMentionsInput,
) {
  if (input.ownerUserId !== scope.userId) {
    throw new Error("Mention owner does not match the request scope.");
  }

  const selections = normalizeJournalMentionSelections(input.mentionSelections);
  if (selections.length === 0) return;

  const ownObjectIds = idsForKind(selections, "own_object").filter(
    (id) => id !== input.subjectPlantObjectId,
  );
  if (ownObjectIds.length > 0) {
    const ownObjects = await resolveOwnObjectMentions(executor, scope, {
      spaceId: input.spaceId,
      plantObjectIds: ownObjectIds,
    });

    if (ownObjects.length !== ownObjectIds.length) {
      throw new Error("Own object mentions must belong to this entry space.");
    }

    await insertJournalEntryObjectMentions(executor, {
      ownerUserId: scope.userId,
      spaceId: input.spaceId,
      journalEntryId: input.journalEntryId,
      plantObjectIds: ownObjects.map((object) => object.id),
    });
  }

  const publicObjectIds = idsForKind(selections, "public_object");
  if (publicObjectIds.length > 0) {
    const publicObjects = await resolvePublicObjectMentions(
      executor,
      scope,
      publicObjectIds,
    );

    if (publicObjects.length !== publicObjectIds.length) {
      throw new Error("Public object mention target was not found.");
    }

    for (const object of publicObjects) {
      await insertProposedMentionEdge(executor, scope, {
        subjectPlantObjectId: input.subjectPlantObjectId,
        sourceKind: "own_object",
        sourcePlantObjectId: object.id,
        sourceOwnerUserId: object.ownerUserId,
        sourceReferenceKind: null,
        sourceReferenceLabel: null,
        clientMutationId: mentionEdgeClientMutationId(
          input.clientMutationId,
          "public_object",
          object.id,
        ),
      });
    }
  }

  const handleTokens = idsForKind(selections, "public_handle");
  if (handleTokens.length > 0) {
    const handleUserIds = resolvePublicHandleMentionSelectionTokens(
      handleTokens,
      scope.userId,
    );
    if (!handleUserIds) {
      throw new Error("Public handle mention target was not found.");
    }
    const handles = await resolvePublicHandleMentions(
      executor,
      scope,
      handleUserIds,
    );

    if (handles.length !== handleUserIds.length) {
      throw new Error("Public handle mention target was not found.");
    }

    for (const handle of handles) {
      await insertProposedMentionEdge(
        executor,
        scope,
        createPublicHandleMentionEdgeInput({
          subjectPlantObjectId: input.subjectPlantObjectId,
          targetUserId: handle.userId,
          entryClientMutationId: input.clientMutationId,
        }),
      );
    }
  }

  const catalogIds = idsForKind(selections, "catalog_item");
  if (catalogIds.length > 0) {
    const catalogItems: ResolvedCatalogMention[] = [];

    for (const catalogItemId of catalogIds) {
      const catalogItem = await findSelectableCatalogItem(
        executor,
        catalogItemId,
      );
      if (!catalogItem) {
        throw new Error("Catalog mention target was not found.");
      }
      catalogItems.push({
        id: catalogItem.id,
        canonicalName: catalogItem.canonicalName,
      });
    }

    await insertJournalEntryCatalogMentions(executor, {
      journalEntryId: input.journalEntryId,
      ownerUserId: scope.userId,
      spaceId: input.spaceId,
      catalogItemIds: catalogItems.map((item) => item.id),
    });

    for (const catalogItem of catalogItems) {
      await insertProposedMentionEdge(executor, scope, {
        subjectPlantObjectId: input.subjectPlantObjectId,
        sourceKind: "source_reference",
        sourcePlantObjectId: null,
        sourceOwnerUserId: null,
        sourceReferenceKind: "catalog_variety",
        sourceReferenceLabel: normalizeLineageSourceReferenceLabel(
          catalogItem.canonicalName,
        ),
        clientMutationId: mentionEdgeClientMutationId(
          input.clientMutationId,
          "catalog_item",
          catalogItem.id,
        ),
      });
    }
  }
}

export function buildOwnObjectMentionSuggestionsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  query: NormalizedMentionQuery,
  limit = MAX_OWN_OBJECT_SUGGESTIONS,
) {
  let builder = executor
    .selectFrom("plant_objects")
    .innerJoin("spaces", "spaces.id", "plant_objects.space_id")
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.created_by_user_id", "is", null)
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES]),
    )
    .select([
      "plant_objects.id as id",
      "plant_objects.display_name as displayName",
      "plant_objects.variety_text as varietyText",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.catalog_kind as catalogKind",
      "spaces.display_name as spaceDisplayName",
    ])
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("spaces.owner_user_id", "=", scope.userId);

  if (query.search.length > 0) {
    builder = builder.where((eb) =>
      eb.or([
        sql<boolean>`lower(${sql.ref("plant_objects.display_name")}) like ${query.pattern}`,
        sql<boolean>`lower(coalesce(${sql.ref("plant_objects.variety_text")}, '')) like ${query.pattern}`,
        sql<boolean>`lower(coalesce(${sql.ref("catalog_items.canonical_name")}, '')) like ${query.pattern}`,
      ]),
    );
  }

  return builder
    .orderBy(
      sql<number>`case
        when lower(${sql.ref("plant_objects.display_name")}) like ${query.prefixPattern} then 0
        else 1
      end`,
      "asc",
    )
    .orderBy("plant_objects.updated_at", "desc")
    .orderBy("plant_objects.display_name", "asc")
    .limit(normalizeMentionLimit(limit));
}

export function buildPublicObjectMentionSuggestionsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  query: NormalizedMentionQuery,
  limit = MAX_PUBLIC_SUGGESTIONS_PER_KIND,
) {
  return executor
    .selectFrom("plant_objects")
    .innerJoin("journal_entries", (join) =>
      join
        .onRef("journal_entries.plant_object_id", "=", "plant_objects.id")
        .onRef(
          "journal_entries.owner_user_id",
          "=",
          "plant_objects.owner_user_id",
        )
        .on("journal_entries.visibility", "=", "public")
        .on("journal_entries.lifecycle_state", "=", "active")
        .on("journal_entries.public_gone_at", "is", null)
        .on("journal_entries.public_slug", "is not", null),
    )
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.created_by_user_id", "is", null)
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES]),
    )
    .select([
      "plant_objects.id as id",
      "plant_objects.display_name as displayName",
      "plant_objects.owner_user_id as ownerUserId",
      "plant_objects.location_visibility as locationVisibility",
      "plant_objects.coarse_region_code as coarseRegionCode",
      "plant_objects.variety_text as varietyText",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.catalog_kind as catalogKind",
      sql<Date>`max(${sql.ref("journal_entries.published_at")})`.as(
        "lastPublishedAt",
      ),
    ])
    .where("plant_objects.owner_user_id", "!=", scope.userId)
    .where(
      noJournalMentionBlockPredicate(
        scope.userId,
        "plant_objects.owner_user_id",
      ),
    )
    .where((eb) =>
      eb.or([
        sql<boolean>`lower(${sql.ref("plant_objects.display_name")}) like ${query.pattern}`,
        sql<boolean>`lower(coalesce(${sql.ref("plant_objects.variety_text")}, '')) like ${query.pattern}`,
        sql<boolean>`lower(coalesce(${sql.ref("catalog_items.canonical_name")}, '')) like ${query.pattern}`,
      ]),
    )
    .groupBy([
      "plant_objects.id",
      "plant_objects.display_name",
      "plant_objects.owner_user_id",
      "plant_objects.location_visibility",
      "plant_objects.coarse_region_code",
      "plant_objects.variety_text",
      "catalog_items.canonical_name",
      "catalog_items.catalog_kind",
    ])
    .orderBy(
      sql<number>`case
        when lower(${sql.ref("plant_objects.display_name")}) like ${query.prefixPattern} then 0
        else 1
      end`,
      "asc",
    )
    .orderBy("lastPublishedAt", "desc")
    .orderBy("plant_objects.display_name", "asc")
    .limit(normalizeMentionLimit(limit));
}

export function buildPublicHandleMentionSuggestionsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  query: NormalizedMentionQuery,
  limit = MAX_PUBLIC_SUGGESTIONS_PER_KIND,
) {
  return executor
    .selectFrom("user_public_profiles")
    .innerJoin("user_handle_registry", (join) =>
      join
        .onRef(
          "user_handle_registry.user_id",
          "=",
          "user_public_profiles.user_id",
        )
        .onRef(
          "user_handle_registry.normalized_handle",
          "=",
          "user_public_profiles.normalized_handle",
        )
        .on("user_handle_registry.lifecycle_state", "=", "current"),
    )
    .select([
      "user_public_profiles.user_id as userId",
      "user_public_profiles.handle as handle",
      "user_public_profiles.display_name as displayName",
      "user_public_profiles.updated_at as updatedAt",
    ])
    .where("user_public_profiles.user_id", "!=", scope.userId)
    .where("user_public_profiles.profile_visibility", "=", "public")
    .where("user_public_profiles.profile_lifecycle_state", "=", "active")
    .where("user_public_profiles.removed_at", "is", null)
    .where("user_public_profiles.handle_registry_state", "=", "current")
    .where(
      noJournalMentionBlockPredicate(
        scope.userId,
        "user_public_profiles.user_id",
      ),
    )
    .where((eb) =>
      eb.or([
        eb("user_public_profiles.normalized_handle", "like", query.pattern),
        sql<boolean>`lower(coalesce(${sql.ref("user_public_profiles.display_name")}, '')) like ${query.pattern}`,
      ]),
    )
    .orderBy(
      sql<number>`case
        when ${sql.ref("user_public_profiles.normalized_handle")} like ${query.prefixPattern} then 0
        else 1
      end`,
      "asc",
    )
    .orderBy("user_public_profiles.updated_at", "desc")
    .orderBy("user_public_profiles.handle", "asc")
    .limit(normalizeMentionLimit(limit));
}

export function buildCatalogMentionSuggestionsQuery(
  executor: QueryExecutor,
  query: NormalizedMentionQuery,
  limit = MAX_PUBLIC_SUGGESTIONS_PER_KIND,
) {
  return executor
    .selectFrom("catalog_item_names")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_item_names.catalog_item_id",
    )
    .select([
      "catalog_items.id as id",
      "catalog_items.canonical_name as canonicalName",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_item_names.display_name as displayName",
    ])
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where(
      sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${query.pattern}`,
    )
    .orderBy(
      sql<number>`case
        when ${sql.ref("catalog_item_names.normalized_name")} = ${query.search} then 0
        when ${sql.ref("catalog_item_names.normalized_name")} like ${query.prefixPattern} then 1
        when ${sql.ref("catalog_item_names.is_primary")} then 2
        else 3
      end`,
      "asc",
    )
    .orderBy("catalog_items.updated_at", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .limit(normalizeMentionLimit(limit));
}

export function buildResolvePublicObjectMentionTargetsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectIds: readonly string[],
) {
  return executor
    .selectFrom("plant_objects")
    .innerJoin("journal_entries", (join) =>
      join
        .onRef("journal_entries.plant_object_id", "=", "plant_objects.id")
        .onRef(
          "journal_entries.owner_user_id",
          "=",
          "plant_objects.owner_user_id",
        )
        .on("journal_entries.visibility", "=", "public")
        .on("journal_entries.lifecycle_state", "=", "active")
        .on("journal_entries.public_gone_at", "is", null)
        .on("journal_entries.public_slug", "is not", null),
    )
    .select([
      "plant_objects.id as id",
      "plant_objects.owner_user_id as ownerUserId",
    ])
    .where("plant_objects.owner_user_id", "!=", scope.userId)
    .where(
      noJournalMentionBlockPredicate(
        scope.userId,
        "plant_objects.owner_user_id",
      ),
    )
    .where("plant_objects.id", "in", [...plantObjectIds])
    .groupBy(["plant_objects.id", "plant_objects.owner_user_id"])
    .orderBy("plant_objects.id", "asc");
}

export function buildResolvePublicHandleMentionTargetsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  userIds: readonly string[],
) {
  return executor
    .selectFrom("user_public_profiles")
    .innerJoin("user_handle_registry", (join) =>
      join
        .onRef(
          "user_handle_registry.user_id",
          "=",
          "user_public_profiles.user_id",
        )
        .onRef(
          "user_handle_registry.normalized_handle",
          "=",
          "user_public_profiles.normalized_handle",
        )
        .on("user_handle_registry.lifecycle_state", "=", "current"),
    )
    .select(["user_public_profiles.user_id as userId"])
    .where("user_public_profiles.user_id", "!=", scope.userId)
    .where("user_public_profiles.profile_visibility", "=", "public")
    .where("user_public_profiles.profile_lifecycle_state", "=", "active")
    .where("user_public_profiles.removed_at", "is", null)
    .where("user_public_profiles.handle_registry_state", "=", "current")
    .where(
      noJournalMentionBlockPredicate(
        scope.userId,
        "user_public_profiles.user_id",
      ),
    )
    .where("user_public_profiles.user_id", "in", [...userIds])
    .orderBy("user_public_profiles.user_id", "asc");
}

export function toPublicHandleMentionSuggestion(
  row: {
    userId: string;
    handle: string;
    displayName: string | null;
  },
  audienceUserId: string,
  options: { secret?: string } = {},
): JournalMentionSuggestion {
  return {
    kind: "public_handle",
    id: sealPublicHandleMentionTarget(row.userId, {
      audienceUserId,
      secret: options.secret,
    }),
    label: `@${row.handle}`,
    insertText: `@${row.handle}`,
    detail: "Public gardener handle",
    disambiguationLabel: row.displayName ?? "Pseudonymous profile",
    catalogKind: null,
  };
}

export function resolvePublicHandleMentionSelectionTokens(
  tokens: readonly string[],
  audienceUserId: string,
  options: { secret?: string } = {},
): string[] | null {
  const targetUserIds = new Set<string>();

  for (const token of tokens) {
    const targetUserId = unsealPublicHandleMentionTarget(token, {
      audienceUserId,
      secret: options.secret,
    });
    if (!targetUserId) return null;
    targetUserIds.add(targetUserId);
  }

  return [...targetUserIds];
}

export function createPublicHandleMentionEdgeInput(input: {
  subjectPlantObjectId: string;
  targetUserId: string;
  entryClientMutationId: string;
}) {
  return {
    subjectPlantObjectId: input.subjectPlantObjectId,
    sourceKind: "source_reference" as const,
    sourcePlantObjectId: null,
    sourceOwnerUserId: input.targetUserId,
    sourceReferenceKind: "person" as const,
    sourceReferenceLabel: null,
    clientMutationId: mentionEdgeClientMutationId(
      input.entryClientMutationId,
      "public_handle",
      input.targetUserId,
    ),
  };
}

export function buildInsertJournalEntryCatalogMentionsQuery(
  executor: QueryExecutor,
  input: {
    journalEntryId: string;
    ownerUserId: string;
    spaceId: string;
    catalogItemIds: readonly string[];
  },
) {
  return executor
    .insertInto("journal_entry_catalog_mentions")
    .values(
      input.catalogItemIds.map((catalogItemId) => ({
        journal_entry_id: input.journalEntryId,
        owner_user_id: input.ownerUserId,
        space_id: input.spaceId,
        catalog_item_id: catalogItemId,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["journal_entry_id", "catalog_item_id"]).doNothing(),
    )
    .returningAll();
}

export function normalizeMentionQuery(query: string): NormalizedMentionQuery {
  const raw = query.trim().slice(0, MAX_MENTION_QUERY_LENGTH);
  const search = raw.normalize("NFKC").toLocaleLowerCase("uk");

  return {
    raw,
    search,
    pattern: `%${escapeLike(search)}%`,
    prefixPattern: `${escapeLike(search)}%`,
    canSearchPublic: search.length >= MIN_PUBLIC_MENTION_QUERY_LENGTH,
  };
}

function normalizeMentionLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_MENTION_SUGGESTIONS;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_MENTION_SUGGESTIONS);
}

async function resolveOwnObjectMentions(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    spaceId: string;
    plantObjectIds: readonly string[];
  },
): Promise<ResolvedOwnObjectMention[]> {
  if (input.plantObjectIds.length === 0) return [];

  return executor
    .selectFrom("plant_objects")
    .select(["id"])
    .where("owner_user_id", "=", scope.userId)
    .where("space_id", "=", input.spaceId)
    .where("id", "in", [...input.plantObjectIds])
    .orderBy("id", "asc")
    .execute();
}

async function resolvePublicObjectMentions(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectIds: readonly string[],
): Promise<ResolvedPublicObjectMention[]> {
  if (plantObjectIds.length === 0) return [];

  return buildResolvePublicObjectMentionTargetsQuery(
    executor,
    scope,
    plantObjectIds,
  ).execute();
}

async function resolvePublicHandleMentions(
  executor: QueryExecutor,
  scope: RequestScope,
  userIds: readonly string[],
): Promise<ResolvedHandleMention[]> {
  if (userIds.length === 0) return [];

  return buildResolvePublicHandleMentionTargetsQuery(
    executor,
    scope,
    userIds,
  ).execute();
}

async function insertJournalEntryObjectMentions(
  executor: QueryExecutor,
  input: {
    ownerUserId: string;
    spaceId: string;
    journalEntryId: string;
    plantObjectIds: readonly string[];
  },
) {
  if (input.plantObjectIds.length === 0) return [];

  return executor
    .insertInto("journal_entry_object_mentions")
    .values(
      input.plantObjectIds.map((plantObjectId) => ({
        owner_user_id: input.ownerUserId,
        space_id: input.spaceId,
        journal_entry_id: input.journalEntryId,
        plant_object_id: plantObjectId,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["journal_entry_id", "plant_object_id"]).doNothing(),
    )
    .returningAll()
    .execute();
}

async function insertJournalEntryCatalogMentions(
  executor: QueryExecutor,
  input: {
    journalEntryId: string;
    ownerUserId: string;
    spaceId: string;
    catalogItemIds: readonly string[];
  },
) {
  if (input.catalogItemIds.length === 0) return [];

  return buildInsertJournalEntryCatalogMentionsQuery(executor, input).execute();
}

async function insertProposedMentionEdge(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    subjectPlantObjectId: string;
    sourceKind: "own_object" | "source_reference";
    sourcePlantObjectId: string | null;
    sourceOwnerUserId: string | null;
    sourceReferenceKind: LineageSourceReferenceKind | null;
    sourceReferenceLabel: string | null;
    clientMutationId: string;
  },
) {
  const row: Insertable<Database["lineage_provenance_edges"]> = {
    owner_user_id: scope.userId,
    subject_plant_object_id: input.subjectPlantObjectId,
    source_kind: input.sourceKind,
    source_plant_object_id: input.sourcePlantObjectId,
    source_owner_user_id: input.sourceOwnerUserId,
    source_reference_kind: input.sourceReferenceKind,
    source_reference_label: input.sourceReferenceLabel,
    edge_type: "provenance",
    consent_state: "proposed",
    visibility_policy: "owner_only_until_confirmed",
    erasure_state: "active",
    client_mutation_id: input.clientMutationId,
  };

  return buildInsertProvenanceEdgeQuery(executor, row).executeTakeFirst();
}

function idsForKind(
  selections: readonly JournalMentionSelection[],
  kind: JournalMentionTargetKind,
) {
  return Array.from(
    new Set(
      selections
        .filter((selection) => selection.kind === kind)
        .map((selection) => selection.id),
    ),
  );
}

function mentionEdgeClientMutationId(
  entryClientMutationId: string,
  kind: JournalMentionTargetKind,
  targetId: string,
) {
  const digest = createHash("sha256")
    .update(`${kind}:${targetId}`)
    .digest("hex")
    .slice(0, 16);
  return `${entryClientMutationId}:mention:${kind}:${digest}`.slice(0, 160);
}

function mentionInsertText(label: string): `@${string}` {
  const normalized = label
    .normalize("NFKC")
    .trim()
    .replace(/[@\s]+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return `@${normalized || "mention"}`;
}

function publicObjectDetail(row: {
  locationVisibility: string;
  coarseRegionCode: string | null;
}) {
  return row.locationVisibility === "region" && row.coarseRegionCode
    ? `Public object · region ${row.coarseRegionCode}`
    : "Public object · location hidden";
}

function catalogKindMentionLabel(value: unknown) {
  if (value === "species") return "species";
  if (value === "breed") return "breed";
  return "variety";
}

function dedupeMentionSuggestions(
  suggestions: JournalMentionSuggestion[],
): JournalMentionSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.kind}:${suggestion.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function noJournalMentionBlockPredicate(
  viewerUserId: string,
  actorRef: string,
) {
  return sql<boolean>`not exists (
    select 1
    from profile_blocks
    where profile_blocks.block_state = 'active'
      and (
        (
          profile_blocks.blocker_user_id = ${viewerUserId}
          and profile_blocks.blocked_user_id = ${sql.ref(actorRef)}
        )
        or (
          profile_blocks.blocker_user_id = ${sql.ref(actorRef)}
          and profile_blocks.blocked_user_id = ${viewerUserId}
        )
      )
  )`;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
