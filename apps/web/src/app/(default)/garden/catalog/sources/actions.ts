"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  CATALOG_SOURCES_OUTCOME_ANCHOR,
  CATALOG_SOURCES_PATH,
  catalogSourcesHref,
  readCatalogSourceSlug,
  type CatalogSourcesResult,
} from "@/lib/catalog/curation-queue";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import { buildEnqueueCatalogSourceRefreshJobQuery } from "@/server/catalog-curation-repository";
import { createQueueItemForSearchMiss } from "@/server/catalog-health-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { resolveWorkspaceAdminAccess } from "@/server/workspace-access";

/** Where the misses' answer lands: the notice above that table. */
const MISSES_OUTCOME_ANCHOR = "misses-outcome";

/**
 * One button per source (ADR-0026 D10): it enqueues the refresh under an
 * idempotency key, so pressing it twice queues one job and the page says so.
 * What a refresh then does is the source task's business, not this page's.
 *
 * It comes back to the sources with what happened (`OVE-506`) — queued,
 * refused, or failed with nothing queued — where it used to answer nothing,
 * and a failed enqueue ended on the error page.
 */
export async function refreshCatalogSourceAction(
  _previousState: unknown,
  formData: FormData,
) {
  const source = readCatalogSourceSlug(formData.get("sourceSlug"));
  const admitted = await admitOwner(formData);
  if (admitted.status === "refused") return admitted.response;

  let result: CatalogSourcesResult;
  if (admitted.status !== "allowed") {
    result = admitted.status;
  } else if (!source) {
    result = "unknown-source";
  } else {
    try {
      await buildEnqueueCatalogSourceRefreshJobQuery(db, source).execute();
      result = "queued";
    } catch (error) {
      console.error("[catalog-sources] refresh enqueue failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      result = "failed";
    }
  }

  if (result === "queued") revalidatePath(CATALOG_SOURCES_PATH);
  redirect(
    catalogSourcesHref({
      result,
      source,
      hash: CATALOG_SOURCES_OUTCOME_ANCHOR,
    }),
  );
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
 * and the queue item carries the same words the miss did. The answer names
 * the item it made and links to it in the queue (`OVE-506`).
 */
export async function makeQueueItemFromMissAction(
  _previousState: unknown,
  formData: FormData,
) {
  const query = String(formData.get("queryNormalized") ?? "").trim();
  const locale = String(formData.get("locale") ?? "uk").slice(0, 12);
  const objectKind = String(formData.get("objectKind") ?? "plant").slice(0, 40);
  const admitted = await admitOwner(formData);
  if (admitted.status === "refused") return admitted.response;

  let result: CatalogSourcesResult;
  let queueItem: string | null = null;
  if (admitted.status !== "allowed") {
    result = admitted.status === "denied" ? "miss-denied" : "miss-failed";
  } else if (query.length < 1 || query.length > 120) {
    result = "miss-failed";
  } else {
    try {
      queueItem = await createQueueItemForSearchMiss(
        { queryNormalized: query, locale, objectKind },
        db,
      );
      result = queueItem ? "miss-queued" : "miss-failed";
    } catch (error) {
      console.error("[catalog-sources] search miss enqueue failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      result = "miss-failed";
    }
  }

  if (result === "miss-queued") revalidatePath(CATALOG_SOURCES_PATH);
  redirect(
    catalogSourcesHref({ result, queueItem, hash: MISSES_OUTCOME_ANCHOR }),
  );
}

type Admission =
  | { status: "allowed" }
  | { status: "denied" | "failed" }
  | { status: "refused"; response: { mutationScope: string } };

/** The owner, or why not — the queue's own rule (`queue/actions.ts`). */
async function admitOwner(formData: FormData): Promise<Admission> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      redirect(buildSignInHref({ returnTo: CATALOG_SOURCES_PATH }));
    }
    return { status: "refused", response: { mutationScope: admission.code } };
  }
  const access = await resolveWorkspaceAdminAccess(() =>
    assertAdminCapabilityForScope(admission.scope, "operator:mutate"),
  );
  if (access.status === "allowed") return { status: "allowed" };
  return { status: access.status === "denied" ? "denied" : "failed" };
}
