"use server";

import { revalidatePath } from "next/cache";

import { isIrreversibleActionConfirmed } from "@/lib/stable-registry/irreversible-action";
import { recordOwnerAction } from "@/server/owner-action-audit";

import type { MutationScopeActionState } from "@/lib/auth/owner-scope-contract";
import type {
  EditionDecisionAction,
  EditionTransition,
} from "@/lib/stable-registry/edition-actions";
import { isStableRegistryEditionsEnabled } from "@/lib/stable-registry/feature-gate";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import type { RequestScope } from "@/server/request-scope";
import {
  approveEditionPreview,
  decideEditionDiffGroup,
  moveEditionPointer,
  prepareEdition,
  type EditionOutcome,
} from "@/server/stable-registry/edition-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

const EDITIONS_PATH = "/garden/catalog/registry/editions";

export type EditionActionState =
  | { outcome: EditionOutcome }
  | MutationScopeActionState;

export async function prepareEditionAction(
  formData: FormData,
): Promise<EditionActionState> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const owner = await requireCatalogOwner(admission.scope);
  if (!owner.ok) return owner.result;

  const result = await prepareEdition(owner.scope, {
    captureId: formString(formData, "captureId"),
    writesEnabled: isStableRegistryEditionsEnabled(),
  });
  revalidatePath(EDITIONS_PATH);
  return { outcome: result.outcome };
}

export async function decideEditionDiffGroupAction(
  formData: FormData,
): Promise<EditionActionState> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const owner = await requireCatalogOwner(admission.scope);
  if (!owner.ok) return owner.result;

  const result = await decideEditionDiffGroup(owner.scope, {
    releaseId: formString(formData, "releaseId"),
    groupId: formString(formData, "groupId"),
    action: formString(formData, "action") as EditionDecisionAction,
    expectedVersion: Number(formString(formData, "expectedVersion")),
    expectedAffectedObjectCount: Number(
      formString(formData, "expectedAffectedObjectCount"),
    ),
    fromCatalogItemId: optionalFormString(formData, "fromCatalogItemId"),
    toCatalogItemId: optionalFormString(formData, "toCatalogItemId"),
    writesEnabled: isStableRegistryEditionsEnabled(),
  });
  revalidatePath(EDITIONS_PATH);
  return { outcome: result.outcome };
}

export async function approveEditionPreviewAction(
  formData: FormData,
): Promise<EditionActionState> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const owner = await requireCatalogOwner(admission.scope);
  if (!owner.ok) return owner.result;

  const result = await approveEditionPreview(owner.scope, {
    releaseId: formString(formData, "releaseId"),
    expectedVersion: Number(formString(formData, "expectedVersion")),
    writesEnabled: isStableRegistryEditionsEnabled(),
  });
  revalidatePath(EDITIONS_PATH);
  return { outcome: result.outcome };
}

export async function moveEditionPointerAction(
  formData: FormData,
): Promise<EditionActionState> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const owner = await requireCatalogOwner(admission.scope);
  if (!owner.ok) return owner.result;

  if (!isIrreversibleActionConfirmed(formData)) {
    return { outcome: "confirmation_required" };
  }
  const releaseId = formString(formData, "releaseId");
  const transition = formString(formData, "transition") as EditionTransition;
  const result = await moveEditionPointer(owner.scope, {
    releaseId,
    previewDigest: formString(formData, "previewDigest"),
    transition,
    writesEnabled: isStableRegistryEditionsEnabled(),
  });
  if (result.outcome === "accepted") {
    await recordOwnerAction(
      owner.scope,
      transition === "rollback"
        ? "stable_registry_edition_rollback"
        : transition === "forward"
          ? "stable_registry_edition_forward"
          : "stable_registry_edition_activate",
      `release=${releaseId}`,
    );
  }
  revalidatePath(EDITIONS_PATH);
  return { outcome: result.outcome };
}

async function requireCatalogOwner(
  scope: RequestScope,
): Promise<
  { ok: true; scope: RequestScope } | { ok: false; result: EditionActionState }
> {
  try {
    await assertCatalogCuratorAccess(scope);
  } catch {
    return { ok: false, result: { outcome: "forbidden" } };
  }
  return { ok: true, scope };
}

function formString(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalFormString(formData: FormData, name: string) {
  const value = formString(formData, name);
  return value || undefined;
}
