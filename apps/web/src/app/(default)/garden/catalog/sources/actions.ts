"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import { buildEnqueueCatalogSourceRefreshJobQuery } from "@/server/catalog-curation-repository";
import { createQueueItemForSearchMiss } from "@/server/catalog-health-repository";
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

/**
 * A search miss the owner decided to act on (OVE-398, ADR-0026 D12).
 *
 * The list of what gardeners looked for and did not find is only worth having
 * if acting on one is a single movement. This creates the `label_link` item
 * the queue already knows how to decide, and marks the miss resolved so the
 * owner is never put back on work they finished.
 *
 * The miss is a normalized query and nothing else: no gardener is named by it,
 * and the queue item carries the same words the miss did.
 */
export async function makeQueueItemFromMissAction(
  _previousState: unknown,
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
  });
  if (admission.status === "rejected") return { mutationScope: admission.code };
  await assertAdminCapabilityForScope(admission.scope, "operator:mutate");

  const query = String(formData.get("queryNormalized") ?? "").trim();
  const locale = String(formData.get("locale") ?? "uk").slice(0, 12);
  const objectKind = String(formData.get("objectKind") ?? "plant").slice(0, 40);
  if (query.length < 1 || query.length > 120) return { error: "unknown_miss" };

  await createQueueItemForSearchMiss(
    { queryNormalized: query, locale, objectKind },
    db,
  );
  revalidatePath(SOURCES_PATH);
}
