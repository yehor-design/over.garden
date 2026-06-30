"use server";

import { revalidatePath } from "next/cache";

import type { EntryScope, LocationVisibility, VarietyState } from "@/db/schema";
import {
  isBackdatedEntryDate,
  recordAnalyticsEventSafely,
  recordEntryLoggedEventSafely,
} from "@/server/analytics-events";
import {
  requireCurrentRequestScope,
  requireCurrentUserId,
} from "@/server/auth-session";
import {
  archiveJournalEntry,
  type ArchiveJournalEntryResult,
  createPlantObjectJournalEntry,
  publishJournalEntry,
  type PlantObjectJournalEntryResult,
  type PublishJournalEntryResult,
  resolvePlantObjectCatalog,
  updatePlantObjectLocation,
} from "@/server/journal-repository";
import { requireWriteEligibleRequestScope } from "@/server/pilot-write-access";
import { enqueueJob } from "@/server/queue";
import { scopedToUser } from "@/server/request-scope";

export async function createPlantObjectJournalEntryAction(formData: FormData) {
  const scope = await requireWriteEligibleRequestScope();
  const objectId = String(formData.get("objectId") ?? "");
  const result = await createPlantObjectJournalEntry(scope, {
    plantObjectId: objectId,
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    entryDate: String(formData.get("entryDate") ?? ""),
    clientMutationId: String(formData.get("clientMutationId") ?? ""),
    mediaAssetId: String(formData.get("mediaAssetId") ?? ""),
  });

  await recordPlantObjectJournalEntryEvents(scope, result);

  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${result.plantObject.id}`);
}

export async function resolvePlantObjectCatalogAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  const result = await resolvePlantObjectCatalog(scope, {
    plantObjectId: String(formData.get("objectId") ?? ""),
    catalogItemId: String(formData.get("catalogItemId") ?? ""),
  });

  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${result.plantObject.id}`);
  for (const publicEntryPath of result.publicEntryPaths) {
    revalidatePath(publicEntryPath);
  }
}

export async function updatePlantObjectLocationAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  const result = await updatePlantObjectLocation(scope, {
    plantObjectId: String(formData.get("objectId") ?? ""),
    locationVisibility: String(formData.get("locationVisibility") ?? ""),
    coarseRegionCode: String(formData.get("coarseRegionCode") ?? ""),
  });

  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${result.plantObject.id}`);
  for (const publicEntryPath of result.publicEntryPaths) {
    revalidatePath(publicEntryPath);
  }
}

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

export async function archiveJournalEntryAction(formData: FormData) {
  const userId = await requireCurrentUserId();
  const scope = scopedToUser(userId);
  const entryId = String(formData.get("entryId") ?? "");
  const objectId = String(formData.get("objectId") ?? "");
  const archiveAccepted = formData.get("archiveAccepted") === "on";

  if (!archiveAccepted) {
    throw new Error("Archive confirmation is required.");
  }

  const result = await archiveJournalEntry(scope, { entryId });

  await enqueueArchivedEntryRemovalJob(result, scope.userId);

  revalidatePath("/garden");
  if (objectId) revalidatePath(`/garden/objects/${objectId}`);
  if (result.publicUrl) revalidatePath(result.publicUrl);
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

async function enqueueArchivedEntryRemovalJob(
  result: ArchiveJournalEntryResult,
  userId: string,
) {
  if (!result.publicGone) return;

  await enqueueJob(
    "matching",
    {
      kind: "journal_entry_unindex",
      journalEntryId: result.entry.id,
      userId,
    },
    { idempotencyKey: `journal_entry_unindex:${result.entry.id}` },
  );
}

async function recordPlantObjectJournalEntryEvents(
  scope: Awaited<ReturnType<typeof requireCurrentRequestScope>>,
  result: PlantObjectJournalEntryResult,
) {
  if (!result.isNewEntry) return;

  const properties = {
    entry_scope: result.entry.entry_scope as EntryScope,
    has_photo: result.mediaAttached,
    is_backdated: isBackdatedEntryDate(result.entry.entry_date),
    location_visibility_level: result.plantObject
      .location_visibility as LocationVisibility,
    object_kind: result.plantObject.object_kind,
    sync_status: "online" as const,
    variety_state: result.plantObject.variety_state as VarietyState,
  };
  const eventTarget = {
    spaceId: result.space.id,
    plantObjectId: result.plantObject.id,
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
