"use server";

import { revalidatePath } from "next/cache";

import { publicVarietyPath } from "@/lib/garden/public-paths";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import {
  confirmCatalogCurationCandidate,
  mergeCatalogCurationCandidate,
  rejectCatalogCurationCandidate,
  type CatalogCurationDecisionResult,
} from "@/server/catalog-curation-repository";
import {
  holdCatalogSourceCandidate,
  promoteCatalogSourceCandidate,
  rejectCatalogSourceCandidate,
  type CatalogSourceCandidateDecisionResult,
} from "@/server/catalog-source/candidate-review-repository";
import { requireCurrentRequestScope } from "@/server/auth-session";
import { upsertVarietySeedProof } from "@/server/variety-seed-proof-repository";

const CURATION_PATH = "/garden/catalog/curation";

export async function confirmCatalogCandidateAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  const result = await confirmCatalogCurationCandidate(scope, {
    candidateId: String(formData.get("candidateId") ?? ""),
  });

  revalidateCatalogCurationPaths(result);
}

export async function mergeCatalogCandidateAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  const result = await mergeCatalogCurationCandidate(scope, {
    candidateId: String(formData.get("candidateId") ?? ""),
    targetCatalogItemId: String(formData.get("targetCatalogItemId") ?? ""),
  });

  revalidateCatalogCurationPaths(result);
}

export async function rejectCatalogCandidateAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  const result = await rejectCatalogCurationCandidate(scope, {
    candidateId: String(formData.get("candidateId") ?? ""),
  });

  revalidateCatalogCurationPaths(result);
}

export async function upsertVarietySeedProofAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  const result = await upsertVarietySeedProof(scope, {
    catalogItemId: String(formData.get("catalogItemId") ?? ""),
    title: String(formData.get("title") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    body: String(formData.get("body") ?? ""),
    sourceLabel: String(formData.get("sourceLabel") ?? ""),
    status: String(formData.get("status") ?? ""),
  });

  revalidatePath(CURATION_PATH);
  revalidatePath(publicVarietyPath(result.catalog.publicSlug));
}

export async function promoteCatalogSourceCandidateAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  const result = await promoteCatalogSourceCandidate(scope, {
    sourceRecordId: String(formData.get("sourceRecordId") ?? ""),
  });

  revalidateCatalogSourceCandidatePaths(result);
}

export async function holdCatalogSourceCandidateAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  const result = await holdCatalogSourceCandidate(scope, {
    sourceRecordId: String(formData.get("sourceRecordId") ?? ""),
  });

  revalidateCatalogSourceCandidatePaths(result);
}

export async function rejectCatalogSourceCandidateAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  const result = await rejectCatalogSourceCandidate(scope, {
    sourceRecordId: String(formData.get("sourceRecordId") ?? ""),
  });

  revalidateCatalogSourceCandidatePaths(result);
}

function revalidateCatalogCurationPaths(result: CatalogCurationDecisionResult) {
  revalidatePath(CURATION_PATH);
  revalidatePath("/garden");

  const publicSlug = result.candidate.public_slug;
  if (publicSlug) {
    revalidatePath(publicVarietyPath(publicSlug));
  }

  for (const publicEntryPath of result.publicEntryPaths) {
    revalidatePath(publicEntryPath);
  }
}

function revalidateCatalogSourceCandidatePaths(
  result: CatalogSourceCandidateDecisionResult,
) {
  revalidatePath(CURATION_PATH);
  revalidatePath("/garden");

  if (result.catalogPublicSlug) {
    revalidatePath(publicVarietyPath(result.catalogPublicSlug));
  }
}
