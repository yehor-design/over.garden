import "server-only";

import { sql, type Insertable, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  Database,
  CatalogKind,
  EntryLifecycleState,
  EntryScope,
  EntryVisibility,
  JournalEntry,
  LocationVisibility,
  PlantObject,
  PlantObjectKind,
  Space,
  VarietyState,
} from "@/db/schema";
import { normalizeCoarseRegionCode } from "@/lib/garden/regions";
import type { JournalMentionSelection } from "@/lib/garden/journal-mentions";
import {
  publicJournalEntryPath,
  publicLineageObjectPath,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import {
  normalizePlantObjectKind,
  resolveObjectKindForCatalogSelection,
} from "@/lib/garden/catalog-object-kind";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import { getPublicDerivativeUrl } from "@/lib/storage";
import {
  SELECTABLE_CATALOG_STATUSES,
  createUserAddedCatalogCandidate,
  findSelectableCatalogItem,
} from "@/server/catalog-repository";
import { attachProcessedMediaAssetToEntry } from "@/server/media/media-repository";
import { persistJournalEntryMentions } from "@/server/journal-mention-repository";
import {
  persistJournalEntryTopicSignals,
  refreshJournalEntryTopicSignalsForPlantObject,
} from "@/server/journal-topic-repository";
import type { RequestScope } from "@/server/request-scope";
import { FIRST_PUBLICATION_DISCLOSURE_VERSION } from "@/lib/privacy/disclosures";

const MAX_BODY_LENGTH = 2000;
const MAX_TITLE_LENGTH = 140;
const MAX_NAME_LENGTH = 120;
const MAX_RECENT_ITEMS = 20;
const MAX_PUBLIC_SLUG_LENGTH = 96;
const MAX_RELATED_PUBLIC_JOURNAL_ENTRIES = 3;
const MAX_OBJECT_GALLERY_MEDIA = 6;

const DEFAULT_LOCATION_VISIBILITY: LocationVisibility = "hidden";
const DEFAULT_ENTRY_VISIBILITY: EntryVisibility = "private";

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type NewJournalEntryRow = Insertable<Database["journal_entries"]>;

export interface CreateFirstPlantEntryInput {
  spaceName: string;
  plantName: string;
  objectKind?: string | null;
  catalogItemId?: string | null;
  userAddedCatalogName?: string | null;
  varietyText?: string | null;
  title: string;
  body: string;
  entryDate?: string | null;
  locationVisibility?: string | null;
  coarseRegionCode?: string | null;
  clientMutationId: string;
  mediaAssetId?: string | null;
  mentionSelections?: JournalMentionSelection[];
  topicTags?: unknown;
}

export interface CreateJournalEntryInput {
  body: string;
  visibility: EntryVisibility;
  clientMutationId: string;
}

export interface CreatePlantObjectJournalEntryInput {
  plantObjectId: string;
  title: string;
  body: string;
  entryDate?: string | null;
  clientMutationId: string;
  mediaAssetId?: string | null;
  mentionSelections?: JournalMentionSelection[];
  topicTags?: unknown;
}

export interface CreateSpaceJournalEntryInput {
  spaceId: string;
  mentionedPlantObjectIds: string[];
  title: string;
  body: string;
  entryDate?: string | null;
  clientMutationId: string;
  topicTags?: unknown;
}

export interface PublishJournalEntryInput {
  entryId: string;
  disclosureAccepted: boolean;
}

export interface PublishJournalEntryResult {
  entry: JournalEntry;
  publicUrl: string;
  disclosureLogged: boolean;
}

export interface ArchiveJournalEntryInput {
  entryId: string;
}

export interface ArchiveJournalEntryResult {
  entry: JournalEntry;
  publicUrl: string | null;
  publicGone: boolean;
}

export interface ResolvePlantObjectCatalogInput {
  plantObjectId: string;
  catalogItemId: string;
}

export interface UpdatePlantObjectLocationInput {
  plantObjectId: string;
  locationVisibility?: string | null;
  coarseRegionCode?: string | null;
}

export interface PlantObjectCatalogResolutionResult {
  space: PlantObjectPage["space"];
  plantObject: PlantObjectPage["plantObject"];
  entryCount: number;
  publicEntryPaths: string[];
}

export interface PlantObjectLocationUpdateResult {
  space: PlantObjectPage["space"];
  plantObject: PlantObjectPage["plantObject"];
  publicEntryPaths: string[];
}

export interface PlantObjectSummary {
  id: string;
  displayName: string;
  objectKind: PlantObjectKind;
  spaceDisplayName: string;
  catalogItemId: string | null;
  catalogKind: CatalogKind | null;
  varietyText: string | null;
  varietyState: VarietyState;
  createdAt: Date;
  entryCount: number;
  publicEntryCount: number;
  privateEntryCount: number;
  latestEntryDate: Date | string | null;
}

export interface SpaceTimelineObjectSummary {
  id: string;
  displayName: string;
  objectKind: PlantObjectKind;
  catalogKind: CatalogKind | null;
  varietyText: string | null;
  varietyState: VarietyState;
}

export interface SpaceJournalTimeline {
  space: Pick<
    Space,
    "id" | "display_name" | "location_visibility" | "coarse_region_code"
  >;
  objects: SpaceTimelineObjectSummary[];
  entries: JournalEntryReadback[];
}

export interface PlantObjectPage {
  space: Pick<
    Space,
    "id" | "display_name" | "location_visibility" | "coarse_region_code"
  >;
  plantObject: {
    id: PlantObject["id"];
    display_name: PlantObject["display_name"];
    object_kind: PlantObjectKind;
    catalog_item_id: PlantObject["catalog_item_id"];
    catalog_kind: CatalogKind | null;
    catalog_canonical_name: string | null;
    catalog_public_slug: string | null;
    variety_text: PlantObject["variety_text"];
    variety_state: VarietyState;
    location_visibility: PlantObject["location_visibility"];
    coarse_region_code: PlantObject["coarse_region_code"];
    source_credit: PlantObjectCatalogSourceCredit | null;
  };
  entries: JournalEntryReadback[];
  gallery_media: EntryMediaReadback[];
}

export interface PlantObjectCatalogSourceCredit {
  sourceSlug: string;
  sourceName: string;
  sourceUrl: string;
  attributionText: string | null;
}

export interface EntryMediaReadback {
  id: string;
  derivativeKey: string;
  publicUrl: string;
}

export interface MentionedPlantObjectReadback {
  id: string;
  displayName: string;
}

export type JournalEntryTimelineRelation =
  | "direct_object"
  | "mentioned_space"
  | "space_timeline";

export type JournalEntryReadback = JournalEntry & {
  media: EntryMediaReadback | null;
  mentionedObjects: MentionedPlantObjectReadback[];
  timelineRelation: JournalEntryTimelineRelation;
};

export interface PublicJournalEntryPage {
  entry: {
    id: string;
    title: string;
    body: string;
    entryDate: Date | string;
    entryScope: EntryScope;
    publicSlug: string;
    publicNoindex: boolean;
    publishedAt: Date | string | null;
  };
  space: {
    displayName: string;
    locationVisibility: LocationVisibility;
    coarseRegionCode: string | null;
  };
  plantObject: {
    plantObjectId: string | null;
    displayName: string;
    objectKind: PlantObjectKind | null;
    catalogCanonicalName: string | null;
    catalogPublicSlug: string | null;
    publicPath: string | null;
    varietyText: string | null;
    varietyState: VarietyState;
    locationVisibility: LocationVisibility;
    coarseRegionCode: string | null;
  };
  author: {
    handle: string;
    mention: string;
    displayName: string;
    avatarUrl: string | null;
    profilePath: string;
  } | null;
  relatedEntries: PublicJournalEntryRelatedEntry[];
  media: EntryMediaReadback | null;
}

export interface PublicJournalEntryRelatedEntry {
  id: string;
  title: string;
  bodyPreview: string;
  entryDate: Date | string;
  publicSlug: string;
  publicPath: string;
}

export interface GonePublicJournalEntryPage {
  publicSlug: string;
  publicGoneAt: Date | string;
  publicNoindex: boolean;
}

export type PublicJournalEntryLookup =
  | {
      status: "active";
      page: PublicJournalEntryPage;
    }
  | {
      status: "gone";
      entry: GonePublicJournalEntryPage;
    }
  | {
      status: "not_found";
    };

export interface FirstPlantEntryResult {
  space: PlantObjectPage["space"];
  plantObject: PlantObjectPage["plantObject"];
  entry: JournalEntry;
  isNewEntry: boolean;
  mediaAttached: boolean;
  priorObjectEntryCount: number;
}

export interface PlantObjectJournalEntryResult {
  space: PlantObjectPage["space"];
  plantObject: PlantObjectPage["plantObject"];
  entry: JournalEntry;
  isNewEntry: boolean;
  mediaAttached: boolean;
  priorObjectEntryCount: number;
}

export interface SpaceJournalEntryResult {
  space: Pick<
    Space,
    "id" | "display_name" | "location_visibility" | "coarse_region_code"
  >;
  entry: JournalEntry;
  mentionedObjects: MentionedPlantObjectReadback[];
  isNewEntry: boolean;
}

export async function createFirstPlantEntry(
  scope: RequestScope,
  input: CreateFirstPlantEntryInput,
): Promise<FirstPlantEntryResult> {
  const normalized = normalizeCreateFirstPlantEntryInput(input);
  const existing = await findJournalEntryByClientMutation(
    scope,
    normalized.clientMutationId,
  );

  if (existing) {
    if (existing.entry_scope !== "object" || !existing.plant_object_id) {
      throw new Error(
        "Client mutation id already belongs to another journal entry.",
      );
    }

    const mediaAttached = await attachMediaAssetToEntryIfPresent(
      db,
      scope,
      normalized.mediaAssetId,
      existing.id,
    );

    const page = await getPlantObjectPage(scope, existing.plant_object_id);
    if (!page)
      throw new Error("Existing journal entry is outside the request scope.");

    return {
      space: page.space,
      plantObject: page.plantObject,
      entry: existing,
      isNewEntry: false,
      mediaAttached,
      priorObjectEntryCount: Math.max(page.entries.length - 1, 0),
    };
  }

  return db.transaction().execute(async (trx) => {
    const space = await trx
      .insertInto("spaces")
      .values({
        owner_user_id: scope.userId,
        display_name: normalized.spaceName,
        location_visibility: normalized.locationVisibility,
        coarse_region_code: normalized.coarseRegionCode,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const selectedCatalogItem = normalized.catalogItemId
      ? await findSelectableCatalogItem(trx, normalized.catalogItemId)
      : null;

    if (normalized.catalogItemId && !selectedCatalogItem) {
      throw new Error("Selected catalog item was not found.");
    }

    const userAddedCatalogItem =
      !selectedCatalogItem && normalized.userAddedCatalogName
        ? await createUserAddedCatalogCandidate(trx, scope, {
            displayName: normalized.userAddedCatalogName,
          })
        : null;

    const plantObject = await trx
      .insertInto("plant_objects")
      .values({
        owner_user_id: scope.userId,
        space_id: space.id,
        display_name: normalized.plantName,
        object_kind: resolvePlantObjectKind(
          normalized.objectKind,
          selectedCatalogItem?.catalogKind,
          selectedCatalogItem?.source,
        ),
        catalog_item_id:
          selectedCatalogItem?.id ?? userAddedCatalogItem?.id ?? null,
        variety_text:
          selectedCatalogItem?.canonicalName ??
          userAddedCatalogItem?.displayName ??
          null,
        variety_state: selectedCatalogItem
          ? "selected"
          : userAddedCatalogItem
            ? "user_added"
            : "unknown",
        location_visibility: normalized.locationVisibility,
        coarse_region_code: normalized.coarseRegionCode,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const entry = await insertJournalEntry(trx, {
      owner_user_id: scope.userId,
      space_id: space.id,
      plant_object_id: plantObject.id,
      title: normalized.title,
      body: normalized.body,
      entry_scope: "object",
      entry_date: normalized.entryDate,
      visibility: DEFAULT_ENTRY_VISIBILITY,
      client_mutation_id: normalized.clientMutationId,
    });

    if (entry) {
      const mediaAttached = await attachMediaAssetToEntryIfPresent(
        trx,
        scope,
        normalized.mediaAssetId,
        entry.id,
      );
      await persistJournalEntryMentions(trx, scope, {
        journalEntryId: entry.id,
        ownerUserId: scope.userId,
        spaceId: space.id,
        subjectPlantObjectId: plantObject.id,
        clientMutationId: normalized.clientMutationId,
        mentionSelections: normalized.mentionSelections,
      });
      await persistJournalEntryTopicSignals(trx, scope, {
        journalEntryId: entry.id,
        explicitTagLabels: normalized.topicTags,
      });

      return {
        space: {
          id: space.id,
          display_name: space.display_name,
          location_visibility: space.location_visibility,
          coarse_region_code: space.coarse_region_code,
        },
        plantObject: {
          id: plantObject.id,
          display_name: plantObject.display_name,
          object_kind: plantObject.object_kind as PlantObjectKind,
          catalog_item_id: plantObject.catalog_item_id,
          catalog_kind: selectedCatalogItem?.catalogKind ?? null,
          catalog_canonical_name: selectedCatalogItem?.canonicalName ?? null,
          catalog_public_slug: selectedCatalogItem?.publicSlug ?? null,
          variety_text: plantObject.variety_text,
          variety_state: plantObject.variety_state as VarietyState,
          location_visibility: plantObject.location_visibility,
          coarse_region_code: plantObject.coarse_region_code,
          source_credit: null,
        },
        entry,
        isNewEntry: true,
        mediaAttached,
        priorObjectEntryCount: 0,
      };
    }

    const existingAfterConflict = await findJournalEntryByClientMutation(
      scope,
      normalized.clientMutationId,
      trx,
    );

    if (!existingAfterConflict) {
      throw new Error(
        "Journal entry idempotency conflict could not be resolved.",
      );
    }

    if (
      existingAfterConflict.entry_scope !== "object" ||
      !existingAfterConflict.plant_object_id
    ) {
      throw new Error(
        "Client mutation id already belongs to another journal entry.",
      );
    }

    const mediaAttached = await attachMediaAssetToEntryIfPresent(
      trx,
      scope,
      normalized.mediaAssetId,
      existingAfterConflict.id,
    );

    const page = await getPlantObjectPage(
      scope,
      existingAfterConflict.plant_object_id,
      trx,
    );

    if (!page) {
      throw new Error("Existing journal entry is outside the request scope.");
    }

    return {
      space: page.space,
      plantObject: page.plantObject,
      entry: existingAfterConflict,
      isNewEntry: false,
      mediaAttached,
      priorObjectEntryCount: Math.max(page.entries.length - 1, 0),
    };
  });
}

export async function listMyPlantObjects(
  scope: RequestScope,
  limit = 10,
): Promise<PlantObjectSummary[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_RECENT_ITEMS);

  const rows = await buildMyPlantObjectsQuery(
    db,
    scope,
    boundedLimit,
  ).execute();
  if (rows.length === 0) return [];

  const entrySummaries = await buildMyPlantObjectEntrySummariesQuery(
    db,
    scope,
    rows.map((row) => row.id),
  ).execute();
  const entrySummaryByObjectId = new Map(
    entrySummaries.map((summary) => [summary.plantObjectId, summary]),
  );

  return rows.map((row) => {
    const entrySummary = entrySummaryByObjectId.get(row.id);

    return {
      ...row,
      objectKind: row.objectKind as PlantObjectKind,
      catalogKind: row.catalogKind as CatalogKind | null,
      varietyState: row.varietyState as VarietyState,
      entryCount: normalizeCount(entrySummary?.entryCount),
      publicEntryCount: normalizeCount(entrySummary?.publicEntryCount),
      privateEntryCount: normalizeCount(entrySummary?.privateEntryCount),
      latestEntryDate: entrySummary?.latestEntryDate ?? null,
    };
  });
}

export function buildMyPlantObjectsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit: number,
) {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_RECENT_ITEMS);

  return executor
    .selectFrom("plant_objects")
    .innerJoin("spaces", "spaces.id", "plant_objects.space_id")
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "plant_objects.id as id",
      "plant_objects.display_name as displayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.catalog_item_id as catalogItemId",
      "catalog_items.catalog_kind as catalogKind",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.created_at as createdAt",
      "spaces.display_name as spaceDisplayName",
    ])
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("spaces.owner_user_id", "=", scope.userId)
    .orderBy("plant_objects.created_at", "desc")
    .limit(boundedLimit);
}

export function buildMyPlantObjectEntrySummariesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectIds: readonly string[],
) {
  return executor
    .selectFrom("journal_entries")
    .innerJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .select(({ fn }) => [
      "journal_entries.plant_object_id as plantObjectId",
      fn.count<number>("journal_entries.id").as("entryCount"),
      sql<number>`count(*) filter (
        where ${sql.ref("journal_entries.visibility")} = 'public'
          and ${sql.ref("journal_entries.lifecycle_state")} = 'active'
      )::int`.as("publicEntryCount"),
      sql<number>`count(*) filter (
        where ${sql.ref("journal_entries.visibility")} = 'private'
          and ${sql.ref("journal_entries.lifecycle_state")} = 'active'
      )::int`.as("privateEntryCount"),
      fn.max<Date | string>("journal_entries.entry_date").as("latestEntryDate"),
    ])
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.plant_object_id", "in", [...plantObjectIds])
    .groupBy("journal_entries.plant_object_id")
    .$narrowType<{ plantObjectId: string }>();
}

export async function listMySpaceJournalTimelines(
  scope: RequestScope,
): Promise<SpaceJournalTimeline[]> {
  const spaces = await db
    .selectFrom("spaces")
    .select([
      "id",
      "display_name",
      "location_visibility",
      "coarse_region_code",
      "created_at",
    ])
    .where("owner_user_id", "=", scope.userId)
    .orderBy("created_at", "desc")
    .execute();

  if (spaces.length === 0) return [];

  const spaceIds = spaces.map((space) => space.id);
  const [objects, entries] = await Promise.all([
    buildSpaceTimelineObjectsQuery(db, scope, spaceIds).execute(),
    buildSpaceTimelineEntriesQuery(db, scope, spaceIds).execute(),
  ]);
  const mediaByEntryId = await getProcessedMediaByEntryId(
    db,
    scope,
    entries.map((entry) => entry.id),
  );
  const mentionsByEntryId = await getMentionedObjectsByEntryId(
    db,
    scope,
    entries.map((entry) => entry.id),
  );
  const objectsBySpaceId = new Map<string, SpaceTimelineObjectSummary[]>();
  const entriesBySpaceId = new Map<string, JournalEntryReadback[]>();

  for (const object of objects) {
    const list = objectsBySpaceId.get(object.spaceId) ?? [];
    list.push({
      id: object.id,
      displayName: object.displayName,
      objectKind: object.objectKind as PlantObjectKind,
      catalogKind: object.catalogKind as CatalogKind | null,
      varietyText: object.varietyText,
      varietyState: object.varietyState as VarietyState,
    });
    objectsBySpaceId.set(object.spaceId, list);
  }

  for (const entry of entries) {
    const list = entriesBySpaceId.get(entry.space_id) ?? [];
    list.push({
      ...entry,
      media: mediaByEntryId.get(entry.id) ?? null,
      mentionedObjects: mentionsByEntryId.get(entry.id) ?? [],
      timelineRelation: "space_timeline",
    });
    entriesBySpaceId.set(entry.space_id, list);
  }

  return spaces.map((space) => ({
    space: {
      id: space.id,
      display_name: space.display_name,
      location_visibility: space.location_visibility,
      coarse_region_code: space.coarse_region_code,
    },
    objects: objectsBySpaceId.get(space.id) ?? [],
    entries: entriesBySpaceId.get(space.id) ?? [],
  }));
}

