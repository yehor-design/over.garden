"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUserId } from "@/server/auth-session";
import {
  publishJournalEntry,
  type PublishJournalEntryResult,
} from "@/server/journal-repository";
import { enqueueJob } from "@/server/queue";
import { scopedToUser } from "@/server/request-scope";

export async function publishJournalEntryAction(formData: FormData) {
  const userId = await requireCurrentUserId();
  const scope = scopedToUser(userId);
  const entryId = String(formData.get("entryId") ?? "");
  const objectId = String(formData.get("objectId") ?? "");
  const disclosureAccepted =
    formData.get("publicationDisclosureAccepted") === "on";

  const result = await publishJournalEntry(scope, {
    entryId,
    disclosureAccepted,
  });

  await enqueuePublishedEntryIndexJob(result, scope.userId);

  revalidatePath("/garden");
  if (objectId) revalidatePath(`/garden/objects/${objectId}`);
  revalidatePath(result.publicUrl);
}

async function enqueuePublishedEntryIndexJob(
  result: PublishJournalEntryResult,
  userId: string,
) {
  await enqueueJob(
    "matching",
    {
      kind: "journal_entry_index",
      journalEntryId: result.entry.id,
      userId,
    },
    { idempotencyKey: `journal_entry_index:${result.entry.id}` },
  );
}
