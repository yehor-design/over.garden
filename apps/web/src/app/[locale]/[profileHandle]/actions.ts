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
import { parsePublicHandleSyntax } from "@/server/identity-policy";
import {
  blockProfile,
  followProfile,
  reportProfile,
  unfollowProfile,
  type ProfileInteractionResult,
} from "@/server/profile-interaction-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

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
export async function followProfileAction(
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
  const handle = normalizedHandle(formData);
  const result = handle
    ? await followProfile(scope, handle)
    : ("unavailable" as const);
  finishProfileAction(formData, handle, result, "profile-follow");
}

export async function unfollowProfileAction(
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
  const handle = normalizedHandle(formData);
  const result = handle
    ? await unfollowProfile(scope, handle)
    : ("unavailable" as const);
  finishProfileAction(formData, handle, result, "profile-follow");
}

export async function reportProfileAction(
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
  const handle = normalizedHandle(formData);
  const result = handle
    ? await reportProfile(scope, handle, String(formData.get("reason") ?? ""))
    : ("unavailable" as const);
  finishProfileAction(formData, handle, result, "profile-report");
}

export async function blockProfileAction(
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
  const handle = normalizedHandle(formData);
  const result = handle
    ? await blockProfile(scope, handle)
    : ("unavailable" as const);

  if (handle) revalidateProfilePaths(handle);
  redirect(
    // A block is confirmed where the blocked list is kept: the account's
    // settings page since `OVE-503`, where it can be undone.
    result === "blocked"
      ? "/account/settings?relationshipStatus=blocked#blocked-profiles"
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
  revalidatePath("/account/settings");
}
