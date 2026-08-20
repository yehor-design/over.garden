import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  Database,
  EntryLifecycleState,
  EntryScope,
  EntryVisibility,
  PlantObjectKind,
} from "@/db/schema";
import {
  listMyPlantObjects,
  type PlantObjectSummary,
} from "@/server/journal-repository";
import type { RequestScope } from "@/server/request-scope";
import { listNotificationCenter } from "@/server/social-readback-repository";
import { listJournalDrafts } from "@/server/journal-draft-repository";
import type { JournalEntryDraftReceiptV1 } from "@/lib/garden/entry-contracts";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const WORKSPACE_INVENTORY_PREVIEW_SIZE = 8;
export const WORKSPACE_INVENTORY_PAGE_SIZE = 10;
export const WORKSPACE_SPACE_PREVIEW_SIZE = 4;
export const WORKSPACE_SPACE_PAGE_SIZE = 4;
export const WORKSPACE_RECENT_LIMIT = 8;
export const WORKSPACE_SECTION_DEADLINE_MS = 1_200;

const MAX_WORKSPACE_QUERY_LIMIT = 25;

export interface GardenWorkspaceInventorySource {
  totalCount: number;
  plantCount: number;
  animalCount: number;
  archivedEntryCount: number;
  objects: PlantObjectSummary[];
}

export interface GardenWorkspaceInventory extends GardenWorkspaceInventorySource {
  objects: PlantObjectSummary[];
  hasMore: boolean;
  page: number;
  pageSize: number;
}

export interface GardenWorkspaceSpaceSummary {
  id: string;
  displayName: string;
  objectCount: number;
  plantCount: number;
  animalCount: number;
}

export interface GardenWorkspaceSpacesSource {
  totalCount: number;
  spaces: GardenWorkspaceSpaceSummary[];
}

export interface GardenWorkspaceSpaces extends GardenWorkspaceSpacesSource {
  spaces: GardenWorkspaceSpaceSummary[];
  hasMore: boolean;
  page: number;
  pageSize: number;
}

export interface GardenWorkspaceRecentEntry {
  id: string;
  title: string;
  entryScope: EntryScope;
  entryDate: Date | string;
  visibility: EntryVisibility;
  lifecycleState: EntryLifecycleState;
  objectId: string | null;
  objectDisplayName: string | null;
  spaceId: string;
  spaceDisplayName: string;
}

export interface GardenWorkspaceInboxSummary {
  notificationCount: number;
  claimCount: number;
}

export interface GardenWorkspaceMediaSummary {
  processingCount: number;
  failedCount: number;
}

export type GardenWorkspaceSection<T> =
  | { status: "ready"; value: T }
  | { status: "error" };

export interface GardenWorkspaceReadModel {
  inventory: GardenWorkspaceSection<GardenWorkspaceInventory>;
  spaces: GardenWorkspaceSection<GardenWorkspaceSpaces>;
  recent: GardenWorkspaceSection<GardenWorkspaceRecentEntry[]>;
  inbox: GardenWorkspaceSection<GardenWorkspaceInboxSummary>;
  media: GardenWorkspaceSection<GardenWorkspaceMediaSummary>;
  drafts: GardenWorkspaceSection<JournalEntryDraftReceiptV1[]>;
  allFailed: boolean;
}

export interface GardenWorkspaceLoadOptions {
  inventoryExpanded: boolean;
  inventoryPage: number;
  spacesExpanded: boolean;
  spacesPage?: number;
  faultSections?: readonly GardenWorkspaceSectionKey[];
}

export type GardenWorkspaceSectionKey =
  | "inventory"
  | "spaces"
  | "recent"
  | "inbox"
  | "media"
  | "drafts";

export interface GardenWorkspaceSources {
  inventory(
    scope: RequestScope,
    window: { limit: number; offset: number },
  ): Promise<GardenWorkspaceInventorySource>;
  spaces(
    scope: RequestScope,
    window: { limit: number; offset: number },
  ): Promise<GardenWorkspaceSpacesSource>;
  recent(
    scope: RequestScope,
    limit: number,
  ): Promise<GardenWorkspaceRecentEntry[]>;
  inbox(scope: RequestScope): Promise<GardenWorkspaceInboxSummary>;
  media(scope: RequestScope): Promise<GardenWorkspaceMediaSummary>;
  drafts?(scope: RequestScope): Promise<JournalEntryDraftReceiptV1[]>;
}

