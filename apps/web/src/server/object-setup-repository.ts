import "server-only";
import { sql, type Kysely } from "kysely";

import { db } from "@/db";
import type { Database, PlantObjectKind } from "@/db/schema";
import { resolveObjectKindForCatalogSelection } from "@/lib/garden/catalog-object-kind";
import type {
  CreatedObject,
  ObjectSetupInput,
} from "@/lib/garden/object-setup";
import { findSelectableCatalogItem } from "@/server/catalog-repository";
import type { RequestScope } from "@/server/request-scope";

export type CreateOwnedObjectResult =
  | { status: "created"; object: CreatedObject; replayed: boolean }
  | { status: "duplicate_name"; existing: CreatedObject }
  | { status: "space_unavailable" }
  | { status: "identity_unavailable" }
  | { status: "conflict" };

interface ObjectRow {
  id: string;
  display_name: string;
  object_kind: string;
  owner_user_id: string;
  space_id: string;
  space_name: string;
  catalog_item_id: string | null;
  catalog_name: string | null;
}

function toCreatedObject(row: ObjectRow): CreatedObject {
  return {
    id: row.id,
    displayName: row.display_name,
    objectKind: row.object_kind as PlantObjectKind,
    space: { id: row.space_id, displayName: row.space_name },
    catalog: row.catalog_item_id
      ? { id: row.catalog_item_id, canonicalName: row.catalog_name ?? "" }
      : null,
  };
}

function readObject(executor: Kysely<Database>, id: string) {
  return executor
    .selectFrom("plant_objects as o")
    .innerJoin("spaces as s", "s.id", "o.space_id")
    .leftJoin("catalog_items as c", "c.id", "o.catalog_item_id")
    .select([
      "o.id",
      "o.display_name",
      "o.object_kind",
      "o.owner_user_id",
      "o.space_id",
      "s.display_name as space_name",
      "o.catalog_item_id",
      "c.canonical_name as catalog_name",
    ])
    .where("o.id", "=", id)
    .executeTakeFirst() as Promise<ObjectRow | undefined>;
}

/**
 * Add one plant or animal to one of the gardener's spaces (`OVE-485`), with
 * the same identity rules the first-entry publication applies: a picked
 * organism is linked and named, an own label is kept as free text, nothing is
 * `unknown`; the location privacy is the space's.
 *
 * The request id is the object id: the same intent submitted twice reads back
 * the first object, and an id somebody else holds is a conflict that says
 * nothing about their object. The same-name check and the insert share one
 * per-owner lock. A same name *in another space* is not asked about — two
 * tomatoes in two beds is the ordinary case the destination picker is built
 * for.
 */
export async function createOwnedObject(
  scope: RequestScope,
  input: ObjectSetupInput,
  executor: Kysely<Database> = db,
): Promise<CreateOwnedObjectResult> {
  return executor.transaction().execute(async (tx) => {
    await sql`set local statement_timeout = '1500ms'`.execute(tx);
    await sql`select pg_advisory_xact_lock(hashtextextended(${`object-setup:${scope.userId}`}, 0))`.execute(
      tx,
    );

    const prior = await readObject(tx, input.requestId);
    if (prior) {
      return prior.owner_user_id === scope.userId
        ? { status: "created", object: toCreatedObject(prior), replayed: true }
        : { status: "conflict" };
    }

    const space = await tx
      .selectFrom("spaces")
      .select([
        "id",
        "display_name",
        "location_visibility",
        "coarse_region_code",
      ])
      .where("id", "=", input.spaceId)
      .where("owner_user_id", "=", scope.userId)
      .executeTakeFirst();
    if (!space) return { status: "space_unavailable" };

    const catalogItem = input.catalogItemId
      ? await findSelectableCatalogItem(tx, input.catalogItemId, {
          expectedObjectKind: input.objectKind,
        })
      : null;
    if (input.catalogItemId && !catalogItem) {
      return { status: "identity_unavailable" };
    }
    let objectKind: PlantObjectKind;
    try {
      objectKind = resolveObjectKindForCatalogSelection(
        input.objectKind,
        catalogItem?.catalogKind,
        catalogItem?.source,
      );
    } catch {
      return { status: "identity_unavailable" };
    }

    if (!input.allowDuplicateName) {
      const sameName = await tx
        .selectFrom("plant_objects")
        .select("id")
        .where("owner_user_id", "=", scope.userId)
        .where("space_id", "=", space.id)
        .where(
          sql<string>`lower(display_name)`,
          "=",
          input.displayName.toLocaleLowerCase(),
        )
        .orderBy("created_at", "asc")
        .limit(1)
        .executeTakeFirst();
      if (sameName) {
        const existing = await readObject(tx, sameName.id);
        if (existing) {
          return {
            status: "duplicate_name",
            existing: toCreatedObject(existing),
          };
        }
      }
    }

    await tx
      .insertInto("plant_objects")
      .values({
        id: input.requestId,
        owner_user_id: scope.userId,
        space_id: space.id,
        display_name: input.displayName,
        object_kind: objectKind,
        // ADR-0026 D6: the own name is a label on the object, never a card.
        catalog_item_id: catalogItem?.id ?? null,
        variety_text: catalogItem?.canonicalName ?? input.catalogLabel ?? null,
        variety_state: catalogItem
          ? "selected"
          : input.catalogLabel
            ? "free_text"
            : "unknown",
        location_visibility: space.location_visibility,
        coarse_region_code: space.coarse_region_code,
      })
      .execute();

    const created = await readObject(tx, input.requestId);
    if (!created) throw new Error("The created object could not be read back.");
    return {
      status: "created",
      object: toCreatedObject(created),
      replayed: false,
    };
  });
}

/** One of the gardener's spaces, for a flow the space setup handed back to. */
export async function readOwnedSpaceSummary(
  scope: RequestScope,
  spaceId: string,
  executor: Kysely<Database> = db,
) {
  return executor
    .selectFrom("spaces")
    .select(["id", "display_name as displayName"])
    .where("id", "=", spaceId)
    .where("owner_user_id", "=", scope.userId)
    .executeTakeFirst();
}
