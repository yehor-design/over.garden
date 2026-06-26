import "server-only";

import { db } from "@/db";
import type { EntryVisibility, JournalEntry } from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";

const MAX_BODY_LENGTH = 2000;
const MAX_RECENT_ENTRIES = 20;

export interface CreateJournalEntryInput {
  body: string;
  visibility: EntryVisibility;
  clientMutationId: string;
}

export async function createJournalEntry(
  scope: RequestScope,
  input: CreateJournalEntryInput,
): Promise<JournalEntry> {
  const body = normalizeBody(input.body);
  const now = new Date();

  return db
    .insertInto("journal_entries")
    .values({
      user_id: scope.userId,
      body,
      visibility: input.visibility,
      client_mutation_id: input.clientMutationId,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(["user_id", "client_mutation_id"]).doUpdateSet({
        body,
        visibility: input.visibility,
        updated_at: now,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listMyRecentJournalEntries(
  scope: RequestScope,
  limit = 10,
): Promise<JournalEntry[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_RECENT_ENTRIES);

  return db
    .selectFrom("journal_entries")
    .selectAll()
    .where("user_id", "=", scope.userId)
    .orderBy("created_at", "desc")
    .limit(boundedLimit)
    .execute();
}

function normalizeBody(body: string) {
  const normalized = body.trim();
  if (!normalized) throw new Error("Journal entry body is required.");
  if (normalized.length > MAX_BODY_LENGTH) {
    throw new Error(`Journal entry body must be ${MAX_BODY_LENGTH} characters or less.`);
  }
  return normalized;
}
