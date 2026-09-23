import "server-only";

import { sql, type Kysely } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { publicJournalEntryAddress } from "@/lib/garden/public-paths";
import {
  SPACE_HISTORY_PAGE_SIZE,
  SPACE_HISTORY_PREVIEW_SIZE,
  type OwnedSpaceSummary,
  type SpaceDeletionBlockers,
  type SpaceHistoryPage,
  type SpacePageRequest,
} from "@/lib/garden/space-page";
import type { SpaceLocationVisibility } from "@/lib/garden/space-setup";
import type { RequestScope } from "@/server/request-scope";

/**
 * The reads and writes of a space's own page (`OVE-490`). Every statement
 * names the owner; a space that is not the reader's is `null`, whatever the
 * reason, so the page cannot be used to learn that an id exists.
 */

export const SPACE_PAGE_STATEMENT_TIMEOUT = "1200ms";

async function bounded<T>(
  executor: Kysely<Database>,
  work: (tx: Kysely<Database>) => Promise<T>,
): Promise<T> {
  return executor.transaction().execute(async (tx) => {
    await sql
      .raw(`set local statement_timeout = '${SPACE_PAGE_STATEMENT_TIMEOUT}'`)
      .execute(tx);
    return work(tx);
  });
}

export async function readSpacePageSummary(
  scope: RequestScope,
  spaceId: string,
  executor: Kysely<Database> = db,
): Promise<OwnedSpaceSummary | null> {
  return bounded(executor, async (tx) => {
    const result = await sql<{
      id: string;
      displayName: string;
      locationVisibility: string;
      coarseRegionCode: string | null;
      objectCount: number;
      entryCount: number;
      lastEntryDate: string | null;
    }>`
      select s.id,
             s.display_name as "displayName",
             s.location_visibility as "locationVisibility",
             s.coarse_region_code as "coarseRegionCode",
             (select count(*)::int from plant_objects as o
               where o.owner_user_id = ${scope.userId}::uuid
                 and o.space_id = s.id) as "objectCount",
             entries.count as "entryCount",
             entries.last as "lastEntryDate"
      from spaces as s
      cross join lateral (
        select count(*)::int as count,
               to_char(max(e.entry_date), 'YYYY-MM-DD') as last
        from journal_entries as e
        where e.owner_user_id = ${scope.userId}::uuid
          and e.space_id = s.id
          and e.lifecycle_state = 'active'
      ) as entries
      where s.id = ${spaceId}::uuid
        and s.owner_user_id = ${scope.userId}::uuid
    `.execute(tx);
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...row,
      locationVisibility:
        row.locationVisibility === "region" ? "region" : "hidden",
    };
  });
}

/**
 * The space's history: every active entry that belongs to it — the place's
 * own notes and the entries about anything in it — each once, newest
 * observation first, ties broken by when it was written and then by id so a
 * page boundary never repeats or skips one. The object join is one-to-one
 * (an entry has one destination), so nothing here can duplicate a row.
 */
export async function listSpaceHistory(
  scope: RequestScope,
  spaceId: string,
  request: SpacePageRequest,
  authorHandle: string | null,
  executor: Kysely<Database> = db,
): Promise<SpaceHistoryPage> {
  const limit =
    request.view === "history"
      ? SPACE_HISTORY_PAGE_SIZE
      : SPACE_HISTORY_PREVIEW_SIZE;
  return bounded(executor, async (tx) => {
    const counted = await sql<{ total: number }>`
      select count(*)::int as total
      from journal_entries as e
      where e.owner_user_id = ${scope.userId}::uuid
        and e.space_id = ${spaceId}::uuid
        and e.lifecycle_state = 'active'
    `.execute(tx);
    const total = counted.rows[0]?.total ?? 0;
    if (total === 0) return { entries: [], total };
    const lastPageOffset = Math.floor((total - 1) / limit) * limit;
    const offset =
      request.view === "history"
        ? Math.min((request.page - 1) * limit, lastPageOffset)
        : 0;

    const rows = await sql<{
      id: string;
      title: string;
      entryDate: string;
      entryScope: string;
      objectId: string | null;
      objectName: string | null;
      objectKind: string | null;
      entryNumber: number | null;
      publicSlug: string | null;
    }>`
      select e.id,
             e.title,
             to_char(e.entry_date, 'YYYY-MM-DD') as "entryDate",
             e.entry_scope as "entryScope",
             o.id as "objectId",
             o.display_name as "objectName",
             o.object_kind as "objectKind",
             e.author_entry_number as "entryNumber",
             e.public_slug as "publicSlug"
      from journal_entries as e
      left join plant_objects as o
        on o.id = e.plant_object_id
       and o.owner_user_id = ${scope.userId}::uuid
      where e.owner_user_id = ${scope.userId}::uuid
        and e.space_id = ${spaceId}::uuid
        and e.lifecycle_state = 'active'
      order by e.entry_date desc, e.created_at desc, e.id asc
      limit ${limit} offset ${offset}
    `.execute(tx);

    return {
      total,
      entries: rows.rows.map((row) => ({
        id: row.id,
        title: row.title,
        entryDate: row.entryDate,
        about:
          row.entryScope === "object" && row.objectId
            ? {
                kind: "object" as const,
                objectId: row.objectId,
                displayName: row.objectName ?? "",
                objectKind:
                  row.objectKind === "animal"
                    ? ("animal" as const)
                    : ("plant" as const),
              }
            : { kind: "space" as const },
        publicPath:
          (authorHandle && row.entryNumber) || row.publicSlug
            ? publicJournalEntryAddress({
                authorHandle,
                entryNumber: row.entryNumber,
                publicSlug: row.publicSlug,
              })
            : null,
      })),
    };
  });
}