const defaultSources: GardenWorkspaceSources = {
  async inventory(scope, window) {
    const [summary, objects] = await Promise.all([
      buildGardenWorkspaceInventorySummaryQuery(db, scope).executeTakeFirst(),
      listMyPlantObjects(scope, window.limit, window.offset),
    ]);

    return {
      totalCount: normalizeCount(summary?.totalCount),
      plantCount: normalizeCount(summary?.plantCount),
      animalCount: normalizeCount(summary?.animalCount),
      archivedEntryCount: normalizeCount(summary?.archivedEntryCount),
      objects,
    };
  },
  async spaces(scope, window) {
    const rows = await buildGardenWorkspaceSpaceSummariesQuery(
      db,
      scope,
      window,
    ).execute();

    return {
      totalCount: normalizeCount(rows[0]?.totalCount),
      spaces: rows.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        objectCount: normalizeCount(row.objectCount),
        plantCount: normalizeCount(row.plantCount),
        animalCount: normalizeCount(row.animalCount),
      })),
    };
  },
  async recent(scope, limit) {
    const rows = await buildGardenWorkspaceRecentEntriesQuery(
      db,
      scope,
      limit,
    ).execute();

    return rows.map((row) => ({
      ...row,
      entryScope: row.entryScope as EntryScope,
      visibility: row.visibility as EntryVisibility,
      lifecycleState: row.lifecycleState as EntryLifecycleState,
    }));
  },
  async inbox(scope) {
    const notifications = await listNotificationCenter(scope);
    return {
      notificationCount: notifications.length,
      claimCount: notifications.filter(
        (event) => event.kind === "lineage_claim_request",
      ).length,
    };
  },
  async media(scope) {
    const rows = await buildGardenWorkspaceMediaStatusQuery(
      db,
      scope,
    ).execute();
    const counts = new Map(
      rows.map((row) => [row.status, normalizeCount(row.count)]),
    );
    return {
      processingCount: counts.get("quarantined") ?? 0,
      failedCount: counts.get("failed") ?? 0,
    };
  },
  async drafts(scope) {
    return listJournalDrafts(scope);
  },
};

export async function loadGardenWorkspace(
  scope: RequestScope,
  options: GardenWorkspaceLoadOptions,
  sources: GardenWorkspaceSources = defaultSources,
): Promise<GardenWorkspaceReadModel> {
  const inventoryPage = normalizePage(options.inventoryPage);
  const inventoryPageSize = options.inventoryExpanded
    ? WORKSPACE_INVENTORY_PAGE_SIZE
    : WORKSPACE_INVENTORY_PREVIEW_SIZE;
  const inventoryOffset = options.inventoryExpanded
    ? (inventoryPage - 1) * WORKSPACE_INVENTORY_PAGE_SIZE
    : 0;
  const spacesPage = normalizePage(options.spacesPage ?? 1);
  const spacesPageSize = options.spacesExpanded
    ? WORKSPACE_SPACE_PAGE_SIZE
    : WORKSPACE_SPACE_PREVIEW_SIZE;
  const spacesOffset = options.spacesExpanded
    ? (spacesPage - 1) * WORKSPACE_SPACE_PAGE_SIZE
    : 0;
  const faultSections = new Set(options.faultSections ?? []);

  const [inventory, spaces, recent, inbox, media, drafts] =
    await Promise.allSettled([
      runWorkspaceSource(faultSections, "inventory", () =>
        sources.inventory(scope, {
          limit: inventoryPageSize + 1,
          offset: inventoryOffset,
        }),
      ),
      runWorkspaceSource(faultSections, "spaces", () =>
        sources.spaces(scope, {
          limit: spacesPageSize + 1,
          offset: spacesOffset,
        }),
      ),
      runWorkspaceSource(faultSections, "recent", () =>
        sources.recent(scope, WORKSPACE_RECENT_LIMIT),
      ),
      runWorkspaceSource(faultSections, "inbox", () => sources.inbox(scope)),
      runWorkspaceSource(faultSections, "media", () => sources.media(scope)),
      runWorkspaceSource(faultSections, "drafts", () =>
        (sources.drafts ?? defaultSources.drafts!)(scope),
      ),
    ]);

  const readModel: GardenWorkspaceReadModel = {
    inventory: resultSection(inventory, (value) => ({
      ...value,
      objects: value.objects.slice(0, inventoryPageSize),
      hasMore:
        value.objects.length > inventoryPageSize ||
        inventoryOffset + inventoryPageSize < value.totalCount,
      page: options.inventoryExpanded ? inventoryPage : 1,
      pageSize: inventoryPageSize,
    })),
    spaces: resultSection(spaces, (value) => ({
      ...value,
      spaces: value.spaces.slice(0, spacesPageSize),
      hasMore:
        value.spaces.length > spacesPageSize ||
        spacesOffset + spacesPageSize < value.totalCount,
      page: options.spacesExpanded ? spacesPage : 1,
      pageSize: spacesPageSize,
    })),
    recent: resultSection(recent, (value) => value),
    inbox: resultSection(inbox, (value) => value),
    media: resultSection(media, (value) => value),
    drafts: resultSection(drafts, (value) => value),
    allFailed: false,
  };

  readModel.allFailed = [
    readModel.inventory,
    readModel.spaces,
    readModel.recent,
    readModel.inbox,
    readModel.media,
  ].every((section) => section.status === "error");

  return readModel;
}

function runWorkspaceSource<T>(
  faultSections: ReadonlySet<GardenWorkspaceSectionKey>,
  section: GardenWorkspaceSectionKey,
  load: () => Promise<T>,
) {
  if (faultSections.has(section)) {
    return Promise.reject(new Error("Deterministic workspace section fault."));
  }
  return withGardenWorkspaceDeadline(load);
}

