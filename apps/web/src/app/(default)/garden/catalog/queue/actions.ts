"use server";

import { revalidatePath } from "next/cache";

import { organismAddressChangeTags } from "@/lib/public-cache-tags";
import {
  assertAdminCapabilityForScope,
} from "@/server/admin-access";
import {
  applyCatalogQueueItem,
  countObjectsOnCatalogItem,
  MERGE_CONFIRMATION_OBJECT_THRESHOLD,
  revertCatalogAction,
  skipCatalogQueueItem,
  rejectCatalogQueueItem,
} from "@/server/catalog-curation-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { announceCatalogCard } from "@/server/indexnow-public-addresses";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

const QUEUE_PATH = "/garden/catalog/queue";

/**
 * The four decisions the owner makes (ADR-0026 D10). Each is a Server Action
 * reference on a real form, so the queue works before hydration; the keyboard
 * shortcuts on the page submit these same forms.
 *
 * Applying and reverting go through the SQL functions of migration `0056`, the
 * same ones the worker calls above a rule's threshold. There is no second
 * implementation of a decision.
 */
export async function acceptCatalogQueueItemAction(
  _previousState: unknown,
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
  });
  if (admission.status === "rejected") return { mutationScope: admission.code };
  const scope = admission.scope;
  await assertAdminCapabilityForScope(scope, "operator:mutate");

  const queueItemId = String(formData.get("queueItemId") ?? "");
  const mergeTargetId = String(formData.get("mergeSubjectCatalogItemId") ?? "");
  const confirmed = String(formData.get("confirmMerge") ?? "") === "yes";

  // A merge that moves more than fifty gardener objects asks once.
  if (mergeTargetId && !confirmed) {
    const objects = await countObjectsOnCatalogItem(mergeTargetId);
    if (objects > MERGE_CONFIRMATION_OBJECT_THRESHOLD) {
      return { confirmationRequired: true, objects };
    }
  }

  const { actionId, subjectCatalogItemIds } = await applyCatalogQueueItem({
    queueItemId,
    actorUserId: scope.userId,
    automatic: false,
  });
  for (const catalogItemId of subjectCatalogItemIds) {
    revalidatePublicCacheTags(organismAddressChangeTags(catalogItemId), "expire");
    // Only an indexable card is announced — see `announceCatalogCard`.
    announceCatalogCard(catalogItemId);
  }
  revalidatePath(QUEUE_PATH);
  return { actionId };
}

export async function rejectCatalogQueueItemAction(
  _previousState: unknown,
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
  });
  if (admission.status === "rejected") return { mutationScope: admission.code };
  await assertAdminCapabilityForScope(admission.scope, "operator:mutate");

  await rejectCatalogQueueItem({
    queueItemId: String(formData.get("queueItemId") ?? ""),
    actorUserId: admission.scope.userId,
  });
  revalidatePath(QUEUE_PATH);
}

export async function skipCatalogQueueItemAction(
  _previousState: unknown,
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
  });
  if (admission.status === "rejected") return { mutationScope: admission.code };
  await assertAdminCapabilityForScope(admission.scope, "operator:mutate");

  await skipCatalogQueueItem({
    queueItemId: String(formData.get("queueItemId") ?? ""),
    actorUserId: admission.scope.userId,
  });
  revalidatePath(QUEUE_PATH);
}

export async function revertCatalogActionAction(
  _previousState: unknown,
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
  });
  if (admission.status === "rejected") return { mutationScope: admission.code };
  const scope = admission.scope;
  await assertAdminCapabilityForScope(scope, "operator:mutate");

  const { subjectCatalogItemIds } = await revertCatalogAction({
    actionId: String(formData.get("actionId") ?? ""),
    actorUserId: scope.userId,
  });
  for (const catalogItemId of subjectCatalogItemIds) {
    revalidatePublicCacheTags(organismAddressChangeTags(catalogItemId), "expire");
    // Only an indexable card is announced — see `announceCatalogCard`.
    announceCatalogCard(catalogItemId);
  }
  revalidatePath(QUEUE_PATH);
}
