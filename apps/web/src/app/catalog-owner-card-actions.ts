"use server";

import { organismAddressChangeTags } from "@/lib/public-cache-tags";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import {
  mergeCatalogCardIntoNode,
  recordCardIndexableOverride,
  recordCardPinnedName,
  recordCardRename,
  revertCardAction,
} from "@/server/owner-action-audit";
import {
  applyCatalogQueueItem,
  countObjectsOnCatalogItem,
  MERGE_CONFIRMATION_OBJECT_THRESHOLD,
} from "@/server/catalog-curation-repository";
import { resolvePublicCatalogAddress } from "@/server/public-catalog-address-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { announceCatalogCard } from "@/server/indexnow-public-addresses";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

/**
 * The edits the owner makes on the public card itself (ADR-0026 D10): rename,
 * pin a preferred name with a reason, and set or clear the indexability
 * override. Each writes an action with its inverse into the same audit the
 * queue decisions use, and expires the card's tags so the next reader sees
 * the change.
 */
async function ownerScope(formData: FormData) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
  });
  if (admission.status === "rejected") return null;
  await assertAdminCapabilityForScope(admission.scope, "operator:mutate");
  return admission.scope;
}

function revalidateCard(catalogItemId: string) {
  revalidatePublicCacheTags(organismAddressChangeTags(catalogItemId), "expire");
  // Only if the card is indexable — `announceCatalogCard` reads that, because
  // a card built only from sources stays `noindex` (ADR-0026 D9) and asking an
  // engine to fetch it would be asking it to read "do not index me".
  announceCatalogCard(catalogItemId);
}

export async function renameCatalogCardAction(
  _previousState: unknown,
  formData: FormData,
) {
  const scope = await ownerScope(formData);
  if (!scope) return { mutationScope: "rejected" };

  const catalogItemId = String(formData.get("catalogItemId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return { error: "empty_name" };

  await recordCardRename({
    catalogItemId,
    displayName,
    locale: String(formData.get("locale") ?? "und"),
    reason: normalizedReason(formData),
    actorUserId: scope.userId,
  });
  revalidateCard(catalogItemId);
}

export async function pinCatalogCardNameAction(
  _previousState: unknown,
  formData: FormData,
) {
  const scope = await ownerScope(formData);
  if (!scope) return { mutationScope: "rejected" };

  const catalogItemId = String(formData.get("catalogItemId") ?? "");
  await recordCardPinnedName({
    catalogItemId,
    nameId: String(formData.get("nameId") ?? ""),
    reason: normalizedReason(formData),
    actorUserId: scope.userId,
  });
  revalidateCard(catalogItemId);
}

export async function setCatalogCardIndexableAction(
  _previousState: unknown,
  formData: FormData,
) {
  const scope = await ownerScope(formData);
  if (!scope) return { mutationScope: "rejected" };

  const catalogItemId = String(formData.get("catalogItemId") ?? "");
  const value = String(formData.get("indexable") ?? "");
  await recordCardIndexableOverride({
    catalogItemId,
    indexable: value === "true" ? true : value === "false" ? false : null,
    actorUserId: scope.userId,
  });
  revalidateCard(catalogItemId);
}

/**
 * Merge this card into another node, chosen by its public address (ADR-0026
 * D10). The address is resolved the way a reader's request is, so the owner
 * types what the picker and the card itself show. The merge then travels the
 * ordinary path — a `node_merge` queue item applied by
 * `catalog_apply_queue_item` — so its inverse, its revert and its audit are
 * the queue's, not a second implementation. A node carrying more than fifty
 * gardener objects asks once, exactly as the queue does.
 */
export async function mergeCatalogCardAction(
  _previousState: unknown,
  formData: FormData,
) {
  const scope = await ownerScope(formData);
  if (!scope) return { mutationScope: "rejected" };

  const catalogItemId = String(formData.get("catalogItemId") ?? "");
  const address = String(formData.get("targetAddress") ?? "").trim();
  if (!address) return { error: "empty_target" };

  const survivorId = await resolveMergeTarget(address);
  if (!survivorId) return { error: "unknown_target" };
  if (survivorId === catalogItemId) return { error: "same_node" };

  if (String(formData.get("confirmMerge") ?? "") !== "yes") {
    const objects = await countObjectsOnCatalogItem(catalogItemId);
    if (objects > MERGE_CONFIRMATION_OBJECT_THRESHOLD) {
      return { confirmationRequired: true, objects };
    }
  }

  const { queueItemId } = await mergeCatalogCardIntoNode({
    loserCatalogItemId: catalogItemId,
    survivorCatalogItemId: survivorId,
    reason: normalizedReason(formData),
    actorUserId: scope.userId,
  });
  const { subjectCatalogItemIds } = await applyCatalogQueueItem({
    queueItemId,
    actorUserId: scope.userId,
    automatic: false,
  });
  for (const touched of new Set([catalogItemId, survivorId, ...subjectCatalogItemIds])) {
    revalidateCard(touched);
  }
}

/** A UUID, or a public address the same resolver a reader's request uses. */
async function resolveMergeTarget(address: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  if (uuid.test(address)) return address.toLowerCase();
  const slugs = address
    .replace(/^https?:\/\/[^/]+/iu, "")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "species" && part !== "variety" && part !== "breed");
  const speciesSlug = slugs[0];
  if (!speciesSlug) return null;
  const lookup = await resolvePublicCatalogAddress({
    kind: "species",
    speciesSlug,
    formSlug: slugs[1] ?? null,
  });
  return lookup.status === "not_found" ? null : lookup.catalogItemId;
}

export async function revertCatalogCardEditAction(
  _previousState: unknown,
  formData: FormData,
) {
  const scope = await ownerScope(formData);
  if (!scope) return { mutationScope: "rejected" };

  const catalogItemId = String(formData.get("catalogItemId") ?? "");
  await revertCardAction({
    actionId: String(formData.get("actionId") ?? ""),
    actorUserId: scope.userId,
  });
  revalidateCard(catalogItemId);
}

function normalizedReason(formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  return reason.length > 0 ? reason.slice(0, 240) : null;
}
