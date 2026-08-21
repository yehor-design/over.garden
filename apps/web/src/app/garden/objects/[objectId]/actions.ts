"use server";

import { revalidatePath } from "next/cache";

import type { EntryScope, LocationVisibility, VarietyState } from "@/db/schema";
import type { DocumentMutationActionStateV1 } from "@/lib/auth/document-mutation-generation-transport";
import {
  isBackdatedEntryDate,
  recordAnalyticsEventSafely,
  recordEntryLoggedEventSafely,
} from "@/server/analytics-events";
import { requireCurrentRequestScope } from "@/server/auth-session";
import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
import {
  archiveJournalEntry,
  createPlantObjectJournalEntry,
  publishJournalEntry,
  type PlantObjectJournalEntryResult,
  resolvePlantObjectCatalog,
  updatePlantObjectLocation,
} from "@/server/journal-repository";
import {
  createLineageInvitation,
  createProvenanceEdge,
} from "@/server/lineage-repository";
import { scheduleLearningAttributionDrain } from "@/server/mvp-learning/attribution-after-response";
import { convergePublicProjectionsNow } from "@/server/search/public-projection-outbox";

export async function createPlantObjectJournalEntryAction(
  formData: FormData,
): Promise<DocumentMutationActionStateV1 | undefined> {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  const objectId = String(formData.get("objectId") ?? "");
  const result = await createPlantObjectJournalEntry(scope, {
    plantObjectId: objectId,
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    entryDate: String(formData.get("entryDate") ?? ""),
    clientMutationId: String(formData.get("clientMutationId") ?? ""),
    mediaAssetId: String(formData.get("mediaAssetId") ?? ""),
  });

  if (result.isNewEntry) {
    scheduleLearningAttributionDrain(async () => {
      await recordPlantObjectJournalEntryEvents(scope, result);
    });
  }

  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${result.plantObject.id}`);
}

export async function resolvePlantObjectCatalogAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
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
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
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
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
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
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  const result = await createLineageInvitation(scope, {
    subjectPlantObjectId: String(formData.get("objectId") ?? ""),
    pendingSourceLabel: String(formData.get("pendingSourceLabel") ?? ""),
    clientMutationId: String(formData.get("clientMutationId") ?? ""),
  });

  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${result.subjectObject.id}`);
}

export async function publishJournalEntryAction(
  formData: FormData,
): Promise<DocumentMutationActionStateV1 | undefined> {
  const entryId = String(formData.get("entryId") ?? "");
  const objectId = String(formData.get("objectId") ?? "");
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  const disclosureAccepted =
    formData.get("publicationDisclosureAccepted") === "on";

  const result = await publishJournalEntry(scope, {
    entryId,
    disclosureAccepted,
  });

  await convergePublicProjectionsNow([result.entry.id]).catch(() => undefined);

  revalidatePath("/garden");
  if (objectId) revalidatePath(`/garden/objects/${objectId}`);
  revalidatePath(result.publicUrl);
}

export async function archiveJournalEntryAction(
  formData: FormData,
): Promise<DocumentMutationActionStateV1 | undefined> {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  const entryId = String(formData.get("entryId") ?? "");
  const objectId = String(formData.get("objectId") ?? "");
  const archiveAccepted = formData.get("archiveAccepted") === "on";

  if (!archiveAccepted) {
    throw new Error("Archive confirmation is required.");
  }

  const result = await archiveJournalEntry(scope, { entryId });

  // OVE-242: the removal intent already committed with the archive. Converge
  // it now; the owner object page then reports the verified convergence state
  // from the durable outbox rather than claiming "a job was scheduled".
  await convergePublicProjectionsNow([result.entry.id]).catch(() => undefined);

  revalidatePath("/garden");
  if (objectId) revalidatePath(`/garden/objects/${objectId}`);
  if (result.publicUrl) revalidatePath(result.publicUrl);
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
