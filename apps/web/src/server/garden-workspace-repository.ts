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

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const WORKSPACE_INVENTORY_PREVIEW_SIZE = 8;
export const WORKSPACE_INVENTORY_PAGE_SIZE = 10;
export const WORKSPACE_SPACE_PREVIEW_SIZE = 4;
export const WORKSPACE_SPACE_PAGE_SIZE = 4;
export const WORKSPACE_RECENT_LIMIT = 8;
export const WORKSPACE_SECTION_DEADLINE_MS = 1_200;

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
  return WORKSPACE_SECTION_DEADLINE_MS * GARDEN_WORKSPACE_SECTION_QUERY_COUNT[section];
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

/**
 * The closed set of reasons a workspace section can fail. `resultSection` used
 * to map every rejection onto a bare `{ status: "error" }` and discard the
 * reason, so a degraded section could not be told apart from a permission
 * refusal, a missing relation, or a timeout — and the platform log could not
 * help either, because the page still returns its normal status.
 */
export const GARDEN_WORKSPACE_FAILURE_CLASSES = [
  "permission_denied",
  "schema_missing",
  "query_timeout",
  "connection_unavailable",
  "serialization_failure",
  "unknown",
] as const;

export type GardenWorkspaceFailureClass =
  (typeof GARDEN_WORKSPACE_FAILURE_CLASSES)[number];

export type GardenWorkspaceSection<T> =
  | { status: "ready"; value: T }
  | { status: "error"; failureClass: GardenWorkspaceFailureClass };

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
    buildGardenWorkspaceInventorySummaryQuery(executor, scope).executeTakeFirst(),
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

  const [inventory, spaces, recent, inbox] = await Promise.allSettled([
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

function runWorkspaceSource<T>(
  faultSections: ReadonlySet<GardenWorkspaceSectionKey>,
  section: GardenWorkspaceSectionKey,
  load: () => Promise<T>,
) {
  if (faultSections.has(section)) {
    return Promise.reject(new Error("Deterministic workspace section fault."));
  }
  return withGardenWorkspaceDeadline(
    load,
    gardenWorkspaceSectionDeadlineMs(section),
  );
}

/**
 * A section that exceeded its own deadline. It carries a code so the bounded
 * classifier reports `query_timeout` rather than losing the distinction between
 * a slow dependency and an unrecognised fault.
 */
export class GardenWorkspaceSectionDeadlineError extends Error {
  readonly code = "workspace_section_deadline";

  constructor() {
    super("Garden workspace section deadline exceeded.");
    this.name = "GardenWorkspaceSectionDeadlineError";
  }
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
      reject(new GardenWorkspaceSectionDeadlineError());
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

function resultSection<TInput, TOutput>(
  result: PromiseSettledResult<TInput>,
  map: (value: TInput) => TOutput,
): GardenWorkspaceSection<TOutput> {
  if (result.status === "rejected") {
    return {
      status: "error",
      failureClass: classifyGardenWorkspaceFailure(result.reason),
    };
  }
  return { status: "ready", value: map(result.value) };
}

const POSTGRES_FAILURE_CLASS: Readonly<
  Record<string, GardenWorkspaceFailureClass>
> = {
  // insufficient_privilege
  "42501": "permission_denied",
  // undefined_table, undefined_column, undefined_function, undefined_object
  "42P01": "schema_missing",
  "42703": "schema_missing",
  "42883": "schema_missing",
  "42704": "schema_missing",
  // query_canceled, idle_session_timeout
  "57014": "query_timeout",
  "57P05": "query_timeout",
  // connection exception family
  "08000": "connection_unavailable",
  "08001": "connection_unavailable",
  "08003": "connection_unavailable",
  "08004": "connection_unavailable",
  "08006": "connection_unavailable",
  "08007": "connection_unavailable",
  "57P01": "connection_unavailable",
  "57P03": "connection_unavailable",
  // serialization_failure, deadlock_detected
  "40001": "serialization_failure",
  "40P01": "serialization_failure",
};

const SYSTEM_FAILURE_CLASS: Readonly<
  Record<string, GardenWorkspaceFailureClass>
> = {
  ECONNREFUSED: "connection_unavailable",
  ECONNRESET: "connection_unavailable",
  EHOSTUNREACH: "connection_unavailable",
  ENOTFOUND: "connection_unavailable",
  EPIPE: "connection_unavailable",
  ETIMEDOUT: "query_timeout",
  workspace_section_deadline: "query_timeout",
};

/**
 * Maps a rejection onto exactly one bounded class. The reason itself is never
 * returned or recorded: a driver error can carry the failing statement and its
 * bound parameters, and those may contain journal content.
 */
export function classifyGardenWorkspaceFailure(
  reason: unknown,
): GardenWorkspaceFailureClass {
  if (reason instanceof Error && reason.name === "AbortError") {
    return "query_timeout";
  }
  const code =
    reason !== null && typeof reason === "object" && "code" in reason
      ? String((reason as { code: unknown }).code)
      : undefined;
  if (!code) return "unknown";
  return (
    POSTGRES_FAILURE_CLASS[code] ?? SYSTEM_FAILURE_CLASS[code] ?? "unknown"
  );
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
