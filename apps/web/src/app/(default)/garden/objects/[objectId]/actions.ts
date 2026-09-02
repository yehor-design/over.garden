"use server";

import { revalidatePath } from "next/cache";

import type { MutationScopeActionState } from "@/lib/auth/owner-scope-contract";
import {
  deleteJournalEntry,
  resolvePlantObjectCatalog,
  updatePlantObjectLocation,
} from "@/server/journal-repository";
import {
  createLineageInvitation,
  createProvenanceEdge,
} from "@/server/lineage-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { publicEntryChangeTags } from "@/lib/public-cache-tags";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

export async function resolvePlantObjectCatalogAction(formData: FormData) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
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
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
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
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
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
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
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

/**
 * OVE-353 owner deletion receipt. Deliberately carries no body, title, media
 * key, stable identity, or location field — only the state the owner UI needs
 * to announce what happened and the two timestamps that describe the technical
 * retention window.
 */
export interface DeleteJournalEntryActionStateV1 {
  status: "deleted" | "already_deleted" | "acknowledgement_required";
  deletedAt: string;
  purgeAfter: string;
}

export async function deleteJournalEntryAction(
  formData: FormData,
): Promise<
  MutationScopeActionState | DeleteJournalEntryActionStateV1 | undefined
> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const scope = admission.scope;
  const entryId = String(formData.get("entryId") ?? "");
  const objectId = String(formData.get("objectId") ?? "");
  const deleteAccepted = formData.get("deleteAccepted") === "on";

  // A missing acknowledgement is an ordinary finite state, not an exception:
  // the owner simply has not confirmed yet, and nothing has been mutated.
  if (!deleteAccepted) {
    return {
      status: "acknowledgement_required",
      deletedAt: "",
      purgeAfter: "",
    };
  }

  const before = await deleteJournalEntry(scope, { entryId });
  revalidatePublicCacheTags(
    publicEntryChangeTags({
      entryId,
      publicSlug: publicSlugFromUrl(before.publicUrl),
      ownerUserId: scope.userId,
      plantObjectId: objectId || null,
    }),
    "update",
  );

  // The canonical deletion transaction already wrote the durable search-removal
  // intent and the media revocation jobs. Do not make the owner's destructive
  // action wait for external providers; retryable workers prove convergence.
  revalidatePath("/garden");
  if (objectId) revalidatePath(`/garden/objects/${objectId}`);
  if (before.publicUrl) revalidatePath(before.publicUrl);

  return {
    status: before.alreadyDeleted ? "already_deleted" : "deleted",
    deletedAt: toIsoTimestamp(before.deletedAt),
    purgeAfter: toIsoTimestamp(before.purgeAfter),
  };
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function publicSlugFromUrl(publicUrl: string | null): string | null {
  const last = publicUrl?.split("/").filter(Boolean).pop() ?? null;
  if (!last) return null;
  try {
    return decodeURIComponent(last);
  } catch {
    return null;
  }
}
