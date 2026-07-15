"use server";

import { revalidatePath } from "next/cache";

import { publicVarietyPath } from "@/lib/garden/public-paths";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import {
  approveCatalogAliasSuggestion,
  enqueueCatalogAliasSuggestionsRefresh,
  rejectCatalogAliasSuggestion,
} from "@/server/catalog-alias-curation-repository";
import {
  approveCatalogMatchSuggestion,
  confirmCatalogCurationCandidate,
  enqueueCatalogMatchSuggestionsRefresh,
  mergeCatalogCurationCandidate,
  rejectCatalogCurationCandidate,
  rejectCatalogMatchSuggestion,
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

export interface CatalogMatchSuggestionActionResult {
  outcome: "approved" | "rejected" | "stale";
  message: string;
}

export interface CatalogAliasSuggestionActionResult {
  outcome: "queued" | "approved" | "rejected" | "stale" | "collision";
  message: string;
}

export async function generateCatalogAliasSuggestionsAction(
  formData: FormData,
): Promise<CatalogAliasSuggestionActionResult> {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  await enqueueCatalogAliasSuggestionsRefresh({
    catalogItemId: String(formData.get("catalogItemId") ?? ""),
  });
  revalidatePath(CURATION_PATH);

  return {
    outcome: "queued",
    message: "Alias generation queued for this catalog identity.",
  };
}

export async function approveCatalogAliasSuggestionAction(
  formData: FormData,
): Promise<CatalogAliasSuggestionActionResult> {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  const result = await approveCatalogAliasSuggestion(scope, {
    aliasProjectionId: String(formData.get("aliasProjectionId") ?? ""),
  });
  revalidatePath(CURATION_PATH);

  if (result.outcome === "collision") {
    return {
      outcome: "collision",
      message:
        "This normalized alias belongs to another catalog identity. Nothing was published.",
    };
  }
  if (result.outcome === "stale") {
    return {
      outcome: "stale",
      message:
        "The source identity changed. Regenerate before reviewing again.",
    };
  }

  return {
    outcome: "approved",
    message: "Alias approved. Typeahead reindex was queued.",
  };
}

export async function rejectCatalogAliasSuggestionAction(
  formData: FormData,
): Promise<CatalogAliasSuggestionActionResult> {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  const result = await rejectCatalogAliasSuggestion(scope, {
    aliasProjectionId: String(formData.get("aliasProjectionId") ?? ""),
    reasonCode: String(formData.get("reasonCode") ?? ""),
  });
  revalidatePath(CURATION_PATH);

  if (result.outcome === "stale") {
    return {
      outcome: "stale",
      message: "The source identity changed. Nothing was rejected.",
    };
  }

  return {
    outcome: "rejected",
    message: "Alias rejected. It was not added to typeahead.",
  };
}

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

export async function rescanCatalogMatchSuggestionsAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  await enqueueCatalogMatchSuggestionsRefresh({
    candidateId: String(formData.get("candidateId") ?? ""),
  });

  revalidatePath(CURATION_PATH);
}

export async function approveCatalogMatchSuggestionAction(
  formData: FormData,
): Promise<CatalogMatchSuggestionActionResult> {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  const result = await approveCatalogMatchSuggestion(scope, {
    suggestionId: String(formData.get("suggestionId") ?? ""),
  });

  revalidateCatalogMatchSuggestionPaths(result);

  if (result.outcome === "stale") {
    return {
      outcome: "stale",
      message: "This suggestion changed before review. Nothing was applied.",
    };
  }

  return {
    outcome: "approved",
    message: `Match approved for ${result.affectedObjectCount} affected object${result.affectedObjectCount === 1 ? "" : "s"}.`,
  };
}

export async function rejectCatalogMatchSuggestionAction(
  formData: FormData,
): Promise<CatalogMatchSuggestionActionResult> {
  const scope = await requireCurrentRequestScope();
  await assertCatalogCuratorAccess(scope);

  const result = await rejectCatalogMatchSuggestion(scope, {
    suggestionId: String(formData.get("suggestionId") ?? ""),
    reasonCode: String(formData.get("reasonCode") ?? ""),
  });

  revalidatePath(CURATION_PATH);

  if (result.outcome === "stale") {
    return {
      outcome: "stale",
      message: "This suggestion changed before review. Nothing was applied.",
    };
  }

  return {
    outcome: "rejected",
    message:
      "Suggestion rejected. Catalog identity and journal history were unchanged.",
  };
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

function revalidateCatalogMatchSuggestionPaths(result: {
  outcome: "approved" | "rejected" | "stale";
  targetPublicSlug: string | null;
  publicEntryPaths: string[];
}) {
  revalidatePath(CURATION_PATH);

  if (result.outcome !== "approved") return;

  revalidatePath("/garden");
  if (result.targetPublicSlug) {
    revalidatePath(publicVarietyPath(result.targetPublicSlug));
  }
  for (const publicEntryPath of result.publicEntryPaths) {
    revalidatePath(publicEntryPath);
  }
}
