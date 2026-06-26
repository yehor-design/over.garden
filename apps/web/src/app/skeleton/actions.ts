"use server";

import { revalidatePath } from "next/cache";

import { createJournalEntry } from "@/server/journal-repository";
import { enqueueJob } from "@/server/queue";
import { requireCurrentUserId } from "@/server/auth-session";
import { scopedToUser } from "@/server/request-scope";

export async function createSkeletonJournalEntry(formData: FormData) {
  const userId = await requireCurrentUserId();
  const scope = scopedToUser(userId);
  const body = String(formData.get("body") ?? "");
  const visibility = formData.get("visibility") === "public" ? "public" : "private";
  const clientMutationId = String(
    formData.get("clientMutationId") || crypto.randomUUID(),
  );

  const entry = await createJournalEntry(scope, {
    body,
    visibility,
    clientMutationId,
  });

  if (entry.visibility === "public") {
    await enqueueJob(
      "matching",
      {
        kind: "journal_entry_index",
        journalEntryId: entry.id,
        userId: scope.userId,
      },
      { idempotencyKey: `journal_entry_index:${entry.id}` },
    );
  }

  revalidatePath("/skeleton");
}
