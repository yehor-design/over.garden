"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CURATION_OUTCOME_ANCHOR,
  CURATION_QUEUE_PATH,
  curationQueueHref,
  readCurationItemType,
  readCurationUuid,
  type CurationItemType,
  type CurationResult,
} from "@/lib/catalog/curation-queue";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { organismAddressChangeTags } from "@/lib/public-cache-tags";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import {
  applyCatalogQueueItem,
  countObjectsOnCatalogItem,
  MERGE_CONFIRMATION_OBJECT_THRESHOLD,
  readCurationActionSummary,
  readCurationQueueItemSummary,
  readQueueItemActionSubjects,
  rejectCatalogQueueItem,
  revertCatalogAction,
  skipCatalogQueueItem,
  type CurationQueueItemSummary,
} from "@/server/catalog-curation-repository";
import { announceCatalogCard } from "@/server/indexnow-public-addresses";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import type { RequestScope } from "@/server/request-scope";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";
import { resolveWorkspaceAdminAccess } from "@/server/workspace-access";

const AUTOMATIC_OUTCOME_ANCHOR = "automatic-outcome";

/**
 * The four decisions the owner makes (ADR-0026 D10). Each is a Server Action
 * reference on a real form, so the queue works before hydration; the keyboard
 * shortcuts on the page submit these same forms.
 *
 * Applying and reverting go through the SQL functions of migration `0056`, the
 * same ones the worker calls above a rule's threshold. There is no second
 * implementation of a decision.
 *
 * Each answers the way the moderation queue does (`OVE-500`): back to the view
 * it was pressed in — its filter, and the next decision — with what happened,
 * which the page reads back from the record (`OVE-506`). They used to answer
 * nothing: a refused apply threw to the error page, a decision already made
 * in another tab was silently made again or not at all, and a member's press
 * was an exception rather than a refusal.
 *
 * - `accepted` / `rejected` / `skipped` — written; the next decision is on
 *   screen, with the notice above it;
 * - `stale` — the item was no longer open, so nothing was written;
 * - `confirm` — a merge now moves more gardeners' objects than the rule
 *   allows without asking: the page asks, with the count;
 * - `failed` — nothing written; the same item stays on screen to retry;
 * - `denied` — not the owner; nothing written.
 */
export async function acceptCatalogQueueItemAction(
  _previousState: unknown,
  formData: FormData,
) {
  const view = readCurationItemType(formData.get("view"));
  const queueItemId = readCurationUuid(formData.get("queueItemId"));
  const nextItem = readCurationUuid(formData.get("nextItem"));
  const confirmed = String(formData.get("confirmMerge") ?? "") === "yes";

  const admitted = await admitOwner(formData, view, queueItemId);
  if (admitted.status === "refused") return admitted.response;

  let result: CurationResult;
  if (admitted.status !== "allowed") {
    result = admitted.status;
  } else if (!queueItemId) {
    result = "stale";
  } else {
    result = await acceptItem(admitted.scope, queueItemId, confirmed);
  }

  if (result === "accepted") revalidatePath(CURATION_QUEUE_PATH);
  redirect(decisionOutcomeHref({ view, queueItemId, nextItem, result }));
}

async function acceptItem(
  scope: RequestScope,
  queueItemId: string,
  confirmed: boolean,
): Promise<CurationResult> {
  try {
    // A merge that moves more than fifty gardener objects asks once
    // (`OVE-459` AC3). The subject is read from the item, never from the
    // form: a grant is for this item's objects, counted now.
    const item = await readCurationQueueItemSummary(queueItemId);
    // Not open: decided elsewhere — or by this very owner a moment ago, whose
    // earlier press committed and whose answer was lost; that retry is told
    // "accepted", not "already decided".
    if (!item || item.state !== "open") {
      const result = recogniseDecision(item, scope.userId, "accepted");
      if (result === "accepted") await expireCardsOfDecision(queueItemId);
      return result;
    }
    if (
      item.itemType === "node_merge" &&
      item.subjectCatalogItemId &&
      !confirmed
    ) {
      const objects = await countObjectsOnCatalogItem(
        item.subjectCatalogItemId,
      );
      if (objects > MERGE_CONFIRMATION_OBJECT_THRESHOLD) return "confirm";
    }

    const { subjectCatalogItemIds } = await applyCatalogQueueItem({
      queueItemId,
      actorUserId: scope.userId,
      automatic: false,
    });
    expireCards(subjectCatalogItemIds);
    return "accepted";
  } catch (error) {
    // The function refuses by raising: the item was decided meanwhile, or its
    // target went away. Which one is read from the record, not the message —
    // and the record also knows the case where the apply committed and only
    // the read after it failed: the item is then accepted, by this owner,
    // just now, and saying "already decided" would disown their decision.
    console.error("[catalog-queue] accept failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    const result = await settleRefusedDecision(
      queueItemId,
      scope.userId,
      "accepted",
    );
    if (result === "accepted") await expireCardsOfDecision(queueItemId);
    return result;
  }
}

