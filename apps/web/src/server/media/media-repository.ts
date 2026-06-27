import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, MediaAsset } from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export async function createQuarantinedMediaAsset(
  scope: RequestScope,
  quarantineKey: string,
): Promise<MediaAsset> {
  return db
    .insertInto("media_assets")
    .values({
      owner_user_id: scope.userId,
      quarantine_key: quarantineKey,
      journal_entry_id: null,
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

export async function markMediaAssetFailed(
  scope: RequestScope,
  id: string,
): Promise<MediaAsset> {
  return db
    .updateTable("media_assets")
    .set({
      status: "failed",
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .where("owner_user_id", "=", scope.userId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function attachProcessedMediaAssetToEntry(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    mediaAssetId: string;
    journalEntryId: string;
  },
): Promise<MediaAsset | undefined> {
  return buildAttachProcessedMediaAssetToEntryQuery(
    executor,
    scope,
    input,
  ).executeTakeFirst();
}

export function buildAttachProcessedMediaAssetToEntryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  {
    mediaAssetId,
    journalEntryId,
  }: {
    mediaAssetId: string;
    journalEntryId: string;
  },
) {
  return executor
    .updateTable("media_assets")
    .set({
      journal_entry_id: journalEntryId,
      updated_at: new Date(),
    })
    .where("id", "=", mediaAssetId)
    .where("owner_user_id", "=", scope.userId)
    .where("status", "=", "processed")
    .where((eb) =>
      eb.or([
        eb("journal_entry_id", "is", null),
        eb("journal_entry_id", "=", journalEntryId),
      ]),
    )
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("journal_entries")
          .select(sql`1`.as("one"))
          .where("journal_entries.id", "=", journalEntryId)
          .where("journal_entries.owner_user_id", "=", scope.userId),
      ),
    )
    .returningAll();
}
