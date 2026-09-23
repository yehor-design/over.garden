"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { publicVarietyPath } from "@/lib/garden/public-paths";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import {
  shelfOutcomeHref,
  shelfViewPath,
  type ShelfAction,
} from "@/lib/social/shelf-view";
import {
  addCatalogItemToWishlist,
  addCatalogPublicSlugToWishlist,
  removeWishlistCatalogItem,
} from "@/server/wishlist-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

const WISHLIST_STATUS_PARAM = "wishlist";

/**
 * `(previousState, formData)` because `OwnerScopedProgressiveForm` passes the
 * reference straight through to `useActionState`, which is what gives the
 * form a real endpoint and lets it submit before the bundle runs (ADR-0024
 * D3). The first argument is the previous result and is unused: this action
 * redirects rather than returning state.
 */
export async function addCatalogPublicSlugToWishlistAction(
  _previousState: unknown,
  formData: FormData,
) {
  const publicSlug = normalizeCatalogPublicSlugField(
    formData.get("catalogPublicSlug"),
  );
  const locale = normalizeLocaleField(formData.get("locale"));
  const returnTo = normalizeReturnToField(
    formData.get("returnTo"),
    publicSlug,
    locale,
  );
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    if (admission.code !== "session_required") {
      return { mutationScope: admission.code };
    }
    return redirect(
      `/garden?wishlist=${encodeURIComponent(publicSlug)}&returnTo=${encodeURIComponent(
        returnTo,
      )}&source=wishlist`,
    );
  }

  const scope = admission.scope;
  const result = await addCatalogPublicSlugToWishlist(scope, {
    publicSlug,
    sourceSurface: "public_variety",
  });

  revalidateWishlistPaths(locale, result.item.catalog.publicSlug);
  redirect(withStatusParam(returnTo, "saved"));
}

/**
 * Taking one off the list, and putting it back (`OVE-456`, `OVE-502`).
 *
 * Both go by the catalogue item's id, not its public slug: the slug went
 * through the catalogue's offered items, so an item the catalogue had since
 * retired could not be removed at all. Both come back to the view the reader
 * was in with what happened to which row, like the bookmark shelf:
 *
 * - a removal names what it removed, with an Undo;
 * - a write the database refused lands on the row, still there, with the
 *   failure beside it, instead of taking the shelf down;
 * - an ended session goes to sign-in and back to the shelf. It used to be
 *   sent to `/garden?wishlist=…` — the flow that *adds* an item.
 */
export async function removeWishlistItemAction(
  _previousState: unknown,
  formData: FormData,
) {
  return setWishlistItem(formData, "remove");
}

export async function restoreWishlistItemAction(
  _previousState: unknown,
  formData: FormData,
) {
  return setWishlistItem(formData, "restore");
}

async function setWishlistItem(formData: FormData, action: ShelfAction) {
  const catalogItemId = normalizeCatalogItemIdField(
    formData.get("catalogItemId"),
  );
  const locale = normalizeLocaleField(formData.get("locale"));
  const view = shelfViewPath("wishlist", formData.get("returnTo"), locale);
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
    if (action === "remove") {
      await removeWishlistCatalogItem(admission.scope, catalogItemId);
    } else {
      await addCatalogItemToWishlist(admission.scope, {
        catalogItemId,
        sourceSurface: "catalog_item",
      });
    }
  } catch (error) {
    console.error("[wishlist] shelf write failed", {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    failed = true;
  }

  if (!failed) revalidateWishlistPaths(locale, null);
  redirect(
    shelfOutcomeHref(view, {
      outcome: failed ? "failed" : action === "remove" ? "removed" : "restored",
      action,
      target: catalogItemId,
    }),
  );
}

function revalidateWishlistPaths(
  locale: PublicLocale,
  publicSlug: string | null,
) {
  revalidatePath(localizedPath(locale, "/wishlist"));
  revalidatePath("/garden");

  if (publicSlug) {
    revalidatePath(publicVarietyPath(publicSlug));
  }
}

function normalizeCatalogPublicSlugField(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) || raw.length > 96) {
    throw new Error("Wishlist catalog item is not available.");
  }
  return raw;
}

function normalizeLocaleField(value: FormDataEntryValue | null): PublicLocale {
  const raw = typeof value === "string" ? value.trim() : "";
  return isPublicLocale(raw) ? raw : DEFAULT_PUBLIC_LOCALE;
}

function normalizeReturnToField(
  value: FormDataEntryValue | null,
  publicSlug: string,
  locale: PublicLocale,
) {
  const raw = typeof value === "string" ? value.trim() : "";
  const fallback = publicSlug
    ? publicVarietyPath(publicSlug)
    : localizedPath(locale, "/wishlist");
  return normalizeInternalReturnPath(raw, fallback);
}

function withStatusParam(path: string, status: "saved") {
  const url = new URL(path, "https://over.garden");
  url.searchParams.set(WISHLIST_STATUS_PARAM, status);
  return `${url.pathname}${url.search}`;
}

function normalizeCatalogItemIdField(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(raw)
  ) {
    throw new Error("Wishlist catalog item is not available.");
  }
  return raw;
}
