"use server";

import { revalidatePath } from "next/cache";

import type { DocumentMutationActionStateV1 } from "@/lib/auth/document-mutation-generation-transport";
import type { ExtensionPackDecisionAction } from "@/lib/stable-registry/extension-pack-actions";
import { isStableRegistryExtensionPacksEnabled } from "@/lib/stable-registry/feature-gate";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
import type { RequestScope } from "@/server/request-scope";
import {
  abandonExtensionPack,
  activateExtensionPack,
  approveExtensionPackPreview,
  decideExtensionPackGroup,
  type ExtensionPackOutcome,
} from "@/server/stable-registry/extension-pack-repository";

const EXTENSIONS_PATH = "/garden/catalog/registry/extensions";

export type ExtensionPackActionState =
  | { outcome: ExtensionPackOutcome }
  | DocumentMutationActionStateV1;

export async function decideExtensionPackGroupAction(
  formData: FormData,
): Promise<ExtensionPackActionState> {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const owner = await requireCatalogOwner(admission.scope);
  if (!owner.ok) return owner.result;

  const result = await decideExtensionPackGroup(owner.scope, {
    packId: formString(formData, "packId"),
    rowClass: formString(formData, "rowClass") as Parameters<
      typeof decideExtensionPackGroup
    >[1]["rowClass"],
    action: formString(formData, "action") as ExtensionPackDecisionAction,
    expectedVersion: Number(formString(formData, "expectedVersion")),
    parentCatalogItemId: optionalFormString(formData, "parentCatalogItemId"),
    writesEnabled: isStableRegistryExtensionPacksEnabled(),
  });
  revalidatePath(EXTENSIONS_PATH);
  return { outcome: result.outcome };
}

export async function approveExtensionPackPreviewAction(
  formData: FormData,
): Promise<ExtensionPackActionState> {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const owner = await requireCatalogOwner(admission.scope);
  if (!owner.ok) return owner.result;

  const result = await approveExtensionPackPreview(owner.scope, {
    packId: formString(formData, "packId"),
    expectedVersion: Number(formString(formData, "expectedVersion")),
    writesEnabled: isStableRegistryExtensionPacksEnabled(),
  });
  revalidatePath(EXTENSIONS_PATH);
  return { outcome: result.outcome };
}

export async function activateExtensionPackAction(
  formData: FormData,
): Promise<ExtensionPackActionState> {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const owner = await requireCatalogOwner(admission.scope);
  if (!owner.ok) return owner.result;

  const result = await activateExtensionPack(owner.scope, {
    packId: formString(formData, "packId"),
    previewDigest: formString(formData, "previewDigest"),
    writesEnabled: isStableRegistryExtensionPacksEnabled(),
  });
  revalidatePath(EXTENSIONS_PATH);
  return { outcome: result.outcome };
}

export async function abandonExtensionPackAction(
  formData: FormData,
): Promise<ExtensionPackActionState> {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const owner = await requireCatalogOwner(admission.scope);
  if (!owner.ok) return owner.result;

  const result = await abandonExtensionPack(owner.scope, {
    packId: formString(formData, "packId"),
    writesEnabled: isStableRegistryExtensionPacksEnabled(),
  });
  revalidatePath(EXTENSIONS_PATH);
  return { outcome: result.outcome };
}

async function requireCatalogOwner(
  scope: RequestScope,
): Promise<
  | { ok: true; scope: RequestScope }
  | { ok: false; result: ExtensionPackActionState }
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