export async function getPlantObjectPage(
  scope: RequestScope,
  objectId: string,
  executor: QueryExecutor = db,
): Promise<PlantObjectPage | null> {
  const objectRow = await buildPlantObjectPageObjectQuery(
    executor,
    scope,
    objectId,
  ).executeTakeFirst();

  if (!objectRow) return null;

  const entryRows = await buildObjectTimelineEntriesQuery(
    executor,
    scope,
    objectId,
  ).execute();
  const entryIds = entryRows.map((entry) => entry.id);
  const [mediaByEntryId, mentionsByEntryId, galleryMedia, sourceCredit] =
    await Promise.all([
      getProcessedMediaByEntryId(executor, scope, entryIds),
      getMentionedObjectsByEntryId(executor, scope, entryIds),
      readProcessedObjectMediaGallery(executor, scope, entryIds),
      objectRow.catalogItemId
        ? readPlantObjectCatalogSourceCredit(executor, objectRow.catalogItemId)
        : Promise.resolve(null),
    ]);

  return {
    space: {
      id: objectRow.spaceId,
      display_name: objectRow.spaceDisplayName,
      location_visibility: objectRow.spaceLocationVisibility,
      coarse_region_code: objectRow.spaceCoarseRegionCode,
    },
    plantObject: {
      id: objectRow.objectId,
      display_name: objectRow.objectDisplayName,
      object_kind: objectRow.objectKind as PlantObjectKind,
      catalog_item_id: objectRow.catalogItemId,
      catalog_kind: objectRow.catalogKind as CatalogKind | null,
      catalog_canonical_name: objectRow.catalogCanonicalName,
      catalog_public_slug: objectRow.catalogPublicSlug,
      variety_text: objectRow.varietyText,
      variety_state: objectRow.varietyState as VarietyState,
      location_visibility: objectRow.objectLocationVisibility,
      coarse_region_code: objectRow.objectCoarseRegionCode,
      source_credit: sourceCredit,
    },
    entries: entryRows.map(({ timelineRelation, ...entry }) => ({
      ...entry,
      media: mediaByEntryId.get(entry.id) ?? null,
      mentionedObjects: mentionsByEntryId.get(entry.id) ?? [],
      timelineRelation,
    })),
    gallery_media: galleryMedia,
  };
}