export async function readSpaceDeletionBlockers(
  scope: RequestScope,
  spaceId: string,
  executor: Kysely<Database> = db,
): Promise<SpaceDeletionBlockers> {
  return bounded(executor, async (tx) => {
    const result = await sql<SpaceDeletionBlockers>`
      select
        (select count(*)::int from plant_objects
          where owner_user_id = ${scope.userId}::uuid
            and space_id = ${spaceId}::uuid) as "objectCount",
        (select count(*)::int from journal_entries
          where owner_user_id = ${scope.userId}::uuid
            and space_id = ${spaceId}::uuid) as "entryCount"
    `.execute(tx);
    return result.rows[0] ?? { objectCount: 0, entryCount: 0 };
  });
}

export type UpdateOwnedSpaceResult =
  | {
      status: "updated";
      space: { id: string; displayName: string };
      /** Public pages that show this space: its objects and their entries. */
      publicObjectIds: string[];
      publicEntryIds: string[];
    }
  | { status: "missing" };

/**
 * Rename a space, or change whether its coarse region may appear publicly —
 * the fields the `spaces` table holds, and nothing else. The name is the
 * gardener's label; the id is the identity, so every link and every entry
 * keeps pointing at the same space.
 */
export async function updateOwnedSpace(
  scope: RequestScope,
  input: {
    spaceId: string;
    displayName: string;
    locationVisibility: SpaceLocationVisibility;
    coarseRegionCode: string | null;
  },
  executor: Kysely<Database> = db,
): Promise<UpdateOwnedSpaceResult> {
  return bounded(executor, async (tx) => {
    const updated = await sql<{ id: string; displayName: string }>`
      update spaces
      set display_name = ${input.displayName},
          location_visibility = ${input.locationVisibility},
          coarse_region_code = ${
            input.locationVisibility === "region"
              ? input.coarseRegionCode
              : null
          },
          updated_at = now()
      where id = ${input.spaceId}::uuid
        and owner_user_id = ${scope.userId}::uuid
      returning id, display_name as "displayName"
    `.execute(tx);
    const space = updated.rows[0];
    if (!space) return { status: "missing" };
    const [objects, entries] = await Promise.all([
      sql<{ id: string }>`
        select id from plant_objects
        where owner_user_id = ${scope.userId}::uuid
          and space_id = ${space.id}::uuid`.execute(tx),
      sql<{ id: string }>`
        select id from journal_entries
        where owner_user_id = ${scope.userId}::uuid
          and space_id = ${space.id}::uuid
          and lifecycle_state = 'active'`.execute(tx),
    ]);
    return {
      status: "updated",
      space,
      publicObjectIds: objects.rows.map((row) => row.id),
      publicEntryIds: entries.rows.map((row) => row.id),
    };
  });
}

export type DeleteEmptySpaceResult =
  | { status: "deleted" }
  | { status: "missing" }
  | { status: "not_empty"; blockers: SpaceDeletionBlockers };

/**
 * Delete a space only when nothing hangs from it.
 *
 * The foreign keys from `plant_objects` and `journal_entries` cascade, so a
 * bare delete would take every plant, animal and entry in the space with it
 * — including entries still inside their seven-day window (ADR-0021). The
 * space row is locked first: an object or entry created in the meantime needs
 * a key-share lock on the same row, so it either committed before the count
 * (and blocks the delete) or waits and then finds the space gone.
 */
export async function deleteEmptySpace(
  scope: RequestScope,
  spaceId: string,
  executor: Kysely<Database> = db,
): Promise<DeleteEmptySpaceResult> {
  return bounded(executor, async (tx) => {
    const locked = await sql<{ id: string }>`
      select id from spaces
      where id = ${spaceId}::uuid and owner_user_id = ${scope.userId}::uuid
      for update
    `.execute(tx);
    if (!locked.rows[0]) return { status: "missing" };
    const counted = await sql<SpaceDeletionBlockers>`
      select
        (select count(*)::int from plant_objects
          where space_id = ${spaceId}::uuid) as "objectCount",
        (select count(*)::int from journal_entries
          where space_id = ${spaceId}::uuid) as "entryCount"
    `.execute(tx);
    const blockers = counted.rows[0] ?? { objectCount: 0, entryCount: 0 };
    if (blockers.objectCount > 0 || blockers.entryCount > 0) {
      return { status: "not_empty", blockers };
    }
    await sql`
      delete from spaces
      where id = ${spaceId}::uuid and owner_user_id = ${scope.userId}::uuid
    `.execute(tx);
    return { status: "deleted" };
  });
}
