"use server";

import { revalidatePath } from "next/cache";

import { isIrreversibleActionConfirmed } from "@/lib/stable-registry/irreversible-action";
import { recordOwnerAction } from "@/server/owner-action-audit";

import type { MutationScopeActionState } from "@/lib/auth/owner-scope-contract";
import { isStableRegistryReleaseCenterEnabled } from "@/lib/stable-registry/feature-gate";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import {
  abandonFoundationRelease,
  activateFoundationRelease,
  approveFoundationPreview,
  createFoundationDraft,
  decideFoundationExceptionGroup,
  type RegistryActionOutcome,
} from "@/server/stable-registry/release-repository";
import type { RequestScope } from "@/server/request-scope";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

const REGISTRY_PATH = "/garden/catalog/registry";

export type StableRegistryActionResult =
  | { outcome: RegistryActionOutcome }
  | MutationScopeActionState;

export async function buildFoundationReleaseAction(
  formData: FormData,
): Promise<StableRegistryActionResult> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const scope = await requireCatalogOwner(admission.scope);
  if (!scope.ok) return scope.result;

  const result = await createFoundationDraft(scope.scope, {
    captureId: optionalFormString(formData, "captureId"),
    writesEnabled: isStableRegistryReleaseCenterEnabled(),
  });
  revalidatePath(REGISTRY_PATH);
  return { outcome: result.outcome };
}

export async function decideFoundationExceptionGroupAction(
  formData: FormData,
): Promise<StableRegistryActionResult> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const scope = await requireCatalogOwner(admission.scope);
  if (!scope.ok) return scope.result;

  const result = await decideFoundationExceptionGroup(scope.scope, {
    releaseId: formString(formData, "releaseId"),
    groupId: formString(formData, "groupId"),
    expectedVersion: Number(formString(formData, "expectedVersion")),
    action: formString(formData, "action") as Parameters<
      typeof decideFoundationExceptionGroup
    >[1]["action"],
    writesEnabled: isStableRegistryReleaseCenterEnabled(),
  });
  revalidatePath(REGISTRY_PATH);
  return { outcome: result.outcome };
}

export async function approveFoundationPreviewAction(
  formData: FormData,
): Promise<StableRegistryActionResult> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const scope = await requireCatalogOwner(admission.scope);
  if (!scope.ok) return scope.result;

  const result = await approveFoundationPreview(scope.scope, {
    releaseId: formString(formData, "releaseId"),
    writesEnabled: isStableRegistryReleaseCenterEnabled(),
  });
  revalidatePath(REGISTRY_PATH);
  return { outcome: result.outcome };
}

export async function activateFoundationReleaseAction(
  formData: FormData,
): Promise<StableRegistryActionResult> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const scope = await requireCatalogOwner(admission.scope);
  if (!scope.ok) return scope.result;

  if (!isIrreversibleActionConfirmed(formData)) {
    return { outcome: "confirmation_required" };
  }
  const releaseId = formString(formData, "releaseId");
  const result = await activateFoundationRelease(scope.scope, {
    releaseId,
    previewDigest: formString(formData, "previewDigest"),
    writesEnabled: isStableRegistryReleaseCenterEnabled(),
  });
  if (result.outcome === "accepted") {
    await recordOwnerAction(
      scope.scope,
      "stable_registry_foundation_activate",
      `release=${releaseId}`,
    );
  }
  revalidatePath(REGISTRY_PATH);
  return { outcome: result.outcome };
}

export async function abandonFoundationReleaseAction(
  formData: FormData,
): Promise<StableRegistryActionResult> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const scope = await requireCatalogOwner(admission.scope);
  if (!scope.ok) return scope.result;

  const result = await abandonFoundationRelease(scope.scope, {
    releaseId: formString(formData, "releaseId"),
    writesEnabled: isStableRegistryReleaseCenterEnabled(),
  });
  revalidatePath(REGISTRY_PATH);
  return { outcome: result.outcome };
}

async function requireCatalogOwner(
  scope: RequestScope,
): Promise<
  | { ok: true; scope: RequestScope }
  | { ok: false; result: StableRegistryActionResult }
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

function optionalFormString(
  formData: FormData,
  name: string,
): string | undefined {
  const value = formString(formData, name);
  return value || undefined;
}
