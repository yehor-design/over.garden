"use server";

import { revalidatePath } from "next/cache";

import type { DocumentMutationActionStateV1 } from "@/lib/auth/document-mutation-generation-transport";
import type {
  EditionDecisionAction,
  EditionTransition,
} from "@/lib/stable-registry/edition-actions";
import { isStableRegistryEditionsEnabled } from "@/lib/stable-registry/feature-gate";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
import type { RequestScope } from "@/server/request-scope";
import {
  approveEditionPreview,
  decideEditionDiffGroup,
  moveEditionPointer,
  type EditionOutcome,
} from "@/server/stable-registry/edition-repository";

const EDITIONS_PATH = "/garden/catalog/registry/editions";

export type EditionActionState =
  | { outcome: EditionOutcome }
  | DocumentMutationActionStateV1;

export async function decideEditionDiffGroupAction(
  formData: FormData,
): Promise<EditionActionState> {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
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
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
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
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const owner = await requireCatalogOwner(admission.scope);
  if (!owner.ok) return owner.result;

  const result = await moveEditionPointer(owner.scope, {
    releaseId: formString(formData, "releaseId"),
    previewDigest: formString(formData, "previewDigest"),
    transition: formString(formData, "transition") as EditionTransition,
    writesEnabled: isStableRegistryEditionsEnabled(),
  });
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