/**
 * The public cards a decision changed are expired, and an indexable one is
 * announced (`announceCatalogCard`). Otherwise only the card intents the SQL
 * function records would refresh them, once a day.
 */
function expireCards(catalogItemIds: readonly string[]) {
  for (const catalogItemId of catalogItemIds) {
    revalidatePublicCacheTags(
      organismAddressChangeTags(catalogItemId),
      "expire",
    );
    announceCatalogCard(catalogItemId);
  }
}

/**
 * A recognised decision's cards. The apply function never handed them back
 * (its reply was lost), so they are read from the decision's action row —
 * best effort: a failed read leaves them to the daily card intents.
 */
async function expireCardsOfDecision(queueItemId: string) {
  const subjects = await readQueueItemActionSubjects(queueItemId).catch(
    (): string[] => [],
  );
  expireCards(subjects);
}

export async function rejectCatalogQueueItemAction(
  _previousState: unknown,
  formData: FormData,
) {
  return decideWithoutApplying(formData, "rejected");
}

export async function skipCatalogQueueItemAction(
  _previousState: unknown,
  formData: FormData,
) {
  return decideWithoutApplying(formData, "skipped");
}

async function decideWithoutApplying(
  formData: FormData,
  decision: "rejected" | "skipped",
) {
  const view = readCurationItemType(formData.get("view"));
  const queueItemId = readCurationUuid(formData.get("queueItemId"));
  const nextItem = readCurationUuid(formData.get("nextItem"));

  const admitted = await admitOwner(formData, view, queueItemId);
  if (admitted.status === "refused") return admitted.response;

  let result: CurationResult;
  if (admitted.status !== "allowed") {
    result = admitted.status;
  } else if (!queueItemId) {
    result = "stale";
  } else {
    try {
      const input = { queueItemId, actorUserId: admitted.scope.userId };
      const { changed } =
        decision === "rejected"
          ? await rejectCatalogQueueItem(input)
          : await skipCatalogQueueItem(input);
      // Nothing changed: the item was already decided — possibly by this
      // owner's own earlier press, whose answer never arrived.
      result = changed
        ? decision
        : await settleRefusedDecision(
            queueItemId,
            admitted.scope.userId,
            decision,
          );
    } catch (error) {
      // The update may have committed before the connection went: the record
      // says which.
      console.error("[catalog-queue] decision failed", {
        decision,
        error: error instanceof Error ? error.message : String(error),
      });
      result = await settleRefusedDecision(
        queueItemId,
        admitted.scope.userId,
        decision,
      );
    }
  }

  if (result === decision) revalidatePath(CURATION_QUEUE_PATH);
  redirect(decisionOutcomeHref({ view, queueItemId, nextItem, result }));
}

