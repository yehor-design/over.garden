"use server";

import { revalidatePath } from "next/cache";

import type { DocumentMutationActionStateV1 } from "@/lib/auth/document-mutation-generation-transport";
import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
import {
  deleteJournalEntry,
  resolvePlantObjectCatalog,
  updatePlantObjectLocation,
} from "@/server/journal-repository";
import {
  createLineageInvitation,
  createProvenanceEdge,
} from "@/server/lineage-repository";

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

export async function deleteJournalEntryAction(
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
  const deleteAccepted = formData.get("deleteAccepted") === "on";

  if (!deleteAccepted) {
    throw new Error("Deletion confirmation is required.");
  }

  const result = await deleteJournalEntry(scope, { entryId });

  // The canonical deletion transaction writes the durable search-removal
  // intent and media revocation jobs. Do not make the user's destructive
  // action wait for external providers; retryable workers prove convergence.

  revalidatePath("/garden");
  if (objectId) revalidatePath(`/garden/objects/${objectId}`);
  if (result.publicUrl) revalidatePath(result.publicUrl);
}
