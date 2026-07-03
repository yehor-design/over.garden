"use server";

import { revalidatePath } from "next/cache";

import { publicLineageObjectPath } from "@/lib/garden/public-paths";
import {
  askLineageQuestion,
  followLineageNode,
} from "@/server/lineage-interactions-repository";
import { requireWriteEligibleRequestScope } from "@/server/pilot-write-access";

const LINEAGE_UPDATES_PATH = "/garden/lineage/questions";

export async function followLineageNodeAction(formData: FormData) {
  const scope = await requireWriteEligibleRequestScope();

  await followLineageNode(scope, {
    edgeId: String(formData.get("edgeId") ?? ""),
    targetPlantObjectId: String(formData.get("targetPlantObjectId") ?? ""),
  });

  revalidateLineageInteractionPaths(
    String(formData.get("rootPlantObjectId") ?? ""),
  );
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
