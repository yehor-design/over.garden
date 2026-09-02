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
import {
  addCatalogPublicSlugToWishlist,
  removeCatalogPublicSlugFromWishlist,
} from "@/server/wishlist-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

const WISHLIST_STATUS_PARAM = "wishlist";

export async function addCatalogPublicSlugToWishlistAction(formData: FormData) {
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

export async function removeCatalogPublicSlugFromWishlistAction(
  formData: FormData,
) {
  const publicSlug = normalizeCatalogPublicSlugField(
    formData.get("catalogPublicSlug"),
  );
  const locale = normalizeLocaleField(formData.get("locale"));
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    if (admission.code !== "session_required") {
      return { mutationScope: admission.code };
    }
    return redirect(
      `/garden?wishlist=${encodeURIComponent(publicSlug)}&source=wishlist`,
    );
  }

  const scope = admission.scope;
  await removeCatalogPublicSlugFromWishlist(scope, publicSlug);

  revalidateWishlistPaths(locale, publicSlug);
  const returnTo = localizedPath(locale, "/wishlist");
  redirect(withStatusParam(returnTo, "removed"));
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

function withStatusParam(path: string, status: "saved" | "removed") {
  const url = new URL(path, "https://over.garden");
  url.searchParams.set(WISHLIST_STATUS_PARAM, status);
  return `${url.pathname}${url.search}`;
}