export async function revertCatalogActionAction(
  _previousState: unknown,
  formData: FormData,
) {
  const view = readCurationItemType(formData.get("view"));
  const item = readCurationUuid(formData.get("item"));
  const actionId = readCurationUuid(formData.get("actionId"));

  const admitted = await admitOwner(formData, view, item);
  if (admitted.status === "refused") return admitted.response;

  let result: CurationResult;
  if (admitted.status !== "allowed") {
    result = admitted.status;
  } else if (!actionId) {
    result = "stale";
  } else {
    try {
      const { subjectCatalogItemIds } = await revertCatalogAction({
        actionId,
        actorUserId: admitted.scope.userId,
      });
      expireCards(subjectCatalogItemIds);
      result = "reverted";
    } catch (error) {
      console.error("[catalog-queue] revert failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      const action = await readCurationActionSummary(actionId).catch(
        () => null,
      );
      // Undone by this owner just now: the revert committed and only the
      // read after it failed. Undone by anyone else, or earlier: stale.
      result = !action?.reverted
        ? "failed"
        : action.revertedByUserId === admitted.scope.userId &&
            decidedJustNow(action.revertedAt)
          ? "reverted"
          : "stale";
      // Recognised as this owner's own undo: its cards still need expiring.
      if (result === "reverted" && action) {
        expireCards(action.subjectCatalogItemIds);
      }
    }
  }

  if (result === "reverted") revalidatePath(CURATION_QUEUE_PATH);
  redirect(
    curationQueueHref({
      type: view,
      item,
      result,
      action: actionId,
      hash: AUTOMATIC_OUTCOME_ANCHOR,
    }),
  );
}

type Admission =
  | { status: "allowed"; scope: RequestScope }
  | { status: "denied" | "failed" }
  | { status: "refused"; response: { mutationScope: string } };

/**
 * The owner, or why not. An ended session goes to sign-in and comes back to
 * this view with nothing written. Denied only when the owner check says so:
 * a role table that cannot be read is a failure the owner may retry, not a
 * claim they lack access (`OVE-500`).
 */
async function admitOwner(
  formData: FormData,
  view: CurationItemType | null,
  item: string | null,
): Promise<Admission> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      redirect(
        buildSignInHref({ returnTo: curationQueueHref({ type: view, item }) }),
      );
    }
    return { status: "refused", response: { mutationScope: admission.code } };
  }
  const access = await resolveWorkspaceAdminAccess(() =>
    assertAdminCapabilityForScope(admission.scope, "operator:mutate"),
  );
  if (access.status === "allowed") {
    return { status: "allowed", scope: admission.scope };
  }
  return { status: access.status === "denied" ? "denied" : "failed" };
}

/** How recent "just now" is, for a decision recognising itself. */
const JUST_NOW_MS = 2 * 60_000;

function decidedJustNow(at: Date | string | null): boolean {
  if (!at) return false;
  const time = (at instanceof Date ? at : new Date(at)).getTime();
  return Number.isFinite(time) && Date.now() - time < JUST_NOW_MS;
}

/**
 * What a decision that raised actually did, read from the record: still
 * open — it failed, and the same press is the retry; decided by this owner
 * just now — it was made; decided otherwise — it was stale. An item that
 * cannot be read is treated as still open, so the owner is offered the retry
 * rather than told it was decided.
 */
async function settleRefusedDecision(
  queueItemId: string,
  userId: string,
  decided: "accepted" | "rejected" | "skipped",
): Promise<CurationResult> {
  try {
    const item = await readCurationQueueItemSummary(queueItemId);
    if (item !== null && item.state === "open") return "failed";
    return recogniseDecision(item, userId, decided);
  } catch {
    return "failed";
  }
}

/** A decided item is this owner's decision only if they made it just now. */
function recogniseDecision(
  item: CurationQueueItemSummary | null,
  userId: string,
  decided: "accepted" | "rejected" | "skipped",
): CurationResult {
  return item !== null &&
    item.state === decided &&
    item.decidedByUserId === userId &&
    decidedJustNow(item.decidedAt)
    ? decided
    : "stale";
}

/**
 * Where a decision's answer lands. After a decision the next item is on
 * screen; after a refusal or a failure the same item stays, so the retry is
 * the same press; a merge that needs asking stays with no grant.
 */
function decisionOutcomeHref(input: {
  view: CurationItemType | null;
  queueItemId: string | null;
  nextItem: string | null;
  result: CurationResult;
}) {
  const staysOnItem =
    input.result === "failed" ||
    input.result === "confirm" ||
    input.result === "denied";
  return curationQueueHref({
    type: input.view,
    item: staysOnItem ? input.queueItemId : input.nextItem,
    result: input.result,
    decided: input.queueItemId,
    hash: CURATION_OUTCOME_ANCHOR,
  });
}
