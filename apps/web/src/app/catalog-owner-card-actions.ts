"use server";

import { organismAddressChangeTags } from "@/lib/public-cache-tags";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import {
  recordCardIndexableOverride,
  recordCardPinnedName,
  recordCardRename,
  revertCardAction,
} from "@/server/owner-action-audit";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
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
