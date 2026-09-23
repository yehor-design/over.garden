"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  type PublicLocale,
} from "@/lib/public-localization";
import { publicEngagementChangeTags } from "@/lib/public-cache-tags";
import { shelfOutcomeHref, shelfViewPath } from "@/lib/social/shelf-view";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";
import {
  normalizeEngagementTarget,
  setEngagementBookmark,
  type EngagementTarget,
} from "@/server/engagement-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

/**
 * Removing a bookmark from the shelf, and putting it back (`OVE-456`).
 *
 * The shelf's own removal is not the public page's toggle. A toggle reads its
 * previous state from the client and flips it, which is right beside the thing
 * being bookmarked and wrong on a list *of* bookmarks: there the row is the
 * bookmark, removing it is destructive, and a destructive outcome owes the
 * reader an Undo (DESIGN.md §5.5). So these two say what they do rather than
 * flip, and the page turns the redirect they leave behind into a toast.
 *
 * Every answer comes back to the view the reader was in — its filter and its
 * page — with what happened to which row (`OVE-502`):
 *
 * - a removal or a restore names the item it changed, and a restore lands
 *   on its row;
 * - a write the database refused lands on the same row, still there, with the
 *   failure beside it; it used to escape as the shelf's error page, and the
 *   whole shelf went with it;
 * - an ended session goes to sign-in and back to this view, and nothing is
 *   written. It used to be a notice the shelf never showed.
 *
 * Both are `(previousState, formData)`, the shape `useActionState` calls and
 * the only one that gives the form a real endpoint before hydration
 * (ADR-0024 D3).
 */
export async function removeBookmarkFromShelfAction(
  _previousState: unknown,
  formData: FormData,
) {
  return setShelfBookmark(formData, "removed");
}

export async function restoreBookmarkToShelfAction(
  _previousState: unknown,
  formData: FormData,
) {
  return setShelfBookmark(formData, "active");
}

async function setShelfBookmark(
  formData: FormData,
  bookmarkState: "active" | "removed",
) {
  const target = readTargetField(formData);
  const locale = normalizeLocaleField(formData.get("locale"));
  const view = shelfViewPath("bookmarks", formData.get("returnTo"), locale);
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      redirect(buildSignInHref({ returnTo: view }));
    }
    return { mutationScope: admission.code };
  }

  let failed = false;
  try {
    await setEngagementBookmark(admission.scope, { target, bookmarkState });
  } catch (error) {
    console.error("[bookmarks] shelf write failed", {
      bookmarkState,
      kind: target.kind,
      error: error instanceof Error ? error.message : String(error),
    });
    failed = true;
  }

  if (!failed) {
    revalidatePublicCacheTags(
      publicEngagementChangeTags(target.kind, target.ref),
      "update",
    );
    revalidatePath(view.split("?")[0]!);
  }

  redirect(
    shelfOutcomeHref(view, {
      outcome: failed
        ? "failed"
        : bookmarkState === "removed"
          ? "removed"
          : "restored",
      action: bookmarkState === "removed" ? "remove" : "restore",
      target: bookmarkTargetParam(target),
    }),
  );
}

/** The target as one opaque parameter: `{kind}:{ref}`, re-checked on read. */
function bookmarkTargetParam(target: EngagementTarget) {
  return `${target.kind}:${target.ref}`;
}

function readTargetField(formData: FormData): EngagementTarget {
  return normalizeEngagementTarget(
    stringField(formData, "targetKind"),
    stringField(formData, "targetRef"),
  );
}

function stringField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function normalizeLocaleField(value: FormDataEntryValue | null): PublicLocale {
  const raw = typeof value === "string" ? value.trim() : "";
  return isPublicLocale(raw) ? raw : DEFAULT_PUBLIC_LOCALE;
}
