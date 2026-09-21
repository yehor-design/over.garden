import "server-only";
import { sql, type Kysely } from "kysely";
import { db } from "@/db";
import type { Database } from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";
import {
  DESTINATION_PAGE_SIZE,
  DESTINATION_QUERY_LIMIT,
  type DestinationFilter,
  type OwnedDestination,
  type OwnedDestinationPage,
} from "@/lib/garden/owned-destinations";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Cursor {
  q: string;
  filter: DestinationFilter;
  kind: "space" | "object";
  id: string;
}
export class InvalidDestinationQuery extends Error {}
export function parseDestinationQuery(params: URLSearchParams) {
  const q = (params.get("q") ?? "").trim().normalize("NFKC");
  const filter = params.get("kind") ?? "all";
  if (
    q.length > DESTINATION_QUERY_LIMIT ||
    !["all", "space", "object"].includes(filter)
  )
    throw new InvalidDestinationQuery();
  let cursor: Cursor | null = null;
  const raw = params.get("cursor");
  if (raw) {
    try {
      if (raw.length > 1024) throw new Error();
      cursor = JSON.parse(Buffer.from(raw, "base64url").toString());
      if (
        !cursor ||
        cursor.q !== q ||
        cursor.filter !== filter ||
        !["space", "object"].includes(cursor.kind) ||
        !UUID.test(cursor.id)
      )
        throw new Error();
    } catch {
      throw new InvalidDestinationQuery();
    }
  }
  return { q, filter: filter as DestinationFilter, cursor };
}
type Query = ReturnType<typeof parseDestinationQuery>;
interface Row {
  kind: "space" | "object";
  id: string;
  displayName: string;
  objectKind: "plant" | "animal" | null;
  parentId: string | null;
  parentName: string | null;
  species: string | null;
  lastPublished: Date | null;
}
function destination(row: Row): OwnedDestination {
  return row.kind === "space"
    ? { kind: "space", id: row.id, displayName: row.displayName }
    : {
        kind: "object",
        id: row.id,
        displayName: row.displayName,
        objectKind: row.objectKind!,
        parent: row.parentId
          ? { id: row.parentId, displayName: row.parentName! }
          : null,
        species: row.species,
      };
}
/** Ownership is applied independently in BOTH arms; a cursor never grants access.
 * Identity order is immutable, including when a display name is edited between pages.
 * Recency comes only from acknowledged publications, never selection/click history.
 */
export async function listOwnedDestinations(
  scope: RequestScope,
  query: Query,
  executor: Kysely<Database> = db,
): Promise<OwnedDestinationPage> {
  const pattern = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
  return executor.transaction().execute(async (tx) => {
    await sql`set local statement_timeout = '1200ms'`.execute(tx);
    const corpus = sql`with destinations as (
      select 'space'::text as kind, s.id, s.display_name as "displayName",
        null::text as "objectKind", null::uuid as "parentId", null::text as "parentName", null::text as species,
        (select max(e.published_at) from journal_entries e where e.owner_user_id = ${scope.userId}::uuid and e.space_id=s.id and e.entry_scope='space' and e.lifecycle_state='active' and e.published_at is not null) as "lastPublished"
      from spaces s where s.owner_user_id=${scope.userId}::uuid
        and ${query.filter} in ('all','space') and (${query.q}='' or s.display_name ilike ${pattern})
      union all
      select 'object'::text, o.id, o.display_name, o.object_kind::text, s.id, s.display_name, c.canonical_name,
        (select max(e.published_at) from journal_entries e where e.owner_user_id=${scope.userId}::uuid and e.plant_object_id=o.id and e.entry_scope='object' and e.lifecycle_state='active' and e.published_at is not null)
      from plant_objects o join spaces s on s.id=o.space_id and s.owner_user_id=${scope.userId}::uuid
      left join catalog_items c on c.id=o.catalog_item_id
      where o.owner_user_id=${scope.userId}::uuid and ${query.filter} in ('all','object')
        and (${query.q}='' or o.display_name ilike ${pattern} or s.display_name ilike ${pattern}
          or c.canonical_name ilike ${pattern} or o.variety_text ilike ${pattern}
          or exists(select 1 from catalog_item_names n where n.catalog_item_id=o.catalog_item_id and n.display_name ilike ${pattern}))
    )`;
    const rows = (
      await sql<Row>`${corpus} select * from destinations
      ${query.cursor ? sql`where kind < ${query.cursor.kind} or (kind = ${query.cursor.kind} and id > ${query.cursor.id}::uuid)` : sql``}
      order by kind desc, id limit ${DESTINATION_PAGE_SIZE + 1}`.execute(tx)
    ).rows;
    const recent =
      query.q || query.cursor
        ? []
        : (
            await sql<Row>`${corpus} select * from destinations where "lastPublished" is not null order by "lastPublished" desc, kind, id limit 5`.execute(
              tx,
            )
          ).rows;
    const items = rows.slice(0, DESTINATION_PAGE_SIZE);
    const last = items.at(-1);
    return {
      items: items.map(destination),
      recent: recent.map(destination),
      nextCursor:
        rows.length > DESTINATION_PAGE_SIZE && last
          ? Buffer.from(
              JSON.stringify({
                q: query.q,
                filter: query.filter,
                kind: last.kind,
                id: last.id,
              } satisfies Cursor),
            ).toString("base64url")
          : null,
    };
  });
}
