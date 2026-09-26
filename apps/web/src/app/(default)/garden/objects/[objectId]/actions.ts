"use server";

import { revalidatePath } from "next/cache";
import { PUBLIC_CACHE_TAGS, publicCacheTag } from "@/lib/public-cache-tags";

import type { MutationScopeActionState } from "@/lib/auth/owner-scope-contract";
import {
  deleteJournalEntry,
  resolvePlantObjectCatalog,
  updatePlantObjectLocation,
} from "@/server/journal-repository";
import {
  createLineageInvitation,
  createProvenanceEdge,
  ProvenanceRelationError,
} from "@/server/lineage-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { publicEntryChangeTags } from "@/lib/public-cache-tags";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

/**
 * `(previousState, formData)` — the shape `useActionState` calls, and the one
 * that lets `OwnerScopedProgressiveForm` hand React a Server Action reference
 * rather than a client closure. React answers a closure with
 * `action="javascript:throw …"`, a placeholder it replaces on hydration and
 * never before, so the control did nothing until the bundle ran (ADR-0024 D3,
 * `OVE-457`). The first argument is the previous result and is unused here.
 */
export async function resolvePlantObjectCatalogAction(
  _previousState: unknown,
  formData: FormData,
) {
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
    catalogLabel: String(formData.get("catalogLabel") ?? ""),
  });

  revalidateObject(result.plantObject.id);
  revalidatePublicEntries(result);
  // An object that changes species moves its entries between species pages,
  // and can publish one page and unpublish another (`OVE-519`): every species
  // page, its forms' pages and the sitemap read under these two tags.
  revalidatePublicCacheTags(
    [PUBLIC_CACHE_TAGS.catalog, PUBLIC_CACHE_TAGS.sitemap],
    "expire",
  );
}

export async function updatePlantObjectLocationAction(
  _previousState: unknown,
  formData: FormData,
) {
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

  revalidateObject(result.plantObject.id);
  revalidatePublicEntries(result);
}

export async function createProvenanceEdgeAction(
  _previousState: unknown,
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const scope = admission.scope;
  let result: Awaited<ReturnType<typeof createProvenanceEdge>>;
  try {
    result = await createProvenanceEdge(scope, {
      subjectPlantObjectId: String(formData.get("objectId") ?? ""),
      sourceKind: String(formData.get("sourceKind") ?? ""),
      sourcePlantObjectId: String(formData.get("sourcePlantObjectId") ?? ""),
      sourceReferenceKind: String(formData.get("sourceReferenceKind") ?? ""),
      sourceReferenceLabel: String(formData.get("sourceReferenceLabel") ?? ""),
      clientMutationId: String(formData.get("clientMutationId") ?? ""),
    });
  } catch (error) {
    // A relation the domain does not allow is an answer, not a crash: the
    // form says why and keeps what was chosen (`OVE-491`).
    if (error instanceof ProvenanceRelationError) {
      return { status: "refused" as const, reason: error.reason };
    }
    throw error;
  }

  revalidateObject(result.subjectObject.id);
  if (result.sourceObject) revalidateObject(result.sourceObject.id);
  return { status: "recorded" as const };
}

export async function createLineageInvitationAction(
  _previousState: unknown,
  formData: FormData,
) {
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

  revalidateObject(result.subjectObject.id);
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
  _previousState: unknown,
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

/**
 * Every public entry on the object, by its own address and by its cache tag.
 *
 * `revalidatePath` alone used to be called with the legacy `/journal/{slug}`
 * paths, which have answered 308 since OVE-428 and cache nothing — so a
 * location or catalog change reached the public entry pages only when their
 * hour-long cache expired on its own.
 */
/**
 * The garden and the object's pages — its history, its settings and its
 * provenance (`OVE-491`) — which all read the same object.
 */
function revalidateObject(objectId: string) {
  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${objectId}`, "layout");
}

function revalidatePublicEntries(result: {
  plantObject: { id: string };
  publicEntryPaths: string[];
  publicEntryIds: string[];
}) {
  for (const publicEntryPath of result.publicEntryPaths) {
    revalidatePath(publicEntryPath);
  }
  revalidatePublicCacheTags(
    [
      publicCacheTag.object(result.plantObject.id),
      ...result.publicEntryIds.map((entryId) => publicCacheTag.entry(entryId)),
    ],
    "expire",
  );
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
