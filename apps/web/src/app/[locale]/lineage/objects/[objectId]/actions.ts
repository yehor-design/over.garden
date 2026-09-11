"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { publicLineageObjectPath } from "@/lib/garden/public-paths";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { createAuthIntentToken } from "@/server/auth-intent-token";
import {
  askLineageQuestion,
  followLineageNode,
} from "@/server/lineage-interactions-repository";
import { isInteractionAdmissionError } from "@/server/interaction-admission";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

const LINEAGE_UPDATES_PATH = "/garden/lineage/questions";

export async function followLineageNodeAction(formData: FormData) {
  const edgeId = String(formData.get("edgeId") ?? "");
  const targetPlantObjectId = String(formData.get("targetPlantObjectId") ?? "");
  const rootPlantObjectId = String(formData.get("rootPlantObjectId") ?? "");
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      redirectToFollowAuthIntent({
        edgeId,
        targetPlantObjectId,
        rootPlantObjectId,
      });
    }
    return { mutationScope: admission.code };
  }
  const scope = admission.scope;

  await followLineageNode(scope, {
    edgeId,
    targetPlantObjectId,
  });

  revalidateLineageInteractionPaths(rootPlantObjectId);
}

export async function askLineageQuestionAction(formData: FormData) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const scope = admission.scope;
  const rootPlantObjectId = String(formData.get("rootPlantObjectId") ?? "");

  try {
    await askLineageQuestion(scope, {
      edgeId: String(formData.get("edgeId") ?? ""),
      targetPlantObjectId: String(formData.get("targetPlantObjectId") ?? ""),
      questionText: String(formData.get("questionText") ?? ""),
      clientMutationId: String(formData.get("clientMutationId") ?? ""),
    });
  } catch (error) {
    if (
      isInteractionAdmissionError(error) &&
      UUID_PATTERN.test(rootPlantObjectId)
    ) {
      const url = new URL(
        publicLineageObjectPath(rootPlantObjectId),
        "https://over.garden",
      );
      url.searchParams.set(
        "engagement",
        error.failure === "quota"
          ? "lineage-question-rate-limited"
          : "interaction-unavailable",
      );
      redirect(`${url.pathname}${url.search}#passport-provenance`);
    }
    throw error;
  }

  revalidateLineageInteractionPaths(rootPlantObjectId);
}

function revalidateLineageInteractionPaths(rootPlantObjectId: string) {
  const normalizedRootPlantObjectId = rootPlantObjectId.trim();

  revalidatePath(LINEAGE_UPDATES_PATH);
  if (normalizedRootPlantObjectId) {
    revalidatePath(publicLineageObjectPath(normalizedRootPlantObjectId));
  }
}

function redirectToFollowAuthIntent({
  edgeId,
  targetPlantObjectId,
  rootPlantObjectId,
}: {
  edgeId: string;
  targetPlantObjectId: string;
  rootPlantObjectId: string;
}) {
  if (
    !UUID_PATTERN.test(edgeId) ||
    !UUID_PATTERN.test(targetPlantObjectId) ||
    !UUID_PATTERN.test(rootPlantObjectId)
  ) {
    throw new Error("A valid lineage node is required to resume following.");
  }

  const token = createAuthIntentToken({
    action: "follow",
    returnTo: publicLineageObjectPath(rootPlantObjectId),
    target: { kind: "object", ref: targetPlantObjectId },
    control: createAuthIntentControlRef(
      "follow",
      `${edgeId}:${targetPlantObjectId}`,
    ),
  });
  redirect(`/auth/intent?intent=${encodeURIComponent(token)}`);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
