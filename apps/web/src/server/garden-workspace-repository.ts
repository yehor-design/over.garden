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
import {
  classifyWorkspaceFailure,
  settleSection,
  WORKSPACE_FAILURE_CLASSES,
  WORKSPACE_SECTION_DEADLINE_MS,
  WorkspaceSectionDeadlineError,
  withWorkspaceSectionDeadline,
  type WorkspaceFailureClass,
  type WorkspaceSection,
} from "@/server/workspace-failure";

/**
 * The failure vocabulary lives in `@/server/workspace-failure` now that every
 * page under `/garden/**` shares it (ADR-0023). These aliases keep the
 * workspace home page's original names compiling — including in
 * `scripts/prove-workspace-section-observability.ts`, whose receipt names are a
 * published contract — so renaming a member of the closed set stays the one
 * breaking change it always was.
 */
export type GardenWorkspaceFailureClass = WorkspaceFailureClass;
export type GardenWorkspaceSection<T> = WorkspaceSection<T>;
export {
  classifyWorkspaceFailure as classifyGardenWorkspaceFailure,
  WORKSPACE_FAILURE_CLASSES as GARDEN_WORKSPACE_FAILURE_CLASSES,
  WORKSPACE_SECTION_DEADLINE_MS,
  WorkspaceSectionDeadlineError as GardenWorkspaceSectionDeadlineError,
  withWorkspaceSectionDeadline as withGardenWorkspaceDeadline,
};

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const WORKSPACE_INVENTORY_PREVIEW_SIZE = 8;
export const WORKSPACE_INVENTORY_PAGE_SIZE = 10;
export const WORKSPACE_SPACE_PREVIEW_SIZE = 4;
export const WORKSPACE_SPACE_PAGE_SIZE = 4;
export const WORKSPACE_RECENT_LIMIT = 8;

/**
 * Database round trips each section costs at its worst. On the serverless pool
 * default of one connection per instance these do not overlap, so a section
 * that issues four queries waits four times as long as one that issues one.
 *
 * A single deadline shared across sections of unequal work is a unit mismatch
 * rather than a safety margin: it gives the largest section a quarter of the
 * protection the smallest one gets. Production measurement on 2026-09-01 found
 * exactly that — `inventory` was the only section to report `query_timeout`,
 * and only on a cold instance, while 22 warm samples across sequential and
 * concurrent shapes never failed.
 *
 * `inventory` costs four: the summary count and the object page, then the entry
 * summaries and the cover media keyed on the ids the page returned. The count
 * is measured by `prove-workspace-section-observability`, not trusted.
 */
export const GARDEN_WORKSPACE_SECTION_QUERY_COUNT = {
  inventory: 4,
  spaces: 1,
  recent: 1,
  inbox: 1,
} as const satisfies Record<GardenWorkspaceSectionKey, number>;

/**
 * The budget is derived from the section's own round-trip cost, so a section
 * that gains a query gains its budget with it and nobody hand-picks a constant.
 */
export function gardenWorkspaceSectionDeadlineMs(
  section: GardenWorkspaceSectionKey,
): number {
  return (
    WORKSPACE_SECTION_DEADLINE_MS *
    GARDEN_WORKSPACE_SECTION_QUERY_COUNT[section]
  );
}

const MAX_WORKSPACE_QUERY_LIMIT = 25;

