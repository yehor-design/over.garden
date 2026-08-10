import { revalidatePath } from "next/cache";

import { authIntentRequiredResponse } from "@/server/auth-intent-http";
import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { resolvePlantObjectCatalog } from "@/server/journal-repository";
import {
  readPlantIdentificationReceipt,
  readPlantIdentificationTarget,
  recordPlantIdentificationDecision,
  recordPlantIdentificationDecisionInTransaction,
} from "@/server/plant-identification-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.transportResult !== "AUTHENTICATION_REQUIRED") {
      return documentMutationAdmissionResponse(admission);
    }
    return authIntentRequiredResponse(request, {
      action: "save",
      fallbackReturnTo: "/garden",
      message: "Sign in to confirm this plant identity.",
    });
  }
  const scope = admission.scope;

  const input = parseDecision(await request.json().catch(() => null));
  if (!input)
    return Response.json({ error: "invalid_decision" }, { status: 400 });

  const targetObjectId = await readPlantIdentificationTarget(
    scope,
    input.requestId,
  );
  if (input.decision === "confirmed") {
    if (!targetObjectId || !input.catalogItemId || !input.rank) {
      return Response.json({ error: "invalid_decision" }, { status: 422 });
    }
    const receipt = await readPlantIdentificationReceipt(
      scope,
      input.requestId,
    );
    const selected = receipt?.candidates.find(
      (candidate) =>
        candidate.rank === input.rank &&
        candidate.catalogItemId === input.catalogItemId,
    );
    if (!receipt?.canConfirm || !selected) {
      return Response.json({ error: "invalid_decision" }, { status: 422 });
    }
    await resolvePlantObjectCatalog(
      scope,
      {
        plantObjectId: targetObjectId,
        catalogItemId: input.catalogItemId,
      },
      {
        afterResolve: ({ transaction }) =>
          recordPlantIdentificationDecisionInTransaction(transaction, scope, {
            requestId: input.requestId,
            decision: input.decision,
            selectedCandidateRank: input.rank,
            selectedCatalogItemId: input.catalogItemId,
          }),
      },
    );
  } else {
    await recordPlantIdentificationDecision(scope, {
      requestId: input.requestId,
      decision: input.decision,
      selectedCandidateRank: input.rank,
      selectedCatalogItemId: input.catalogItemId,
    });
  }
  if (targetObjectId) revalidatePath(`/garden/objects/${targetObjectId}`);
  revalidatePath("/garden");
  return Response.json({ ok: true, plantObjectId: targetObjectId });
}

function parseDecision(value: unknown): {
  requestId: string;
  decision: "confirmed" | "manual" | "unknown" | "dismissed";
  rank: number | null;
  catalogItemId: string | null;
} | null {
  if (!isRecord(value) || typeof value.requestId !== "string") return null;
  if (!UUID_PATTERN.test(value.requestId)) return null;
  if (
    value.decision !== "confirmed" &&
    value.decision !== "manual" &&
    value.decision !== "unknown" &&
    value.decision !== "dismissed"
  ) {
    return null;
  }
  const rank =
    typeof value.rank === "number" && Number.isInteger(value.rank)
      ? value.rank
      : null;
  const catalogItemId =
    typeof value.catalogItemId === "string" ? value.catalogItemId : null;
  if (
    value.decision === "confirmed" &&
    (!rank || !catalogItemId || !UUID_PATTERN.test(catalogItemId))
  ) {
    return null;
  }
  if (
    value.decision !== "confirmed" &&
    (rank !== null || catalogItemId !== null)
  )
    return null;
  return {
    requestId: value.requestId,
    decision: value.decision,
    rank,
    catalogItemId,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
