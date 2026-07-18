"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { publicProfilePath } from "@/lib/garden/public-paths";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import { requireCurrentRequestScope } from "@/server/auth-session";
import { parsePublicHandleSyntax } from "@/server/identity-policy";
import {
  blockProfile,
  followProfile,
  reportProfile,
  unfollowProfile,
  type ProfileInteractionResult,
} from "@/server/profile-interaction-repository";

export async function followProfileAction(formData: FormData): Promise<void> {
  const scope = await requireCurrentRequestScope();
  const handle = normalizedHandle(formData);
  const result = handle
    ? await followProfile(scope, handle)
    : ("unavailable" as const);
  finishProfileAction(formData, handle, result, "profile-follow");
}

export async function unfollowProfileAction(formData: FormData): Promise<void> {
  const scope = await requireCurrentRequestScope();
  const handle = normalizedHandle(formData);
  const result = handle
    ? await unfollowProfile(scope, handle)
    : ("unavailable" as const);
  finishProfileAction(formData, handle, result, "profile-follow");
}

export async function reportProfileAction(formData: FormData): Promise<void> {
  const scope = await requireCurrentRequestScope();
  const handle = normalizedHandle(formData);
  const result = handle
    ? await reportProfile(scope, handle, String(formData.get("reason") ?? ""))
    : ("unavailable" as const);
  finishProfileAction(formData, handle, result, "profile-report");
}

export async function blockProfileAction(formData: FormData): Promise<void> {
  const scope = await requireCurrentRequestScope();
  const handle = normalizedHandle(formData);
  const result = handle
    ? await blockProfile(scope, handle)
    : ("unavailable" as const);

  if (handle) revalidateProfilePaths(handle);
  redirect(
    result === "blocked"
      ? "/garden/profile?relationshipStatus=blocked#blocked-profiles"
      : profileActionHref(
          requestedLocale(formData),
          handle,
          result,
          "profile-block",
        ),
  );
}

function finishProfileAction(
  formData: FormData,
  handle: string | null,
  result: ProfileInteractionResult,
  anchor: string,
) {
  if (handle) revalidateProfilePaths(handle);
  redirect(
    profileActionHref(requestedLocale(formData), handle, result, anchor),
  );
}

function profileActionHref(
  locale: PublicLocale,
  handle: string | null,
  result: ProfileInteractionResult,
  anchor: string,
) {
  const path = publicProfilePath(locale, handle ?? "unavailable");
  const params = new URLSearchParams({ profileAction: result });
  return `${path}?${params.toString()}#${anchor}`;
}

function requestedLocale(formData: FormData): PublicLocale {
  const value = String(formData.get("locale") ?? "");
  return isPublicLocale(value) ? value : DEFAULT_PUBLIC_LOCALE;
}

function normalizedHandle(formData: FormData) {
  const parsed = parsePublicHandleSyntax(String(formData.get("handle") ?? ""));
  return parsed.ok ? parsed.handle : null;
}

function revalidateProfilePaths(handle: string) {
  for (const locale of PUBLIC_LOCALES) {
    revalidatePath(publicProfilePath(locale, handle));
  }
  revalidatePath("/garden/profile");
}
