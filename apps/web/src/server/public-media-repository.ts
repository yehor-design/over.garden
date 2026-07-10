import "server-only";

import type { Kysely, Transaction } from "kysely";

import type { Database } from "@/db/schema";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export function buildFirstProcessedMediaPerEntryQuery(executor: QueryExecutor) {
  return executor
    .selectFrom("media_assets")
    .distinctOn(["media_assets.journal_entry_id", "media_assets.owner_user_id"])
    .select([
      "media_assets.id as mediaId",
      "media_assets.journal_entry_id as journalEntryId",
      "media_assets.owner_user_id as ownerUserId",
      "media_assets.derivative_key as derivativeKey",
    ])
    .where("media_assets.journal_entry_id", "is not", null)
    .where("media_assets.status", "=", "processed")
    .where("media_assets.derivative_key", "is not", null)
    .orderBy("media_assets.journal_entry_id", "asc")
    .orderBy("media_assets.owner_user_id", "asc")
    .orderBy("media_assets.created_at", "asc")
    .orderBy("media_assets.id", "asc")
    .$narrowType<{ journalEntryId: string; derivativeKey: string }>()
    .as("first_public_media");
}