/**
 * Workspace sections are independent support surfaces. A slow dependency must
 * settle as the caller's generic error state, while a later completion remains
 * unable to alter that completed read model.
 */
export function withGardenWorkspaceDeadline<T>(
  load: () => Promise<T>,
  deadlineMs = WORKSPACE_SECTION_DEADLINE_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Garden workspace section deadline exceeded."));
    }, deadlineMs);

    void Promise.resolve()
      .then(load)
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

export function buildGardenWorkspaceInventorySummaryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("plant_objects")
    .leftJoin("journal_entries", (join) =>
      join
        .onRef("journal_entries.plant_object_id", "=", "plant_objects.id")
        .onRef(
          "journal_entries.owner_user_id",
          "=",
          "plant_objects.owner_user_id",
        )
        .on("journal_entries.entry_scope", "=", "object"),
    )
    .select(() => [
      sql<number>`count(distinct ${sql.ref("plant_objects.id")})::int`.as(
        "totalCount",
      ),
      sql<number>`count(distinct ${sql.ref("plant_objects.id")}) filter (
        where ${sql.ref("plant_objects.object_kind")} = 'plant'
      )::int`.as("plantCount"),
      sql<number>`count(distinct ${sql.ref("plant_objects.id")}) filter (
        where ${sql.ref("plant_objects.object_kind")} = 'animal'
      )::int`.as("animalCount"),
      sql<number>`count(${sql.ref("journal_entries.id")}) filter (
        where ${sql.ref("journal_entries.lifecycle_state")} = 'archived'
      )::int`.as("archivedEntryCount"),
    ])
    .where("plant_objects.owner_user_id", "=", scope.userId);
}

export function buildGardenWorkspaceSpaceSummariesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  window: { limit: number; offset: number },
) {
  const limit = normalizeLimit(window.limit);
  const offset = normalizeOffset(window.offset);

  return executor
    .selectFrom("spaces")
    .leftJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.space_id", "=", "spaces.id")
        .onRef("plant_objects.owner_user_id", "=", "spaces.owner_user_id"),
    )
    .select(["spaces.id as id", "spaces.display_name as displayName"])
    .select(() => [
      sql<number>`count(*) over()::int`.as("totalCount"),
      sql<number>`count(${sql.ref("plant_objects.id")})::int`.as("objectCount"),
      sql<number>`count(${sql.ref("plant_objects.id")}) filter (
        where ${sql.ref("plant_objects.object_kind")} = 'plant'
      )::int`.as("plantCount"),
      sql<number>`count(${sql.ref("plant_objects.id")}) filter (
        where ${sql.ref("plant_objects.object_kind")} = 'animal'
      )::int`.as("animalCount"),
    ])
    .where("spaces.owner_user_id", "=", scope.userId)
    .groupBy(["spaces.id", "spaces.display_name", "spaces.created_at"])
    .orderBy("spaces.created_at", "desc")
    .orderBy("spaces.id", "asc")
    .limit(limit)
    .offset(offset);
}

export function buildGardenWorkspaceRecentEntriesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = WORKSPACE_RECENT_LIMIT,
) {
  return executor
    .selectFrom("journal_entries")
    .innerJoin("spaces", (join) =>
      join
        .onRef("spaces.id", "=", "journal_entries.space_id")
        .onRef("spaces.owner_user_id", "=", "journal_entries.owner_user_id"),
    )
    .leftJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .select([
      "journal_entries.id as id",
      "journal_entries.title as title",
      "journal_entries.entry_scope as entryScope",
      "journal_entries.entry_date as entryDate",
      "journal_entries.visibility as visibility",
      "journal_entries.lifecycle_state as lifecycleState",
      "plant_objects.id as objectId",
      "plant_objects.display_name as objectDisplayName",
      "spaces.id as spaceId",
      "spaces.display_name as spaceDisplayName",
    ])
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where("spaces.owner_user_id", "=", scope.userId)
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(normalizeLimit(limit));
}

export function buildGardenWorkspaceMediaStatusQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("media_assets")
    .select(({ fn }) => ["status", fn.count<number>("id").as("count")])
    .where("owner_user_id", "=", scope.userId)
    .where("status", "in", ["quarantined", "failed"])
    .groupBy("status");
}

function resultSection<TInput, TOutput>(
  result: PromiseSettledResult<TInput>,
  map: (value: TInput) => TOutput,
): GardenWorkspaceSection<TOutput> {
  if (result.status === "rejected") return { status: "error" };
  return { status: "ready", value: map(result.value) };
}

function normalizeCount(value: number | string | bigint | null | undefined) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function normalizePage(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value));
}

function normalizeLimit(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_WORKSPACE_QUERY_LIMIT, Math.max(1, Math.trunc(value)));
}

function normalizeOffset(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function workspaceObjectKindCounts(
  objects: readonly { objectKind: PlantObjectKind }[],
) {
  return {
    plantCount: objects.filter((object) => object.objectKind === "plant")
      .length,
    animalCount: objects.filter((object) => object.objectKind === "animal")
      .length,
  };
}