async function readPlantObjectCatalogSourceCredit(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<PlantObjectCatalogSourceCredit | null> {
  const row = await buildPlantObjectCatalogSourceCreditQuery(
    executor,
    catalogItemId,
  ).executeTakeFirst();

  if (!row) return null;

  return {
    sourceSlug: row.sourceSlug,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    attributionText: row.attributionText,
  };
}

export async function createPlantObjectJournalEntry(
  scope: RequestScope,
  input: CreatePlantObjectJournalEntryInput,
): Promise<PlantObjectJournalEntryResult> {
  const normalized = normalizeCreatePlantObjectJournalEntryInput(input);
  const existing = await findJournalEntryByClientMutation(
    scope,
    normalized.clientMutationId,
  );

  if (existing) {
    if (
      existing.entry_scope !== "object" ||
      existing.plant_object_id !== normalized.plantObjectId
    ) {
      throw new Error(
        "Client mutation id already belongs to another plant object.",
      );
    }

    const mediaAttached = await attachMediaAssetToEntryIfPresent(
      db,
      scope,
      normalized.mediaAssetId,
      existing.id,
    );
    const page = await getPlantObjectPage(scope, existing.plant_object_id);
    if (!page)
      throw new Error("Existing journal entry is outside the request scope.");

    return {
      space: page.space,
      plantObject: page.plantObject,
      entry: existing,
      isNewEntry: false,
      mediaAttached,
      priorObjectEntryCount: Math.max(page.entries.length - 1, 0),
    };
  }

  return db.transaction().execute(async (trx) => {
    const target = await buildPlantObjectPageObjectQuery(
      trx,
      scope,
      normalized.plantObjectId,
    ).executeTakeFirst();

    if (!target) {
      throw new Error("Plant object was not found in this garden.");
    }

    const priorObjectEntryCount = await countJournalEntriesForObject(
      trx,
      scope,
      normalized.plantObjectId,
    );
    const entry = await insertJournalEntry(trx, {
      owner_user_id: scope.userId,
      space_id: target.spaceId,
      plant_object_id: target.objectId,
      title: normalized.title,
      body: normalized.body,
      entry_scope: "object",
      entry_date: normalized.entryDate,
      visibility: DEFAULT_ENTRY_VISIBILITY,
      client_mutation_id: normalized.clientMutationId,
    });

    if (entry) {
      const mediaAttached = await attachMediaAssetToEntryIfPresent(
        trx,
        scope,
        normalized.mediaAssetId,
        entry.id,
      );
      await persistJournalEntryMentions(trx, scope, {
        journalEntryId: entry.id,
        ownerUserId: scope.userId,
        spaceId: target.spaceId,
        subjectPlantObjectId: target.objectId,
        clientMutationId: normalized.clientMutationId,
        mentionSelections: normalized.mentionSelections,
      });
      await persistJournalEntryTopicSignals(trx, scope, {
        journalEntryId: entry.id,
        explicitTagLabels: normalized.topicTags,
      });

      return {
        space: {
          id: target.spaceId,
          display_name: target.spaceDisplayName,
          location_visibility: target.spaceLocationVisibility,
          coarse_region_code: target.spaceCoarseRegionCode,
        },
        plantObject: {
          id: target.objectId,
          display_name: target.objectDisplayName,
          object_kind: target.objectKind as PlantObjectKind,
          catalog_item_id: target.catalogItemId,
          catalog_kind: target.catalogKind as CatalogKind | null,
          catalog_canonical_name: target.catalogCanonicalName,
          catalog_public_slug: target.catalogPublicSlug,
          variety_text: target.varietyText,
          variety_state: target.varietyState as VarietyState,
          location_visibility: target.objectLocationVisibility,
          coarse_region_code: target.objectCoarseRegionCode,
          source_credit: null,
        },
        entry,
        isNewEntry: true,
        mediaAttached,
        priorObjectEntryCount,
      };
    }

    const existingAfterConflict = await findJournalEntryByClientMutation(
      scope,
      normalized.clientMutationId,
      trx,
    );

    if (!existingAfterConflict) {
      throw new Error(
        "Journal entry idempotency conflict could not be resolved.",
      );
    }

    if (
      existingAfterConflict.entry_scope !== "object" ||
      existingAfterConflict.plant_object_id !== normalized.plantObjectId
    ) {
      throw new Error(
        "Client mutation id already belongs to another plant object.",
      );
    }

    const mediaAttached = await attachMediaAssetToEntryIfPresent(
      trx,
      scope,
      normalized.mediaAssetId,
      existingAfterConflict.id,
    );

    return {
      space: {
        id: target.spaceId,
        display_name: target.spaceDisplayName,
        location_visibility: target.spaceLocationVisibility,
        coarse_region_code: target.spaceCoarseRegionCode,
      },
      plantObject: {
        id: target.objectId,
        display_name: target.objectDisplayName,
        object_kind: target.objectKind as PlantObjectKind,
        catalog_item_id: target.catalogItemId,
        catalog_kind: target.catalogKind as CatalogKind | null,
        catalog_canonical_name: target.catalogCanonicalName,
        catalog_public_slug: target.catalogPublicSlug,
        variety_text: target.varietyText,
        variety_state: target.varietyState as VarietyState,
        location_visibility: target.objectLocationVisibility,
        coarse_region_code: target.objectCoarseRegionCode,
        source_credit: null,
      },
      entry: existingAfterConflict,
      isNewEntry: false,
      mediaAttached,
      priorObjectEntryCount,
    };
  });
}

export async function createSpaceJournalEntry(
  scope: RequestScope,
  input: CreateSpaceJournalEntryInput,
): Promise<SpaceJournalEntryResult> {
  const normalized = normalizeCreateSpaceJournalEntryInput(input);
  const existing = await findJournalEntryByClientMutation(
    scope,
    normalized.clientMutationId,
  );

  if (existing) {
    if (
      existing.entry_scope !== "space" ||
      existing.space_id !== normalized.spaceId
    ) {
      throw new Error(
        "Client mutation id already belongs to another journal entry.",
      );
    }

    const mentionedObjects = await readMentionedObjectsForEntry(
      db,
      scope,
      existing.id,
    );
    return {
      space: await requireSpaceInScope(db, scope, existing.space_id),
      entry: existing,
      mentionedObjects,
      isNewEntry: false,
    };
  }

  return db.transaction().execute(async (trx) => {
    const space = await requireSpaceInScope(trx, scope, normalized.spaceId);
    const mentionedObjects = await readMentionableObjectsInSpace(trx, scope, {
      spaceId: normalized.spaceId,
      plantObjectIds: normalized.mentionedPlantObjectIds,
    });

    if (mentionedObjects.length !== normalized.mentionedPlantObjectIds.length) {
      throw new Error("Mentioned objects must belong to this space.");
    }

    const entry = await insertJournalEntry(trx, {
      owner_user_id: scope.userId,
      space_id: space.id,
      plant_object_id: null,
      title: normalized.title,
      body: normalized.body,
      entry_scope: "space",
      entry_date: normalized.entryDate,
      visibility: DEFAULT_ENTRY_VISIBILITY,
      client_mutation_id: normalized.clientMutationId,
    });

    if (entry) {
      await insertJournalEntryObjectMentions(trx, {
        ownerUserId: scope.userId,
        spaceId: space.id,
        journalEntryId: entry.id,
        plantObjectIds: normalized.mentionedPlantObjectIds,
      });
      await persistJournalEntryTopicSignals(trx, scope, {
        journalEntryId: entry.id,
        explicitTagLabels: normalized.topicTags,
      });

      return {
        space,
        entry,
        mentionedObjects,
        isNewEntry: true,
      };
    }

    const existingAfterConflict = await findJournalEntryByClientMutation(
      scope,
      normalized.clientMutationId,
      trx,
    );

    if (
      !existingAfterConflict ||
      existingAfterConflict.entry_scope !== "space" ||
      existingAfterConflict.space_id !== normalized.spaceId
    ) {
      throw new Error(
        "Journal entry idempotency conflict could not be resolved.",
      );
    }

    const existingMentions = await readMentionedObjectsForEntry(
      trx,
      scope,
      existingAfterConflict.id,
    );

    return {
      space,
      entry: existingAfterConflict,
      mentionedObjects: existingMentions,
      isNewEntry: false,
    };
  });
}

export async function resolvePlantObjectCatalog(
  scope: RequestScope,
  input: ResolvePlantObjectCatalogInput,
): Promise<PlantObjectCatalogResolutionResult> {
  const normalized = normalizeResolvePlantObjectCatalogInput(input);

  return db.transaction().execute(async (trx) => {
    const target = await buildPlantObjectPageObjectQuery(
      trx,
      scope,
      normalized.plantObjectId,
    ).executeTakeFirst();

    if (!target) {
      throw new Error("Plant object was not found in this garden.");
    }

    if (!isResolvableVarietyState(target.varietyState)) {
      throw new Error("Only unknown or user-added objects can be resolved.");
    }

    const selectedCatalogItem = await findSelectableCatalogItem(
      trx,
      normalized.catalogItemId,
    );

    if (!selectedCatalogItem) {
      throw new Error("Selected catalog item was not found.");
    }

    const resolved = await buildResolvePlantObjectCatalogQuery(trx, scope, {
      plantObjectId: target.objectId,
      catalogItemId: selectedCatalogItem.id,
      objectKind: resolvePlantObjectKind(
        target.objectKind,
        selectedCatalogItem.catalogKind,
        selectedCatalogItem.source,
      ),
      varietyText: selectedCatalogItem.canonicalName,
      now: new Date(),
    }).executeTakeFirstOrThrow();
    await refreshJournalEntryTopicSignalsForPlantObject(trx, scope, {
      plantObjectId: resolved.id,
    });

    const entryCount = await countJournalEntriesForObject(
      trx,
      scope,
      resolved.id,
    );
    const publicSlugs = await buildPublicEntrySlugsForObjectQuery(
      trx,
      scope,
      resolved.id,
    ).execute();

    return {
      space: {
        id: target.spaceId,
        display_name: target.spaceDisplayName,
        location_visibility: target.spaceLocationVisibility,
        coarse_region_code: target.spaceCoarseRegionCode,
      },
      plantObject: {
        id: resolved.id,
        display_name: resolved.display_name,
        object_kind: resolved.object_kind as PlantObjectKind,
        catalog_item_id: resolved.catalog_item_id,
        catalog_kind: selectedCatalogItem.catalogKind,
        catalog_canonical_name: selectedCatalogItem.canonicalName,
        catalog_public_slug: selectedCatalogItem.publicSlug,
        variety_text: resolved.variety_text,
        variety_state: resolved.variety_state as VarietyState,
        location_visibility: resolved.location_visibility,
        coarse_region_code: resolved.coarse_region_code,
        source_credit: null,
      },
      entryCount,
      publicEntryPaths: publicSlugs.flatMap((row) =>
        row.publicSlug ? [publicJournalEntryPath(row.publicSlug)] : [],
      ),
    };
  });
}

export async function updatePlantObjectLocation(
  scope: RequestScope,
  input: UpdatePlantObjectLocationInput,
): Promise<PlantObjectLocationUpdateResult> {
  const normalized = normalizeUpdatePlantObjectLocationInput(input);
  const updated = await buildUpdatePlantObjectLocationQuery(
    db,
    scope,
    normalized,
  ).executeTakeFirst();

  if (!updated) {
    throw new Error("Plant object was not found in this garden.");
  }

  const page = await getPlantObjectPage(scope, updated.id);
  if (!page) {
    throw new Error("Plant object was not found in this garden.");
  }

  const publicSlugs = await buildPublicEntrySlugsForObjectQuery(
    db,
    scope,
    updated.id,
  ).execute();

  return {
    space: page.space,
    plantObject: page.plantObject,
    publicEntryPaths: publicSlugs.flatMap((row) =>
      row.publicSlug ? [publicJournalEntryPath(row.publicSlug)] : [],
    ),
  };
}

export async function createJournalEntry(
  scope: RequestScope,
  input: CreateJournalEntryInput,
): Promise<JournalEntry> {
  const result = await createFirstPlantEntry(scope, {
    spaceName: "Local skeleton space",
    plantName: "Skeleton plant",
    title: "Skeleton journal entry",
    body: input.body,
    clientMutationId: input.clientMutationId,
  });

  if (input.visibility === "private") return result.entry;

  return db
    .updateTable("journal_entries")
    .set({ visibility: input.visibility, updated_at: new Date() })
    .where("id", "=", result.entry.id)
    .where("owner_user_id", "=", scope.userId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listMyRecentJournalEntries(
  scope: RequestScope,
  limit = 10,
): Promise<JournalEntry[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_RECENT_ITEMS);

  return db
    .selectFrom("journal_entries")
    .selectAll()
    .where("owner_user_id", "=", scope.userId)
    .orderBy("created_at", "desc")
    .limit(boundedLimit)
    .execute();
}

export async function publishJournalEntry(
  scope: RequestScope,
  input: PublishJournalEntryInput,
): Promise<PublishJournalEntryResult> {
  const entryId = normalizeRequiredText(input.entryId, "Entry id", 200);
  const existing = await findJournalEntryById(scope, entryId);

  if (!existing) {
    throw new Error("Journal entry was not found in this garden.");
  }

  if (existing.lifecycle_state !== "active") {
    throw new Error("Archived journal entries cannot be published.");
  }

  if (existing.visibility === "public" && existing.public_slug) {
    return {
      entry: existing,
      publicUrl: publicJournalEntryPath(existing.public_slug),
      disclosureLogged: false,
    };
  }

  const priorDisclosure = await buildPriorPublicationDisclosureQuery(
    db,
    scope,
  ).executeTakeFirst();
  const needsDisclosure = !priorDisclosure;

  if (needsDisclosure && !input.disclosureAccepted) {
    throw new Error("First-publication disclosure must be accepted.");
  }

  const now = new Date();
  const publicSlug =
    existing.public_slug ??
    createPublicSlug(existing.title, MAX_PUBLIC_SLUG_LENGTH);
  const publishedAt = existing.published_at ?? now;

  const published = await buildPublishJournalEntryQuery(db, scope, {
    entryId,
    publicSlug,
    publishedAt,
    now,
    disclosureLogged: needsDisclosure,
  }).executeTakeFirstOrThrow();

  return {
    entry: published,
    publicUrl: publicJournalEntryPath(publicSlug),
    disclosureLogged: needsDisclosure,
  };
}

export async function getPublicJournalEntryPage(
  publicSlug: string,
  executor: QueryExecutor = db,
): Promise<PublicJournalEntryPage | null> {
  const lookup = await getPublicJournalEntryLookup(publicSlug, executor);
  return lookup.status === "active" ? lookup.page : null;
}

export async function getPublicJournalEntryLookup(
  publicSlug: string,
  executor: QueryExecutor = db,
): Promise<PublicJournalEntryLookup> {
  const slug = normalizePublicSlug(publicSlug);
  if (!slug) return { status: "not_found" };

  const row = await buildPublicJournalEntryLookupQuery(
    executor,
    slug,
  ).executeTakeFirst();
  if (!row?.publicSlug) return { status: "not_found" };

  if (isGonePublicEntry(row)) {
    return {
      status: "gone",
      entry: {
        publicSlug: row.publicSlug,
        publicGoneAt: row.publicGoneAt,
        publicNoindex: row.publicNoindex,
      },
    };
  }

  if (
    row.visibility !== "public" ||
    row.lifecycleState !== "active" ||
    row.publicGoneAt !== null
  ) {
    return { status: "not_found" };
  }

  const media = await buildPublicProcessedMediaForEntryQuery(
    executor,
    row.entryId,
  ).executeTakeFirst();
  const relatedRows =
    row.entryScope === "object" && row.plantObjectId
      ? await buildRelatedPublicJournalEntriesQuery(
          executor,
          row.plantObjectId,
          row.entryId,
        ).execute()
      : [];

  return {
    status: "active",
    page: {
      entry: {
        id: row.entryId,
        title: row.title,
        body: row.body,
        entryDate: row.entryDate,
        entryScope: row.entryScope as EntryScope,
        publicSlug: row.publicSlug,
        publicNoindex: row.publicNoindex,
        publishedAt: row.publishedAt,
      },
      space: {
        displayName: row.spaceDisplayName,
        locationVisibility: row.spaceLocationVisibility as LocationVisibility,
        coarseRegionCode: row.spaceCoarseRegionCode,
      },
      plantObject: {
        plantObjectId:
          row.entryScope === "space" ? null : (row.plantObjectId ?? null),
        displayName:
          row.entryScope === "space"
            ? `${row.spaceDisplayName} space entry`
            : (row.objectDisplayName ?? "Garden entry"),
        objectKind:
          row.entryScope === "space"
            ? null
            : (row.objectKind as PlantObjectKind | null),
        catalogCanonicalName: row.catalogCanonicalName,
        catalogPublicSlug: row.catalogPublicSlug,
        publicPath:
          row.entryScope === "space" || !row.plantObjectId
            ? null
            : publicLineageObjectPath(row.plantObjectId),
        varietyText: row.varietyText,
        varietyState:
          row.entryScope === "space"
            ? "unknown"
            : (row.varietyState as VarietyState),
        locationVisibility:
          row.entryScope === "space"
            ? (row.spaceLocationVisibility as LocationVisibility)
            : (row.objectLocationVisibility as LocationVisibility),
        coarseRegionCode:
          row.entryScope === "space"
            ? row.spaceCoarseRegionCode
            : row.objectCoarseRegionCode,
      },
      author: serializePublicJournalEntryAuthor({
        handle: row.authorHandle,
        displayName: row.authorDisplayName,
        avatarUrl: row.authorAvatarUrl,
      }),
      relatedEntries: serializeRelatedPublicJournalEntries(relatedRows),
      media: media?.derivativeKey
        ? {
            id: media.id,
            derivativeKey: media.derivativeKey,
            publicUrl: getPublicDerivativeUrl(media.derivativeKey),
          }
        : null,
    },
  };
}

function serializePublicJournalEntryAuthor(
  input: {
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  },
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): PublicJournalEntryPage["author"] {
  if (!input.handle) return null;

  return {
    handle: input.handle,
    mention: `@${input.handle}`,
    displayName: input.displayName ?? `@${input.handle}`,
    avatarUrl: input.avatarUrl,
    profilePath: publicProfilePath(locale, input.handle),
  };
}

function serializeRelatedPublicJournalEntries(
  rows: Array<{
    entryId: string;
    title: string;
    body: string;
    entryDate: Date | string;
    publicSlug: string;
  }>,
): PublicJournalEntryRelatedEntry[] {
  return rows.map((row) => ({
    id: row.entryId,
    title: row.title,
    bodyPreview: publicJournalEntryBodyPreview(row.body),
    entryDate: row.entryDate,
    publicSlug: row.publicSlug,
    publicPath: publicJournalEntryPath(row.publicSlug),
  }));
}

function publicJournalEntryBodyPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 150) return normalized;

  return `${normalized.slice(0, 147).trimEnd()}...`;
}

function normalizeRelatedPublicJournalEntryLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_RELATED_PUBLIC_JOURNAL_ENTRIES;
  return Math.min(
    Math.max(Math.trunc(limit), 1),
    MAX_RELATED_PUBLIC_JOURNAL_ENTRIES,
  );
}

export async function archiveJournalEntry(
  scope: RequestScope,
  input: ArchiveJournalEntryInput,
): Promise<ArchiveJournalEntryResult> {
  const entryId = normalizeRequiredText(input.entryId, "Entry id", 200);
  const existing = await findJournalEntryById(scope, entryId);

  if (!existing) {
    throw new Error("Journal entry was not found in this garden.");
  }

  if (existing.lifecycle_state === "archived") {
    return {
      entry: existing,
      publicUrl: existing.public_slug
        ? publicJournalEntryPath(existing.public_slug)
        : null,
      publicGone: existing.public_gone_at !== null,
    };
  }

  const now = new Date();
  const hadPublicUrl =
    existing.visibility === "public" && existing.public_slug !== null;
  const archived = await buildArchiveJournalEntryQuery(db, scope, {
    entryId,
    now,
    publicGoneAt: hadPublicUrl ? now : null,
  }).executeTakeFirstOrThrow();

  return {
    entry: archived,
    publicUrl: archived.public_slug
      ? publicJournalEntryPath(archived.public_slug)
      : null,
    publicGone: archived.public_gone_at !== null,
  };
}

export function buildFindExistingEntryByClientMutationQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  clientMutationId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .selectAll("journal_entries")
    .where("owner_user_id", "=", scope.userId)
    .where("client_mutation_id", "=", clientMutationId);
}

export function buildFindJournalEntryByIdQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .selectAll("journal_entries")
    .where("id", "=", entryId)
    .where("owner_user_id", "=", scope.userId);
}

export function buildObjectJournalEntryCountQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .leftJoin("journal_entry_object_mentions", (join) =>
      join
        .onRef(
          "journal_entry_object_mentions.journal_entry_id",
          "=",
          "journal_entries.id",
        )
        .on("journal_entry_object_mentions.owner_user_id", "=", scope.userId)
        .on(
          "journal_entry_object_mentions.plant_object_id",
          "=",
          plantObjectId,
        ),
    )
    .select(({ fn }) => fn.countAll<number>().as("entryCount"))
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("journal_entries.entry_scope", "=", "object"),
          eb("journal_entries.plant_object_id", "=", plantObjectId),
        ]),
        eb.and([
          eb("journal_entries.entry_scope", "=", "space"),
          eb(
            "journal_entry_object_mentions.plant_object_id",
            "=",
            plantObjectId,
          ),
        ]),
      ]),
    );
}

export function buildInsertJournalEntryQuery(
  executor: QueryExecutor,
  row: NewJournalEntryRow,
) {
  return executor
    .insertInto("journal_entries")
    .values(row)
    .onConflict((oc) =>
      oc.columns(["owner_user_id", "client_mutation_id"]).doNothing(),
    )
    .returningAll();
}

export function buildPriorPublicationDisclosureQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("journal_entries")
    .select("id")
    .where("owner_user_id", "=", scope.userId)
    .where("first_publication_disclosed_at", "is not", null)
    .limit(1);
}

export function buildPublishJournalEntryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    entryId: string;
    publicSlug: string;
    publishedAt: Date;
    now: Date;
    disclosureLogged: boolean;
  },
) {
  return executor
    .updateTable("journal_entries")
    .set({
      lifecycle_state: "active",
      visibility: "public",
      public_slug: input.publicSlug,
      public_noindex: true,
      published_at: input.publishedAt,
      archived_at: null,
      public_gone_at: null,
      first_publication_disclosure_version: input.disclosureLogged
        ? FIRST_PUBLICATION_DISCLOSURE_VERSION
        : undefined,
      first_publication_disclosed_at: input.disclosureLogged
        ? input.now
        : undefined,
      updated_at: input.now,
    })
    .where("id", "=", input.entryId)
    .where("owner_user_id", "=", scope.userId)
    .where("visibility", "=", "private")
    .where("lifecycle_state", "=", "active")
    .returningAll();
}

export function buildArchiveJournalEntryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    entryId: string;
    now: Date;
    publicGoneAt: Date | null;
  },
) {
  return executor
    .updateTable("journal_entries")
    .set({
      lifecycle_state: "archived",
      visibility: "private",
      public_noindex: true,
      archived_at: input.now,
      public_gone_at: input.publicGoneAt ?? undefined,
      updated_at: input.now,
    })
    .where("id", "=", input.entryId)
    .where("owner_user_id", "=", scope.userId)
    .where("lifecycle_state", "=", "active")
    .returningAll();
}

export function buildResolvePlantObjectCatalogQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    plantObjectId: string;
    catalogItemId: string;
    objectKind: PlantObjectKind;
    varietyText: string;
    now: Date;
  },
) {
  return executor
    .updateTable("plant_objects")
    .set({
      catalog_item_id: input.catalogItemId,
      object_kind: input.objectKind,
      variety_text: input.varietyText,
      variety_state: "selected",
      updated_at: input.now,
    })
    .where("id", "=", input.plantObjectId)
    .where("owner_user_id", "=", scope.userId)
    .where("variety_state", "in", ["unknown", "user_added"])
    .returningAll();
}

export function buildUpdatePlantObjectLocationQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    plantObjectId: string;
    locationVisibility: LocationVisibility;
    coarseRegionCode: string | null;
    now: Date;
  },
) {
  return executor
    .updateTable("plant_objects")
    .set({
      location_visibility: input.locationVisibility,
      coarse_region_code: input.coarseRegionCode,
      updated_at: input.now,
    })
    .where("id", "=", input.plantObjectId)
    .where("owner_user_id", "=", scope.userId)
    .returningAll();
}

export function buildPublicEntrySlugsForObjectQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .leftJoin("journal_entry_object_mentions", (join) =>
      join
        .onRef(
          "journal_entry_object_mentions.journal_entry_id",
          "=",
          "journal_entries.id",
        )
        .on("journal_entry_object_mentions.owner_user_id", "=", scope.userId)
        .on(
          "journal_entry_object_mentions.plant_object_id",
          "=",
          plantObjectId,
        ),
    )
    .select("public_slug as publicSlug")
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("journal_entries.entry_scope", "=", "object"),
          eb("journal_entries.plant_object_id", "=", plantObjectId),
        ]),
        eb.and([
          eb("journal_entries.entry_scope", "=", "space"),
          eb(
            "journal_entry_object_mentions.plant_object_id",
            "=",
            plantObjectId,
          ),
        ]),
      ]),
    )
    .where("visibility", "=", "public")
    .where("lifecycle_state", "=", "active")
    .where("public_gone_at", "is", null)
    .where("public_slug", "is not", null);
}

export function buildPlantObjectPageObjectQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  objectId: string,
) {
  return executor
    .selectFrom("plant_objects")
    .innerJoin("spaces", "spaces.id", "plant_objects.space_id")
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "plant_objects.id as objectId",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.catalog_item_id as catalogItemId",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.location_visibility as objectLocationVisibility",
      "plant_objects.coarse_region_code as objectCoarseRegionCode",
      "spaces.id as spaceId",
      "spaces.display_name as spaceDisplayName",
      "spaces.location_visibility as spaceLocationVisibility",
      "spaces.coarse_region_code as spaceCoarseRegionCode",
    ])
    .where("plant_objects.id", "=", objectId)
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("spaces.owner_user_id", "=", scope.userId);
}

export function buildSpaceByIdQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  spaceId: string,
) {
  return executor
    .selectFrom("spaces")
    .select(["id", "display_name", "location_visibility", "coarse_region_code"])
    .where("id", "=", spaceId)
    .where("owner_user_id", "=", scope.userId);
}

export function buildSpaceTimelineObjectsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  spaceIds: readonly string[],
) {
  return executor
    .selectFrom("plant_objects")
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "plant_objects.id as id",
      "plant_objects.space_id as spaceId",
      "plant_objects.display_name as displayName",
      "plant_objects.object_kind as objectKind",
      "catalog_items.catalog_kind as catalogKind",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
    ])
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("plant_objects.space_id", "in", [...spaceIds])
    .orderBy("plant_objects.created_at", "desc");
}

export function buildSpaceTimelineEntriesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  spaceIds: readonly string[],
) {
  return executor
    .selectFrom("journal_entries")
    .selectAll("journal_entries")
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where("journal_entries.entry_scope", "=", "space")
    .where("journal_entries.space_id", "in", [...spaceIds])
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc");
}

export function buildObjectTimelineEntriesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .leftJoin("journal_entry_object_mentions", (join) =>
      join
        .onRef(
          "journal_entry_object_mentions.journal_entry_id",
          "=",
          "journal_entries.id",
        )
        .on("journal_entry_object_mentions.owner_user_id", "=", scope.userId)
        .on(
          "journal_entry_object_mentions.plant_object_id",
          "=",
          plantObjectId,
        ),
    )
    .selectAll("journal_entries")
    .select(() =>
      sql<JournalEntryTimelineRelation>`case
        when ${sql.ref("journal_entries.entry_scope")} = 'space'
          then 'mentioned_space'
        else 'direct_object'
      end`.as("timelineRelation"),
    )
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("journal_entries.entry_scope", "=", "object"),
          eb("journal_entries.plant_object_id", "=", plantObjectId),
        ]),
        eb.and([
          eb("journal_entries.entry_scope", "=", "space"),
          eb(
            "journal_entry_object_mentions.plant_object_id",
            "=",
            plantObjectId,
          ),
        ]),
      ]),
    )
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc");
}

export function buildMentionableObjectsInSpaceQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    spaceId: string;
    plantObjectIds: readonly string[];
  },
) {
  return executor
    .selectFrom("plant_objects")
    .select([
      "id",
      "display_name as displayName",
      "space_id as spaceId",
      "owner_user_id as ownerUserId",
    ])
    .where("owner_user_id", "=", scope.userId)
    .where("space_id", "=", input.spaceId)
    .where("id", "in", [...input.plantObjectIds])
    .orderBy("display_name", "asc");
}

export function buildMentionedObjectsForEntriesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: readonly string[],
) {
  return executor
    .selectFrom("journal_entry_object_mentions")
    .innerJoin("plant_objects", (join) =>
      join
        .onRef(
          "plant_objects.id",
          "=",
          "journal_entry_object_mentions.plant_object_id",
        )
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entry_object_mentions.owner_user_id",
        )
        .onRef(
          "plant_objects.space_id",
          "=",
          "journal_entry_object_mentions.space_id",
        ),
    )
    .select([
      "journal_entry_object_mentions.journal_entry_id as journalEntryId",
      "plant_objects.id as plantObjectId",
      "plant_objects.display_name as displayName",
    ])
    .where("journal_entry_object_mentions.owner_user_id", "=", scope.userId)
    .where("journal_entry_object_mentions.journal_entry_id", "in", [
      ...entryIds,
    ])
    .orderBy("plant_objects.display_name", "asc");
}

