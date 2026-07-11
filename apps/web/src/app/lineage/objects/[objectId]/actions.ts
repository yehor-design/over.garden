"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { publicLineageObjectPath } from "@/lib/garden/public-paths";
import { AuthenticationRequiredError } from "@/server/auth-session";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { createAuthIntentToken } from "@/server/auth-intent-token";
import {
  askLineageQuestion,
  followLineageNode,
} from "@/server/lineage-interactions-repository";
import { requireWriteEligibleRequestScope } from "@/server/pilot-write-access";

const LINEAGE_UPDATES_PATH = "/garden/lineage/questions";

export async function followLineageNodeAction(formData: FormData) {
  const edgeId = String(formData.get("edgeId") ?? "");
  const targetPlantObjectId = String(formData.get("targetPlantObjectId") ?? "");
  const rootPlantObjectId = String(formData.get("rootPlantObjectId") ?? "");
  const scope = await requireFollowScope({
    edgeId,
    targetPlantObjectId,
    rootPlantObjectId,
  });

  await followLineageNode(scope, {
    edgeId,
    targetPlantObjectId,
  });

  revalidateLineageInteractionPaths(rootPlantObjectId);
}

export async function askLineageQuestionAction(formData: FormData) {
  const scope = await requireWriteEligibleRequestScope();

  await askLineageQuestion(scope, {
    edgeId: String(formData.get("edgeId") ?? ""),
    targetPlantObjectId: String(formData.get("targetPlantObjectId") ?? ""),
    questionText: String(formData.get("questionText") ?? ""),
    clientMutationId: String(formData.get("clientMutationId") ?? ""),
  });

  revalidateLineageInteractionPaths(
    String(formData.get("rootPlantObjectId") ?? ""),
  );
}

function revalidateLineageInteractionPaths(rootPlantObjectId: string) {
  const normalizedRootPlantObjectId = rootPlantObjectId.trim();

  revalidatePath(LINEAGE_UPDATES_PATH);
  if (normalizedRootPlantObjectId) {
    revalidatePath(publicLineageObjectPath(normalizedRootPlantObjectId));
  }
}

async function requireFollowScope({
  edgeId,
  targetPlantObjectId,
  rootPlantObjectId,
}: {
  edgeId: string;
  targetPlantObjectId: string;
  rootPlantObjectId: string;
}) {
  try {
    return await requireWriteEligibleRequestScope();
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
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
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
