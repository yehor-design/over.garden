"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { EntryScope, LocationVisibility, VarietyState } from "@/db/schema";
import {
  isBackdatedEntryDate,
  recordAnalyticsEventSafely,
  recordEntryLoggedEventSafely,
} from "@/server/analytics-events";
import {
  AuthenticationRequiredError,
  requireCurrentRequestScope,
  requireCurrentUserId,
} from "@/server/auth-session";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { createAuthIntentToken } from "@/server/auth-intent-token";
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
import {
  createLineageInvitation,
  createProvenanceEdge,
} from "@/server/lineage-repository";
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

export async function createProvenanceEdgeAction(formData: FormData) {
  const scope = await requireWriteEligibleRequestScope();
  const result = await createProvenanceEdge(scope, {
    subjectPlantObjectId: String(formData.get("objectId") ?? ""),
    sourceKind: String(formData.get("sourceKind") ?? ""),
    sourcePlantObjectId: String(formData.get("sourcePlantObjectId") ?? ""),
    sourceReferenceKind: String(formData.get("sourceReferenceKind") ?? ""),
    sourceReferenceLabel: String(formData.get("sourceReferenceLabel") ?? ""),
    clientMutationId: String(formData.get("clientMutationId") ?? ""),
  });

  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${result.subjectObject.id}`);
  if (result.sourceObject) {
    revalidatePath(`/garden/objects/${result.sourceObject.id}`);
  }
}

export async function createLineageInvitationAction(formData: FormData) {
  const scope = await requireWriteEligibleRequestScope();
  const result = await createLineageInvitation(scope, {
    subjectPlantObjectId: String(formData.get("objectId") ?? ""),
    pendingSourceLabel: String(formData.get("pendingSourceLabel") ?? ""),
    clientMutationId: String(formData.get("clientMutationId") ?? ""),
  });

  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${result.subjectObject.id}`);
}

export async function publishJournalEntryAction(formData: FormData) {
  const entryId = String(formData.get("entryId") ?? "");
  const objectId = String(formData.get("objectId") ?? "");
  const userId = await requireUserForPublishIntent({ entryId, objectId });
  const scope = scopedToUser(userId);
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

async function requireUserForPublishIntent({
  entryId,
  objectId,
}: {
  entryId: string;
  objectId: string;
}) {
  try {
    return await requireCurrentUserId();
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    if (!UUID_PATTERN.test(entryId)) {
      throw new Error(
        "A valid journal entry is required to resume publishing.",
      );
    }

    const returnTo = UUID_PATTERN.test(objectId)
      ? `/garden/objects/${objectId}`
      : "/garden";
    const control = createAuthIntentControlRef("publish", entryId);
    const token = createAuthIntentToken({
      action: "publish",
      returnTo,
      control,
    });

    redirect(`/auth/intent?intent=${encodeURIComponent(token)}`);
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