export function buildInsertJournalEntryObjectMentionsQuery(
  executor: QueryExecutor,
  input: {
    ownerUserId: string;
    spaceId: string;
    journalEntryId: string;
    plantObjectIds: readonly string[];
  },
) {
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
    .returningAll();
}

export function buildPlantObjectCatalogSourceCreditQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  return executor
    .selectFrom("catalog_source_links")
    .innerJoin(
      "catalog_source_records",
      "catalog_source_records.id",
      "catalog_source_links.source_record_id",
    )
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .select([
      "catalog_source_links.source_slug as sourceSlug",
      "catalog_source_snapshots.source_name as sourceName",
      "catalog_source_snapshots.source_url as sourceUrl",
      "catalog_source_snapshots.attribution_text as attributionText",
    ])
    .where("catalog_source_links.catalog_item_id", "=", catalogItemId)
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .where("catalog_source_records.projection_status", "=", "projected")
    .where("catalog_source_snapshots.attribution_required", "=", true)
    .orderBy("catalog_source_snapshots.verified_at", "desc")
    .orderBy("catalog_source_snapshots.source_name", "asc")
    .limit(1);
}

export function buildPublicJournalEntryPageQuery(
  executor: QueryExecutor,
  publicSlug: string,
) {
  return buildPublicJournalEntryLookupQuery(executor, publicSlug)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null);
}

export function buildPublicJournalEntryLookupQuery(
  executor: QueryExecutor,
  publicSlug: string,
) {
  return executor
    .selectFrom("journal_entries")
    .leftJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .innerJoin("spaces", (join) =>
      join
        .onRef("spaces.id", "=", "journal_entries.space_id")
        .onRef("spaces.owner_user_id", "=", "journal_entries.owner_user_id"),
    )
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
        .on("catalog_items.created_by_user_id", "is", null)
        .on("catalog_items.public_slug", "is not", null),
    )
    .leftJoin(
      "user_public_profiles",
      "user_public_profiles.user_id",
      "journal_entries.owner_user_id",
    )
    .select([
      "journal_entries.id as entryId",
      "journal_entries.title as title",
      "journal_entries.body as body",
      "journal_entries.entry_date as entryDate",
      "journal_entries.entry_scope as entryScope",
      "journal_entries.visibility as visibility",
      "journal_entries.lifecycle_state as lifecycleState",
      "journal_entries.public_slug as publicSlug",
      "journal_entries.public_noindex as publicNoindex",
      "journal_entries.published_at as publishedAt",
      "journal_entries.public_gone_at as publicGoneAt",
      "spaces.display_name as spaceDisplayName",
      "spaces.location_visibility as spaceLocationVisibility",
      "spaces.coarse_region_code as spaceCoarseRegionCode",
      "plant_objects.id as plantObjectId",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.catalog_item_id as catalogItemId",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.location_visibility as objectLocationVisibility",
      "plant_objects.coarse_region_code as objectCoarseRegionCode",
      "user_public_profiles.handle as authorHandle",
      "user_public_profiles.display_name as authorDisplayName",
      "user_public_profiles.avatar_url as authorAvatarUrl",
    ])
    .where("journal_entries.public_slug", "=", publicSlug);
}

export function buildRelatedPublicJournalEntriesQuery(
  executor: QueryExecutor,
  plantObjectId: string,
  currentEntryId: string,
  limit = MAX_RELATED_PUBLIC_JOURNAL_ENTRIES,
) {
  return executor
    .selectFrom("journal_entries")
    .select([
      "journal_entries.id as entryId",
      "journal_entries.title as title",
      "journal_entries.body as body",
      "journal_entries.entry_date as entryDate",
      "journal_entries.public_slug as publicSlug",
    ])
    .where("journal_entries.plant_object_id", "=", plantObjectId)
    .where("journal_entries.id", "!=", currentEntryId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(normalizeRelatedPublicJournalEntryLimit(limit))
    .$narrowType<{ publicSlug: string }>();
}

export function buildProcessedMediaForEntriesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: readonly string[],
) {
  return executor
    .selectFrom("media_assets")
    .select([
      "id",
      "journal_entry_id as journalEntryId",
      "derivative_key as derivativeKey",
    ])
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "in", entryIds)
    .where("status", "=", "processed")
    .where("derivative_key", "is not", null);
}

export function buildProcessedObjectMediaGalleryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: readonly string[],
  limit = MAX_OBJECT_GALLERY_MEDIA,
) {
  return executor
    .selectFrom("media_assets")
    .select(["id", "derivative_key as derivativeKey"])
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "in", entryIds)
    .where("status", "=", "processed")
    .where("derivative_key", "is not", null)
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .limit(normalizeObjectGalleryLimit(limit))
    .$narrowType<{ derivativeKey: string }>();
}

export function buildPublicProcessedMediaForEntryQuery(
  executor: QueryExecutor,
  entryId: string,
) {
  return executor
    .selectFrom("media_assets")
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "media_assets.journal_entry_id",
    )
    .select([
      "media_assets.id as id",
      "media_assets.derivative_key as derivativeKey",
    ])
    .whereRef(
      "media_assets.owner_user_id",
      "=",
      "journal_entries.owner_user_id",
    )
    .where("journal_entries.id", "=", entryId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("media_assets.status", "=", "processed")
    .where("media_assets.derivative_key", "is not", null);
}

async function insertJournalEntry(
  executor: QueryExecutor,
  row: NewJournalEntryRow,
): Promise<JournalEntry | undefined> {
  return buildInsertJournalEntryQuery(executor, row).executeTakeFirst();
}

async function findJournalEntryByClientMutation(
  scope: RequestScope,
  clientMutationId: string,
  executor: QueryExecutor = db,
): Promise<JournalEntry | undefined> {
  return buildFindExistingEntryByClientMutationQuery(
    executor,
    scope,
    clientMutationId,
  ).executeTakeFirst();
}

async function findJournalEntryById(
  scope: RequestScope,
  entryId: string,
  executor: QueryExecutor = db,
): Promise<JournalEntry | undefined> {
  return buildFindJournalEntryByIdQuery(
    executor,
    scope,
    entryId,
  ).executeTakeFirst();
}

async function countJournalEntriesForObject(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectId: string,
): Promise<number> {
  const row = await buildObjectJournalEntryCountQuery(
    executor,
    scope,
    plantObjectId,
  ).executeTakeFirst();

  return Number(row?.entryCount ?? 0);
}

async function requireSpaceInScope(
  executor: QueryExecutor,
  scope: RequestScope,
  spaceId: string,
) {
  const space = await buildSpaceByIdQuery(
    executor,
    scope,
    spaceId,
  ).executeTakeFirst();

  if (!space) {
    throw new Error("Space was not found in this garden.");
  }

  return space;
}

async function readMentionableObjectsInSpace(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    spaceId: string;
    plantObjectIds: readonly string[];
  },
): Promise<MentionedPlantObjectReadback[]> {
  const rows = await buildMentionableObjectsInSpaceQuery(
    executor,
    scope,
    input,
  ).execute();
  const rowById = new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        displayName: row.displayName,
      },
    ]),
  );

  return input.plantObjectIds.flatMap((id) => {
    const object = rowById.get(id);
    return object ? [object] : [];
  });
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
  return buildInsertJournalEntryObjectMentionsQuery(executor, input).execute();
}

async function readMentionedObjectsForEntry(
  executor: QueryExecutor,
  scope: RequestScope,
  entryId: string,
): Promise<MentionedPlantObjectReadback[]> {
  const mentionedByEntryId = await getMentionedObjectsByEntryId(
    executor,
    scope,
    [entryId],
  );
  return mentionedByEntryId.get(entryId) ?? [];
}

async function getMentionedObjectsByEntryId(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: string[],
) {
  const mentionedByEntryId = new Map<string, MentionedPlantObjectReadback[]>();
  if (entryIds.length === 0) return mentionedByEntryId;

  const rows = await buildMentionedObjectsForEntriesQuery(
    executor,
    scope,
    entryIds,
  ).execute();

  for (const row of rows) {
    const list = mentionedByEntryId.get(row.journalEntryId) ?? [];
    list.push({
      id: row.plantObjectId,
      displayName: row.displayName,
    });
    mentionedByEntryId.set(row.journalEntryId, list);
  }

  return mentionedByEntryId;
}

