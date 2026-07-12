import "server-only";

import type { Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type { Database, EntryScope } from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

interface OwnerJournalEntryControlRow {
  entryId: string;
  entryScope: EntryScope;
  plantObjectId: string | null;
  spaceId: string;
}

export interface OwnerJournalEntryControl {
  entryId: string;
  managePath: string;
}

export async function getOwnerJournalEntryControl(
  scope: RequestScope,
  publicSlug: string,
  executor: QueryExecutor = db,
): Promise<OwnerJournalEntryControl | null> {
  const slug = publicSlug.trim();
  if (!slug) return null;

  const row = await buildOwnerJournalEntryControlQuery(
    executor,
    scope,
    slug,
  ).executeTakeFirst();

  return row
    ? serializeOwnerJournalEntryControl({
        ...row,
        entryScope: row.entryScope as EntryScope,
      })
    : null;
}

export function buildOwnerJournalEntryControlQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  publicSlug: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select([
      "journal_entries.id as entryId",
      "journal_entries.entry_scope as entryScope",
      "journal_entries.plant_object_id as plantObjectId",
      "journal_entries.space_id as spaceId",
    ])
    .where("journal_entries.public_slug", "=", publicSlug)
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null);
}

export function serializeOwnerJournalEntryControl(
  row: OwnerJournalEntryControlRow,
): OwnerJournalEntryControl {
  const entryId = encodeURIComponent(row.entryId);
  const managePath =
    row.entryScope === "object" && row.plantObjectId
      ? `/garden/objects/${encodeURIComponent(row.plantObjectId)}#passport-entry-${entryId}`
      : `/garden#space-entry-${entryId}`;

  return {
    entryId: row.entryId,
    managePath,
  };
}
