"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import { buildEnqueueCatalogSourceRefreshJobQuery } from "@/server/catalog-curation-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

const SOURCES_PATH = "/garden/catalog/sources";

/**
 * One button per source (ADR-0026 D10): it enqueues the refresh under an
 * idempotency key, so pressing it twice queues one job and the page says so.
 * What a refresh then does is the source task's business, not this page's.
 */
export async function refreshCatalogSourceAction(
  _previousState: unknown,
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
  });
  if (admission.status === "rejected") return { mutationScope: admission.code };
  await assertAdminCapabilityForScope(admission.scope, "operator:mutate");

  const sourceSlug = String(formData.get("sourceSlug") ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(sourceSlug)) {
    return { error: "unknown_source" };
  }

  await buildEnqueueCatalogSourceRefreshJobQuery(db, sourceSlug).execute();
  revalidatePath(SOURCES_PATH);
}