function normalizeCreateFirstPlantEntryInput(
  input: CreateFirstPlantEntryInput,
) {
  const catalogItemId = normalizeOptionalText(
    input.catalogItemId,
    "Catalog item id",
    200,
  );
  const userAddedCatalogName = normalizeOptionalText(
    input.userAddedCatalogName,
    "Missing catalog name",
    MAX_NAME_LENGTH,
  );
  if (catalogItemId && userAddedCatalogName) {
    throw new Error("Choose either a catalog match or a missing catalog name.");
  }

  const mediaAssetId = normalizeOptionalText(
    input.mediaAssetId,
    "Media asset id",
    200,
  );

  return {
    spaceName: normalizeRequiredText(
      input.spaceName,
      "Space name",
      MAX_NAME_LENGTH,
    ),
    plantName: normalizeRequiredText(
      input.plantName,
      "Plant name",
      MAX_NAME_LENGTH,
    ),
    objectKind: normalizePlantObjectKind(input.objectKind),
    catalogItemId,
    userAddedCatalogName,
    varietyText: null,
    varietyState: (catalogItemId
      ? "selected"
      : userAddedCatalogName
        ? "user_added"
        : "unknown") satisfies VarietyState,
    title: normalizeRequiredText(input.title, "Entry title", MAX_TITLE_LENGTH),
    body: normalizeRequiredText(input.body, "Entry body", MAX_BODY_LENGTH),
    entryDate: normalizeEntryDate(input.entryDate),
    ...normalizeLocationSelection({
      locationVisibility: input.locationVisibility,
      coarseRegionCode: input.coarseRegionCode,
    }),
    clientMutationId: normalizeRequiredText(
      input.clientMutationId,
      "Client mutation id",
      200,
    ),
    mediaAssetId,
    mentionSelections: input.mentionSelections ?? [],
    topicTags: input.topicTags ?? [],
  };
}

function normalizeCreatePlantObjectJournalEntryInput(
  input: CreatePlantObjectJournalEntryInput,
) {
  return {
    plantObjectId: normalizeRequiredText(
      input.plantObjectId,
      "Plant object id",
      200,
    ),
    title: normalizeRequiredText(input.title, "Entry title", MAX_TITLE_LENGTH),
    body: normalizeRequiredText(input.body, "Entry body", MAX_BODY_LENGTH),
    entryDate: normalizeEntryDate(input.entryDate),
    clientMutationId: normalizeRequiredText(
      input.clientMutationId,
      "Client mutation id",
      200,
    ),
    mediaAssetId: normalizeOptionalText(
      input.mediaAssetId,
      "Media asset id",
      200,
    ),
    mentionSelections: input.mentionSelections ?? [],
    topicTags: input.topicTags ?? [],
  };
}

function normalizeCreateSpaceJournalEntryInput(
  input: CreateSpaceJournalEntryInput,
) {
  const spaceId = normalizeRequiredText(input.spaceId, "Space id", 200);
  const mentionedPlantObjectIds = Array.from(
    new Set(
      input.mentionedPlantObjectIds.map((id) =>
        normalizeRequiredText(id, "Mentioned object id", 200),
      ),
    ),
  );

  if (mentionedPlantObjectIds.length === 0) {
    throw new Error("Choose at least one object from this space.");
  }

  return {
    spaceId,
    mentionedPlantObjectIds,
    title: normalizeRequiredText(input.title, "Entry title", MAX_TITLE_LENGTH),
    body: normalizeRequiredText(input.body, "Entry body", MAX_BODY_LENGTH),
    entryDate: normalizeEntryDate(input.entryDate),
    clientMutationId: normalizeRequiredText(
      input.clientMutationId,
      "Client mutation id",
      200,
    ),
    topicTags: input.topicTags ?? [],
  };
}

function normalizeUpdatePlantObjectLocationInput(
  input: UpdatePlantObjectLocationInput,
) {
  return {
    plantObjectId: normalizeRequiredText(
      input.plantObjectId,
      "Plant object id",
      200,
    ),
    ...normalizeLocationSelection({
      locationVisibility: input.locationVisibility,
      coarseRegionCode: input.coarseRegionCode,
    }),
    now: new Date(),
  };
}

function normalizeLocationSelection(input: {
  locationVisibility?: string | null;
  coarseRegionCode?: string | null;
}) {
  const locationVisibility = normalizeLocationVisibility(
    input.locationVisibility,
  );
  const coarseRegionCode = normalizeCoarseRegionCode(input.coarseRegionCode);

  if (locationVisibility === "region" && !coarseRegionCode) {
    throw new Error("Choose a supported coarse region or hide location.");
  }

  return {
    locationVisibility,
    coarseRegionCode: locationVisibility === "region" ? coarseRegionCode : null,
  };
}

function normalizeLocationVisibility(
  value: string | null | undefined,
): LocationVisibility {
  const normalized = value?.trim() ?? "";
  if (!normalized) return DEFAULT_LOCATION_VISIBILITY;
  if (normalized === "region" || normalized === "hidden") return normalized;
  throw new Error("Location visibility must be region or hidden.");
}

function resolvePlantObjectKind(
  requestedObjectKind: PlantObjectKind | string,
  catalogKind: string | null | undefined,
  source: string | null | undefined,
): PlantObjectKind {
  return resolveObjectKindForCatalogSelection(
    requestedObjectKind,
    catalogKind,
    source,
  );
}

function normalizeResolvePlantObjectCatalogInput(
  input: ResolvePlantObjectCatalogInput,
) {
  return {
    plantObjectId: normalizeRequiredText(
      input.plantObjectId,
      "Plant object id",
      200,
    ),
    catalogItemId: normalizeRequiredText(
      input.catalogItemId,
      "Catalog item id",
      200,
    ),
  };
}

function normalizeRequiredText(
  value: string,
  label: string,
  maxLength: number,
) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less.`);
  }
  return normalized;
}

function normalizeOptionalText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less.`);
  }
  return normalized;
}

function normalizeEntryDate(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Entry date must use YYYY-MM-DD format.");
  }
  return normalized;
}

function normalizeCount(value: number | string | bigint | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

function normalizePublicSlug(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_PUBLIC_SLUG_LENGTH) return null;
  if (!/^[\p{Letter}\p{Number}-]+$/u.test(normalized)) return null;
  return normalized;
}

function isResolvableVarietyState(
  value: string,
): value is "unknown" | "user_added" {
  return value === "unknown" || value === "user_added";
}

function createPublicSlug(title: string, maxLength: number) {
  const randomSuffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const base = title
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, Math.max(1, maxLength - randomSuffix.length - 1));

  return `${base || "entry"}-${randomSuffix}`;
}

function isGonePublicEntry(row: {
  publicSlug: string | null;
  publicGoneAt: Date | string | null;
  lifecycleState: EntryLifecycleState | string;
  publicNoindex: boolean;
}): row is {
  publicSlug: string;
  publicGoneAt: Date | string;
  lifecycleState: "archived";
  publicNoindex: boolean;
} {
  return (
    row.publicSlug !== null &&
    row.publicGoneAt !== null &&
    row.lifecycleState === "archived"
  );
}

async function attachMediaAssetToEntryIfPresent(
  executor: QueryExecutor,
  scope: RequestScope,
  mediaAssetId: string | null,
  journalEntryId: string,
) {
  if (!mediaAssetId) return false;

  const mediaAsset = await attachProcessedMediaAssetToEntry(executor, scope, {
    mediaAssetId,
    journalEntryId,
  });

  if (!mediaAsset) {
    throw new Error("Processed media asset is unavailable for this entry.");
  }

  return true;
}

async function getProcessedMediaByEntryId(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: string[],
) {
  const mediaByEntryId = new Map<string, EntryMediaReadback>();
  if (entryIds.length === 0) return mediaByEntryId;

  const mediaRows = await buildProcessedMediaForEntriesQuery(
    executor,
    scope,
    entryIds,
  ).execute();

  for (const media of mediaRows) {
    if (!media.journalEntryId || !media.derivativeKey) continue;
    if (mediaByEntryId.has(media.journalEntryId)) continue;
    mediaByEntryId.set(media.journalEntryId, {
      id: media.id,
      derivativeKey: media.derivativeKey,
      publicUrl: getPublicDerivativeUrl(media.derivativeKey),
    });
  }

  return mediaByEntryId;
}

async function readProcessedObjectMediaGallery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: string[],
): Promise<EntryMediaReadback[]> {
  if (entryIds.length === 0) return [];
  const rows = await buildProcessedObjectMediaGalleryQuery(
    executor,
    scope,
    entryIds,
  ).execute();

  return rows.map((row) => ({
    id: row.id,
    derivativeKey: row.derivativeKey,
    publicUrl: getPublicDerivativeUrl(row.derivativeKey),
  }));
}

function normalizeObjectGalleryLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_OBJECT_GALLERY_MEDIA;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_OBJECT_GALLERY_MEDIA);
}
