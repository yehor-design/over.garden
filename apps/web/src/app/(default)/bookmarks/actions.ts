"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { publicEngagementChangeTags } from "@/lib/public-cache-tags";
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
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }

  await setEngagementBookmark(admission.scope, { target, bookmarkState });
  revalidatePublicCacheTags(
    publicEngagementChangeTags(target.kind, target.ref),
    "update",
  );
  revalidatePath(localizedPath(locale, "/bookmarks"));

  redirect(shelfHref(locale, bookmarkState === "removed" ? target : null));
}

/**
 * Where the shelf goes next, and what it says when it gets there.
 *
 * The removed target rides in the address rather than in a hidden field,
 * because the field is gone with the row: a redirect is the only channel a
 * form without JavaScript has back to the next document. It is a kind and a
 * reference, both re-normalised on the way in, and never a label — reflected
 * free text on a page is a habit worth not having.
 */
function shelfHref(locale: PublicLocale, undo: EngagementTarget | null) {
  const path = localizedPath(locale, "/bookmarks");
  if (!undo) return path;
  const params = new URLSearchParams({
    undoKind: undo.kind,
    undoRef: undo.ref,
  });
  return `${path}?${params}`;
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
