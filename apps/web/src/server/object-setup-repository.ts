import "server-only";
import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, PlantObjectKind, VarietyState } from "@/db/schema";
import type {
  CreatedObject,
  ObjectSetupInput,
} from "@/lib/garden/object-setup";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { findStandardSpecies } from "@/server/catalog-repository";
import type { ClaimedOwnedPhoto } from "@/server/media/owned-photo-handoff";
import { writeOwnedPhoto } from "@/server/owned-photo-repository";
import type { RequestScope } from "@/server/request-scope";
import {
  findOrCreateSpeciesForm,
  findSpeciesForm,
} from "@/server/species-forms-repository";

export type CreateOwnedObjectResult =
  | { status: "created"; object: CreatedObject; replayed: boolean }
  | { status: "duplicate_name"; existing: CreatedObject }
  | { status: "space_unavailable" }
  | { status: "identity_unavailable" }
  | { status: "conflict" };

/** The object's catalogue columns for the two choices (migration 0086). */
interface ObjectIdentityColumns {
  catalog_item_id: string | null;
  variety_state: VarietyState;
  variety_text: string | null;
  species_text: string | null;
}

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
 * the species and the cultivar or breed stored as the gardener chose them
 * (`OVE-524`, migration 0086) and the photo the stepper staged as its own;
 * the location privacy is the space's.
 *
 *   * A species comes from the standard base, for the object's kind, and is
 *     re-read here: a stale pick is `identity_unavailable`, never a guess.
 *   * A cultivar or breed from the list must be an active form of that
 *     species; a new name finds the species' entry with the same key or
 *     becomes a shared entry (`findOrCreateSpeciesForm`).
 *   * The object points at the most specific node chosen — the entry, else
 *     the species — as every reader of its organism expects. Own texts stay
 *     on the object and are private.
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
  options: { photo?: ClaimedOwnedPhoto | null; locale?: InterfaceLocale } = {},
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

    const identity = await resolveObjectIdentity(tx, {
      input,
      userId: scope.userId,
      locale: options.locale ?? "uk",
    });
    if (!identity) return { status: "identity_unavailable" };

    await tx
      .insertInto("plant_objects")
      .values({
        id: input.requestId,
        owner_user_id: scope.userId,
        space_id: space.id,
        display_name: input.displayName,
        object_kind: input.objectKind,
        ...identity,
        location_visibility: space.location_visibility,
        coarse_region_code: space.coarse_region_code,
      })
      .execute();

    if (options.photo) {
      await writeOwnedPhoto(tx, {
        ownerUserId: scope.userId,
        owner: { kind: "object", id: input.requestId },
        photo: options.photo,
      });
    }

    const created = await readObject(tx, input.requestId);
    if (!created) throw new Error("The created object could not be read back.");
    return {
      status: "created",
      object: toCreatedObject(created),
      replayed: false,
    };
  });
}

/**
 * The catalogue columns for the two choices, or null when a chosen species or
 * entry is not selectable. `variety_text` keeps the chosen node's name beside
 * the link, as every `selected` object has.
 */
async function resolveObjectIdentity(
  tx: Transaction<Database>,
  input: { input: ObjectSetupInput; userId: string; locale: InterfaceLocale },
): Promise<ObjectIdentityColumns | null> {
  const { species, cultivar, objectKind } = input.input;
  if (species.kind === "unknown") {
    return {
      catalog_item_id: null,
      variety_state: "unknown",
      variety_text: null,
      species_text: null,
    };
  }
  if (species.kind === "own") {
    return {
      catalog_item_id: null,
      variety_state: cultivar.kind === "own" ? "own" : "unknown",
      variety_text: cultivar.kind === "own" ? cultivar.text : null,
      species_text: species.text,
    };
  }
  const standard = await findStandardSpecies(
    tx,
    species.catalogItemId,
    objectKind,
  );
  if (!standard) return null;
  let node: { id: string; canonicalName: string } = standard;
  if (cultivar.kind === "entry") {
    const form = await findSpeciesForm(tx, {
      speciesId: standard.id,
      formId: cultivar.catalogItemId,
      objectKind,
    });
    if (!form) return null;
    node = form;
  } else if (cultivar.kind === "new") {
    node = await findOrCreateSpeciesForm(tx, {
      species: standard,
      objectKind,
      name: cultivar.name,
      locale: input.locale,
      userId: input.userId,
    });
  }
  return {
    catalog_item_id: node.id,
    variety_state: "selected",
    variety_text: node.canonicalName,
    species_text: null,
  };
}

/**
 * Whether the chosen species and list entry are selectable, read before a
 * photo is claimed so a stale pick does not spend the staged photo. The
 * write re-reads both in its own transaction.
 */
export async function isObjectIdentitySelectable(
  input: Pick<ObjectSetupInput, "species" | "cultivar" | "objectKind">,
  executor: Kysely<Database> = db,
): Promise<boolean> {
  if (input.species.kind !== "catalog") return true;
  const standard = await findStandardSpecies(
    executor,
    input.species.catalogItemId,
    input.objectKind,
  );
  if (!standard) return false;
  if (input.cultivar.kind !== "entry") return true;
  return (
    (await findSpeciesForm(executor, {
      speciesId: standard.id,
      formId: input.cultivar.catalogItemId,
      objectKind: input.objectKind,
    })) !== null
  );
}

/**
 * What a retried intent reads back before a photo is claimed: the object this
 * request id already created, "conflict" when somebody else holds the id, or
 * null for a first attempt.
 */
export async function readOwnedObjectForReplay(
  scope: RequestScope,
  objectId: string,
  executor: Kysely<Database> = db,
): Promise<CreatedObject | "conflict" | null> {
  const row = await readObject(executor, objectId);
  if (!row) return null;
  return row.owner_user_id === scope.userId ? toCreatedObject(row) : "conflict";
}

/**
 * The gardener's oldest object with this name in this space, compared without
 * case — the same-name question asked before a photo is claimed, so a
 * gardener who then keeps the existing one leaves the staged photo unclaimed.
 */
export async function findOwnedObjectByName(
  scope: RequestScope,
  input: { spaceId: string; displayName: string },
  executor: Kysely<Database> = db,
): Promise<CreatedObject | null> {
  const row = await executor
    .selectFrom("plant_objects")
    .select("id")
    .where("owner_user_id", "=", scope.userId)
    .where("space_id", "=", input.spaceId)
    .where(
      sql<string>`lower(display_name)`,
      "=",
      input.displayName.toLocaleLowerCase(),
    )
    .orderBy("created_at", "asc")
    .limit(1)
    .executeTakeFirst();
  if (!row) return null;
  const existing = await readObject(executor, row.id);
  return existing ? toCreatedObject(existing) : null;
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
