import "server-only";

import { sql, type Kysely, type RawBuilder } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  GARDEN_COLLECTION_PAGE_SIZE,
  GARDEN_SPACES_PREVIEW_SIZE,
  type GardenCollectionRequest,
  type GardenObjectsGroup,
  type GardenSpacesGroup,
} from "@/lib/garden/garden-collection";
import type { RequestScope } from "@/server/request-scope";
import { ownedPhotoView, readOwnedPhotos } from "@/server/owned-photo-repository";

/**
 * The collection's two reads (`OVE-489`), one per group, each bounded by its
 * own statement timeout and settled by the caller on its own (ADR-0023), so a
 * failure in one never hides the other.
 *
 * Ownership is applied in every statement. "Recent" orders by the observation
 * date of the newest active entry — what was written, never what was clicked
 * or opened — with never-written things last; "name" is alphabetical. Both
 * break ties by identity, so a page boundary never repeats or skips a row.
 */

export const GARDEN_COLLECTION_STATEMENT_TIMEOUT = "1200ms";

/** Round trips a group costs at its worst: begin, timeout, count, page, commit. */
export const GARDEN_COLLECTION_GROUP_QUERY_COUNT = 3;

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/gu, "\\$&")}%`;
}

/**
 * A page past the end — a stale link, a hand-edited address — shows the last
 * page rather than an empty one that reads like an empty garden. The
 * pagination states the page it actually shows.
 */
export function lastPageOffset(
  offset: number,
  limit: number,
  total: number,
): number {
  if (limit <= 0 || total <= 0) return 0;
  return Math.min(offset, Math.floor((total - 1) / limit) * limit);
}

function objectWindow(request: GardenCollectionRequest) {
  if (request.kind === "space") return { limit: 0, offset: 0 };
  return {
    limit: GARDEN_COLLECTION_PAGE_SIZE,
    offset: (request.page - 1) * GARDEN_COLLECTION_PAGE_SIZE,
  };
}

function spaceWindow(request: GardenCollectionRequest) {
  if (request.kind === "object") return { limit: 0, offset: 0 };
  if (request.kind === "all") {
    return { limit: GARDEN_SPACES_PREVIEW_SIZE, offset: 0 };
  }
  return {
    limit: GARDEN_COLLECTION_PAGE_SIZE,
    offset: (request.page - 1) * GARDEN_COLLECTION_PAGE_SIZE,
  };
}

interface ObjectRow {
  id: string;
  displayName: string;
  objectKind: string;
  species: string | null;
  spaceId: string;
  spaceName: string;
  lastEntryDate: string | null;
}

/**
 * Every owned object with what identifies it: its space, and its organism by
 * the catalogue's canonical name — the name the destination picker and the
 * object's own page show, so one tomato reads the same everywhere. Only a
 * public, active catalogue identity is named, as everywhere else in the
 * workspace.
 */
function ownedObjects(scope: RequestScope, spaceId?: string) {
  const inSpace = spaceId ? sql`and o.space_id = ${spaceId}::uuid` : sql``;
  return sql`
    select o.id,
           o.display_name,
           o.object_kind,
           o.variety_text,
           o.catalog_item_id,
           s.id as space_id,
           s.display_name as space_name,
           c.canonical_name as species
    from plant_objects as o
    join spaces as s
      on s.id = o.space_id and s.owner_user_id = ${scope.userId}::uuid
    left join catalog_items as c
      on c.id = o.catalog_item_id
     and c.identity_state = 'active'
     and c.created_by_user_id is null
    where o.owner_user_id = ${scope.userId}::uuid
      ${inSpace}
  `;
}

/**
 * A query finds an object by its own name, its space, its variety, or any
 * name its organism goes by — "помідор" finds the cherry tomato whose species
 * is Solanum lycopersicum (FAST_ENTRY.md: useful species synonyms).
 */
function objectMatches(q: string): RawBuilder<unknown> {
  if (!q) return sql`true`;
  const pattern = likePattern(q);
  return sql`(
    display_name ilike ${pattern}
    or space_name ilike ${pattern}
    or species ilike ${pattern}
    or variety_text ilike ${pattern}
    or (species is not null and exists (
      select 1
      from catalog_item_names as n
      where n.catalog_item_id = owned.catalog_item_id
        and n.display_name ilike ${pattern}
    ))
  )`;
}

export async function listGardenObjects(
  scope: RequestScope,
  request: GardenCollectionRequest,
  /** One space's plants and animals, for the space's own page (`OVE-490`). */
  options: { spaceId?: string } = {},
  executor: Kysely<Database> = db,
): Promise<GardenObjectsGroup> {
  const { limit, offset } = objectWindow(request);
  const matches = objectMatches(request.q);
  const order =
    request.sort === "name"
      ? sql`lower(display_name), lower(space_name), id`
      : sql`last_entry_date desc nulls last, lower(display_name), lower(space_name), id`;

  return executor.transaction().execute(async (tx) => {
    await sql
      .raw(
        `set local statement_timeout = '${GARDEN_COLLECTION_STATEMENT_TIMEOUT}'`,
      )
      .execute(tx);
    const counts = await sql<{ owned: number; total: number }>`
      with owned as (${ownedObjects(scope, options.spaceId)})
      select count(*)::int as owned,
             (count(*) filter (where ${matches}))::int as total
      from owned
    `.execute(tx);
    const { owned = 0, total = 0 } = counts.rows[0] ?? {};
    if (limit === 0 || total === 0) return { items: [], total, owned };

    const rows = await sql<ObjectRow>`
      with owned as (${ownedObjects(scope, options.spaceId)}),
      last_entries as (
        select e.plant_object_id, max(e.entry_date) as last_entry_date
        from journal_entries as e
        where e.owner_user_id = ${scope.userId}::uuid
          and e.entry_scope = 'object'
          and e.lifecycle_state = 'active'
        group by e.plant_object_id
      ),
      matched as (
        select owned.*, last_entries.last_entry_date
        from owned
        left join last_entries on last_entries.plant_object_id = owned.id
        where ${matches}
      )
      select id,
             display_name as "displayName",
             object_kind as "objectKind",
             species,
             space_id as "spaceId",
             space_name as "spaceName",
             to_char(last_entry_date, 'YYYY-MM-DD') as "lastEntryDate"
      from matched
      order by ${order}
      limit ${limit} offset ${lastPageOffset(offset, limit, total)}
    `.execute(tx);

    return {
      items: rows.rows.map((row) => ({
        kind: "object" as const,
        id: row.id,
        displayName: row.displayName,
        objectKind: row.objectKind === "animal" ? "animal" : "plant",
        species: row.species,
        space: { id: row.spaceId, displayName: row.spaceName },
        lastEntryDate: row.lastEntryDate,
      })),
      total,
      owned,
    };
  });
}

interface SpaceRow {
  id: string;
  displayName: string;
  objectCount: number;
  lastEntryDate: string | null;
}

export async function listGardenSpaces(
  scope: RequestScope,
  request: GardenCollectionRequest,
  executor: Kysely<Database> = db,
): Promise<GardenSpacesGroup> {
  const { limit, offset } = spaceWindow(request);
  const matches = request.q
    ? sql`s.display_name ilike ${likePattern(request.q)}`
    : sql`true`;
  const order =
    request.sort === "name"
      ? sql`lower(s.display_name), s.id`
      : sql`last_entries.last_entry_date desc nulls last, lower(s.display_name), s.id`;

  return executor.transaction().execute(async (tx) => {
    await sql
      .raw(
        `set local statement_timeout = '${GARDEN_COLLECTION_STATEMENT_TIMEOUT}'`,
      )
      .execute(tx);
    const counts = await sql<{ owned: number; total: number }>`
      select count(*)::int as owned,
             (count(*) filter (where ${matches}))::int as total
      from spaces as s
      where s.owner_user_id = ${scope.userId}::uuid
    `.execute(tx);
    const { owned = 0, total = 0 } = counts.rows[0] ?? {};
    if (limit === 0 || total === 0) return { items: [], total, owned };

    const rows = await sql<SpaceRow>`
      with last_entries as (
        select e.space_id, max(e.entry_date) as last_entry_date
        from journal_entries as e
        where e.owner_user_id = ${scope.userId}::uuid
          and e.lifecycle_state = 'active'
        group by e.space_id
      ),
      object_counts as (
        select o.space_id, count(*)::int as object_count
        from plant_objects as o
        where o.owner_user_id = ${scope.userId}::uuid
        group by o.space_id
      )
      select s.id,
             s.display_name as "displayName",
             coalesce(object_counts.object_count, 0) as "objectCount",
             to_char(last_entries.last_entry_date, 'YYYY-MM-DD') as "lastEntryDate"
      from spaces as s
      left join last_entries on last_entries.space_id = s.id
      left join object_counts on object_counts.space_id = s.id
      where s.owner_user_id = ${scope.userId}::uuid
        and ${matches}
      order by ${order}
      limit ${limit} offset ${lastPageOffset(offset, limit, total)}
    `.execute(tx);

    const photos = await readOwnedPhotos(tx, {
      ownerUserId: scope.userId,
      kind: "space",
      ids: rows.rows.map((row) => row.id),
    });
    return {
      items: rows.rows.map((row) => {
        const photo = photos.get(row.id);
        return {
          kind: "space" as const,
          id: row.id,
          displayName: row.displayName,
          photo: photo ? ownedPhotoView(photo) : null,
          objectCount: row.objectCount,
          lastEntryDate: row.lastEntryDate,
        };
      }),
      total,
      owned,
    };
  });
}
