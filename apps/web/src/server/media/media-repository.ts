import "server-only";

import { db } from "@/db";
import type { MediaAsset } from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";

export async function createQuarantinedMediaAsset(
  scope: RequestScope,
  quarantineKey: string,
  journalEntryId?: string,
): Promise<MediaAsset> {
  return db
    .insertInto("media_assets")
    .values({
      owner_user_id: scope.userId,
      quarantine_key: quarantineKey,
      journal_entry_id: journalEntryId ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function getMediaAssetForOwner(
  scope: RequestScope,
  id: string,
): Promise<MediaAsset> {
  return db
    .selectFrom("media_assets")
    .selectAll()
    .where("id", "=", id)
    .where("owner_user_id", "=", scope.userId)
    .executeTakeFirstOrThrow();
}

export async function markMediaAssetProcessed(
  scope: RequestScope,
  id: string,
  derivativeKey: string,
): Promise<MediaAsset> {
  return db
    .updateTable("media_assets")
    .set({
      derivative_key: derivativeKey,
      status: "processed",
      original_deleted_at: new Date(),
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .where("owner_user_id", "=", scope.userId)
    .returningAll()
    .executeTakeFirstOrThrow();
}