export interface GardenWorkspaceInventorySource {
  totalCount: number;
  plantCount: number;
  animalCount: number;
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

export interface GardenWorkspaceReadModel {
  inventory: GardenWorkspaceSection<GardenWorkspaceInventory>;
  spaces: GardenWorkspaceSection<GardenWorkspaceSpaces>;
  recent: GardenWorkspaceSection<GardenWorkspaceRecentEntry[]>;
  inbox: GardenWorkspaceSection<GardenWorkspaceInboxSummary>;
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
  | "inbox";

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
}

/**
 * The inventory read, with an injectable executor so its round-trip count is a
 * measurement rather than a claim in a comment.
 */
export async function loadGardenWorkspaceInventorySource(
  scope: RequestScope,
  window: { limit: number; offset: number },
  executor: QueryExecutor = db,
): Promise<GardenWorkspaceInventorySource> {
  const [summary, objects] = await Promise.all([
    buildGardenWorkspaceInventorySummaryQuery(
      executor,
      scope,
    ).executeTakeFirst(),
    listMyPlantObjects(scope, window.limit, window.offset, executor),
  ]);

  return {
    totalCount: normalizeCount(summary?.totalCount),
    plantCount: normalizeCount(summary?.plantCount),
    animalCount: normalizeCount(summary?.animalCount),
    objects,
  };
}

const defaultSources: GardenWorkspaceSources = {
  inventory(scope, window) {
    return loadGardenWorkspaceInventorySource(scope, window);
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

  const [inventory, spaces, recent, inbox] = await Promise.all([
    settleWorkspaceSource(faultSections, "inventory", () =>
      sources.inventory(scope, {
        limit: inventoryPageSize + 1,
        offset: inventoryOffset,
      }),
    ),
    settleWorkspaceSource(faultSections, "spaces", () =>
      sources.spaces(scope, {
        limit: spacesPageSize + 1,
        offset: spacesOffset,
      }),
    ),
    settleWorkspaceSource(faultSections, "recent", () =>
      sources.recent(scope, WORKSPACE_RECENT_LIMIT),
    ),
    settleWorkspaceSource(faultSections, "inbox", () => sources.inbox(scope)),
  ]);

  const readModel: GardenWorkspaceReadModel = {
    inventory: mapSection(inventory, (value) => ({
      ...value,
      objects: value.objects.slice(0, inventoryPageSize),
      hasMore:
        value.objects.length > inventoryPageSize ||
        inventoryOffset + inventoryPageSize < value.totalCount,
      page: options.inventoryExpanded ? inventoryPage : 1,
      pageSize: inventoryPageSize,
    })),
    spaces: mapSection(spaces, (value) => ({
      ...value,
      spaces: value.spaces.slice(0, spacesPageSize),
      hasMore:
        value.spaces.length > spacesPageSize ||
        spacesOffset + spacesPageSize < value.totalCount,
      page: options.spacesExpanded ? spacesPage : 1,
      pageSize: spacesPageSize,
    })),
    recent,
    inbox,
    allFailed: false,
  };

  readModel.allFailed = [
    readModel.inventory,
    readModel.spaces,
    readModel.recent,
    readModel.inbox,
  ].every((section) => section.status === "error");

  return readModel;
}

function settleWorkspaceSource<T>(
  faultSections: ReadonlySet<GardenWorkspaceSectionKey>,
  section: GardenWorkspaceSectionKey,
  load: () => Promise<T>,
): Promise<GardenWorkspaceSection<T>> {
  return settleSection(
    () => {
      if (faultSections.has(section)) {
        throw new Error("Deterministic workspace section fault.");
      }
      return load();
    },
    {
      deadlineMs: gardenWorkspaceSectionDeadlineMs(section),
      surface: "garden-home",
      section,
    },
  );
}

/**
 * Presentation shaping applies to a settled value and leaves a failure whole:
 * the class, digest, and relation an operator reads must survive the map.
 */
function mapSection<TInput, TOutput>(
  section: GardenWorkspaceSection<TInput>,
  map: (value: TInput) => TOutput,
): GardenWorkspaceSection<TOutput> {
  if (section.status === "error") return section;
  return { status: "ready", value: map(section.value) };
}

export function buildGardenWorkspaceInventorySummaryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  // The counts are over `plant_objects` alone. A left join to `journal_entries`
  // was here and contributed nothing: it never reached the select list or the
  // predicate, so it could only duplicate left rows that `count(distinct …)`
  // then collapsed again. Removing it removes the duplication *and* the reason
  // for the distinct.
  //
  // Measured on Postgres 18 against one owner with 4,000 objects and 32,000
  // object-scoped entries: 8.713 ms and 35,878 shared-buffer hits with the
  // join, 0.346 ms and 30 hits without it. The join's cost scaled with the
  // gardener's own journal, so the section grew slower the more they wrote.
  return executor
    .selectFrom("plant_objects")
    .select(() => [
      sql<number>`count(*)::int`.as("totalCount"),
      sql<number>`count(*) filter (
        where ${sql.ref("plant_objects.object_kind")} = 'plant'
      )::int`.as("plantCount"),
      sql<number>`count(*) filter (
        where ${sql.ref("plant_objects.object_kind")} = 'animal'
      )::int`.as("animalCount"),
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
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("spaces.owner_user_id", "=", scope.userId)
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(normalizeLimit(limit));
}

export interface GardenWorkspaceSectionReceiptRow {
  section: "inventory" | "spaces" | "recent" | "inbox";
  status: "ready" | "error";
  failureClass: GardenWorkspaceFailureClass | null;
}

/**
 * A class-only description of how the four sections settled. It carries no
 * query, parameter, connection string, row, or owner identifier, so it is safe
 * to record wherever a receipt is kept.
 */
export function describeGardenWorkspaceSections(
  readModel: GardenWorkspaceReadModel,
): GardenWorkspaceSectionReceiptRow[] {
  const sections = ["inventory", "spaces", "recent", "inbox"] as const;
  return sections.map((section) => {
    const value = readModel[section];
    return {
      section,
      status: value.status,
      failureClass: value.status === "error" ? value.failureClass : null,
    };
  });
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
