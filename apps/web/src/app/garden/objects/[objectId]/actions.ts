"use server";

import { revalidatePath } from "next/cache";

import type { DocumentMutationActionStateV1 } from "@/lib/auth/document-mutation-generation-transport";
import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
import {
  archiveJournalEntry,
  resolvePlantObjectCatalog,
  updatePlantObjectLocation,
} from "@/server/journal-repository";
import {
  createLineageInvitation,
  createProvenanceEdge,
} from "@/server/lineage-repository";
import { convergePublicProjectionsNow } from "@/server/search/public-projection-outbox";

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
