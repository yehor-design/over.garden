import "server-only";
import { sql, type Kysely } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import type {
  CreatedSpace,
  SpaceLocationVisibility,
  SpaceSetupInput,
} from "@/lib/garden/space-setup";
import type { ClaimedOwnedPhoto } from "@/server/media/owned-photo-handoff";
import { writeOwnedPhoto } from "@/server/owned-photo-repository";
import type { RequestScope } from "@/server/request-scope";

export type CreateOwnedSpaceResult =
  | { status: "created"; space: CreatedSpace; replayed: boolean }
  | { status: "duplicate_name"; existing: CreatedSpace }
  | { status: "conflict" };

interface SpaceRow {
  id: string;
  display_name: string;
  location_visibility: string;
  coarse_region_code: string | null;
  owner_user_id: string;
}

function toCreatedSpace(row: SpaceRow): CreatedSpace {
  return {
    id: row.id,
    displayName: row.display_name,
    locationVisibility: row.location_visibility as SpaceLocationVisibility,
    coarseRegionCode: row.coarse_region_code,
  };
}

/**
 * Create one empty space for the signed-in gardener (`OVE-484`).
 *
 * The request id is the space id, so the same intent submitted twice — a
 * double press or a retry after a lost response — reads back the first space
 * rather than writing a second. An id that belongs to somebody else is a
 * conflict and reveals nothing about that space.
 *
 * The same-name check and the insert run under one per-owner advisory lock, so
 * two tabs cannot both pass the check. A gardener may still keep two spaces of
 * one name — the check asks, it does not forbid — because the product already
 * holds such pairs and a name is not an identity.
 */
export async function createOwnedSpace(
  scope: RequestScope,
  input: SpaceSetupInput,
  executor: Kysely<Database> = db,
  options: {
    /** The claimed photo the stepper chose (ADR-0036 D1), written with the space. */
    photo?: ClaimedOwnedPhoto | null;
  } = {},
): Promise<CreateOwnedSpaceResult> {
  return executor.transaction().execute(async (tx) => {
    await sql`set local statement_timeout = '3000ms'`.execute(tx);
    await sql`select pg_advisory_xact_lock(hashtextextended(${`space-setup:${scope.userId}`}, 0))`.execute(
      tx,
    );

    const prior = await tx
      .selectFrom("spaces")
      .select([
        "id",
        "display_name",
        "location_visibility",
        "coarse_region_code",
        "owner_user_id",
      ])
      .where("id", "=", input.requestId)
      .executeTakeFirst();
    if (prior) {
      return prior.owner_user_id === scope.userId
        ? {
            status: "created",
            space: toCreatedSpace(prior as SpaceRow),
            replayed: true,
          }
        : { status: "conflict" };
    }

    if (!input.allowDuplicateName) {
      const sameName = await tx
        .selectFrom("spaces")
        .select([
          "id",
          "display_name",
          "location_visibility",
          "coarse_region_code",
          "owner_user_id",
        ])
        .where("owner_user_id", "=", scope.userId)
        .where(
          sql<string>`lower(display_name)`,
          "=",
          input.displayName.toLocaleLowerCase(),
        )
        .orderBy("created_at", "asc")
        .limit(1)
        .executeTakeFirst();
      if (sameName) {
        return {
          status: "duplicate_name",
          existing: toCreatedSpace(sameName as SpaceRow),
        };
      }
    }

    const created = await tx
      .insertInto("spaces")
      .values({
        id: input.requestId,
        owner_user_id: scope.userId,
        display_name: input.displayName,
        location_visibility: input.locationVisibility,
        coarse_region_code: input.coarseRegionCode,
      })
      .returning([
        "id",
        "display_name",
        "location_visibility",
        "coarse_region_code",
        "owner_user_id",
      ])
      .executeTakeFirstOrThrow();
    if (options.photo) {
      await writeOwnedPhoto(tx, {
        ownerUserId: scope.userId,
        owner: { kind: "space", id: created.id },
        photo: options.photo,
      });
    }
    return {
      status: "created",
      space: toCreatedSpace(created as SpaceRow),
      replayed: false,
    };
  });
}

/** The gardener's own space with this id, if it exists: the replay check before a claim. */
export async function readOwnedSpaceForReplay(
  scope: RequestScope,
  spaceId: string,
  executor: Kysely<Database> = db,
): Promise<CreatedSpace | "conflict" | null> {
  const row = await executor
    .selectFrom("spaces")
    .select(["id", "display_name", "location_visibility", "coarse_region_code", "owner_user_id"])
    .where("id", "=", spaceId)
    .executeTakeFirst();
  if (!row) return null;
  return row.owner_user_id === scope.userId ? toCreatedSpace(row as SpaceRow) : "conflict";
}

/**
 * The gardener's oldest space with this name, compared without case — the
 * same-name question asked before a photo is claimed, so a gardener who then
 * chooses the existing space leaves the staged photo unclaimed.
 */
export async function findOwnedSpaceByName(
  scope: RequestScope,
  displayName: string,
  executor: Kysely<Database> = db,
): Promise<CreatedSpace | null> {
  const row = await executor
    .selectFrom("spaces")
    .select(["id", "display_name", "location_visibility", "coarse_region_code", "owner_user_id"])
    .where("owner_user_id", "=", scope.userId)
    .where(sql<string>`lower(display_name)`, "=", displayName.toLocaleLowerCase())
    .orderBy("created_at", "asc")
    .limit(1)
    .executeTakeFirst();
  return row ? toCreatedSpace(row as SpaceRow) : null;
}

