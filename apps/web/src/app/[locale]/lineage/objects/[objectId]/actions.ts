"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { publicCacheTag } from "@/lib/public-cache-tags";
import {
  publicLineageObjectPath,
  publicObjectPassportPath,
} from "@/lib/garden/public-paths";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";
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

/**
 * The passport's own address, from the id the form carries (ADR-0029 D9).
 *
 * One bounded read, only on the paths that leave the page — a redirect after
 * a refused question, the return after sign-in, the revalidation — and the
 * legacy address only for an object that has no slug yet, where it is the
 * address that answers.
 */
async function passportPath(rootPlantObjectId: string): Promise<string> {
  if (!UUID_PATTERN.test(rootPlantObjectId)) {
    return publicLineageObjectPath(rootPlantObjectId);
  }
  const { getPublicObjectPassportAddress } = await import(
    "@/server/public-object-passport-repository"
  );
  const address = await getPublicObjectPassportAddress(
    rootPlantObjectId,
  ).catch(() => null);
  return address
    ? publicObjectPassportPath(address.handle, address.slug)
    : publicLineageObjectPath(rootPlantObjectId);
}

/**
 * Every action here takes `(_previousState, formData)`.
 *
 * That is the shape `useActionState` calls an action with, and
 * `OwnerScopedProgressiveForm` hands React the reference unwrapped so the form
 * gets a **real endpoint** before the bundle runs (ADR-0024 D3). The other
 * shape, `(formData)`, has to be adapted inside a client closure, and React
 * answers a closure with
 * `action="javascript:throw new Error('React form unexpectedly submitted.')"` —
 * a placeholder it replaces on hydration and never before. That exact defect
 * shipped once and made every owner decision answer 500.
 *
 * `_previousState` is unused on purpose: these actions redirect, so there is
 * no state to thread.
 */
export async function followLineageNodeAction(
  _previousState: unknown,
  formData: FormData,
) {
  const edgeId = String(formData.get("edgeId") ?? "");
  const targetPlantObjectId = String(formData.get("targetPlantObjectId") ?? "");
  const rootPlantObjectId = String(formData.get("rootPlantObjectId") ?? "");
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      await redirectToFollowAuthIntent({
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

  await revalidateLineageInteractionPaths(rootPlantObjectId);
}

export async function askLineageQuestionAction(
  _previousState: unknown,
  formData: FormData,
) {
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
        await passportPath(rootPlantObjectId),
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

  await revalidateLineageInteractionPaths(rootPlantObjectId);
}

async function revalidateLineageInteractionPaths(rootPlantObjectId: string) {
  const normalizedRootPlantObjectId = rootPlantObjectId.trim();

  revalidatePath(LINEAGE_UPDATES_PATH);
  if (normalizedRootPlantObjectId) {
    // The passport is cached by its object tag; the legacy path this used to
    // revalidate has answered 308 since OVE-428 and cached nothing.
    revalidatePath(await passportPath(normalizedRootPlantObjectId));
    revalidatePublicCacheTags(
      [publicCacheTag.object(normalizedRootPlantObjectId)],
      "expire",
    );
  }
}

async function redirectToFollowAuthIntent({
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
    returnTo: await passportPath(rootPlantObjectId),
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
