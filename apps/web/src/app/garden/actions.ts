"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type {
  EntryScope,
  LocationVisibility,
} from "@/db/schema";
import { buildSaveProgressReadbackUrl } from "@/lib/garden/save-progress-moment";
import type { DocumentMutationActionStateV1 } from "@/lib/auth/document-mutation-generation-transport";
import {
  isBackdatedEntryDate,
  recordAnalyticsEventSafely,
  recordEntryLoggedEventSafely,
} from "@/server/analytics-events";
import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
import { scheduleLearningAttributionDrain } from "@/server/mvp-learning/attribution-after-response";
import {
  createSpaceJournalEntry,
  type SpaceJournalEntryResult,
} from "@/server/journal-repository";

export async function createSpaceJournalEntryAction(
  formData: FormData,
): Promise<DocumentMutationActionStateV1 | undefined> {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  const result = await createSpaceJournalEntry(scope, {
    spaceId: String(formData.get("spaceId") ?? ""),
    mentionedPlantObjectIds: formData
      .getAll("mentionedPlantObjectIds")
      .map((value) => String(value)),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    entryDate: String(formData.get("entryDate") ?? ""),
    clientMutationId: String(formData.get("clientMutationId") ?? ""),
    topicTags: String(formData.get("topicTags") ?? ""),
  });

  if (result.isNewEntry) {
    scheduleLearningAttributionDrain(async () => {
      await recordSpaceJournalEntryEvents(scope, result);
    });
  }

  revalidatePath("/garden");
  for (const object of result.mentionedObjects) {
    revalidatePath(`/garden/objects/${object.id}`);
  }

  if (result.isNewEntry) {
    redirect(buildSaveProgressReadbackUrl("/garden", "space-entry"));
  }
}

async function recordSpaceJournalEntryEvents(
  scope: import("@/server/request-scope").RequestScope,
  result: SpaceJournalEntryResult,
) {
  if (!result.isNewEntry) return;

  const properties = {
    entry_scope: result.entry.entry_scope as EntryScope,
    has_photo: false,
    is_backdated: isBackdatedEntryDate(result.entry.entry_date),
    location_visibility_level: result.space
      .location_visibility as LocationVisibility,
  };
  const eventTarget = {
    spaceId: result.space.id,
    journalEntryId: result.entry.id,
  };

  await recordEntryLoggedEventSafely(scope, {
    properties,
    ...eventTarget,
  });
  await recordAnalyticsEventSafely(scope, {
    eventName: "progress_screen_shown",
    properties,
    ...eventTarget,
  });
}
