import "server-only";

import { sql, type Kysely } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import type { ClaimedOwnedPhoto } from "@/server/media/owned-photo-handoff";
import {
  takeBackOwnedPhotos,
  writeOwnedPhoto,
} from "@/server/owned-photo-repository";
import type { RequestScope } from "@/server/request-scope";

export type ObjectPhotoChangeResult =
  | { status: "saved" }
  | { status: "missing" };

/**
 * Give a plant or an animal its photo, replacing the one it had, or take it
 * away (`photo: null`), from the object's settings (OVE-524, ADR-0036 D1).
 * The photo is the passport's cover at once; without one the cover is the
 * first entry photo again. Replacing or removing queues the old photo's
 * stored files for revocation in the same transaction. The object row is
 * locked first, so an erasure in the meantime either commits before (and
 * this finds it missing) or waits.
 */
export async function changeObjectPhoto(
  scope: RequestScope,
  input: { objectId: string; photo: ClaimedOwnedPhoto | null },
  executor: Kysely<Database> = db,
): Promise<ObjectPhotoChangeResult> {
  return executor.transaction().execute(async (tx) => {
    await sql`set local statement_timeout = '4000ms'`.execute(tx);
    const locked = await sql<{ id: string }>`
      select id from plant_objects
      where id = ${input.objectId}::uuid and owner_user_id = ${scope.userId}::uuid
      for update
    `.execute(tx);
    if (!locked.rows[0]) return { status: "missing" };
    const owner = { kind: "object" as const, id: input.objectId };
    if (input.photo) {
      await writeOwnedPhoto(tx, {
        ownerUserId: scope.userId,
        owner,
        photo: input.photo,
      });
    } else {
      await takeBackOwnedPhotos(tx, { ownerUserId: scope.userId, owner });
    }
    await sql`update plant_objects set updated_at = now() where id = ${input.objectId}::uuid`.execute(
      tx,
    );
    return { status: "saved" };
  });
}
