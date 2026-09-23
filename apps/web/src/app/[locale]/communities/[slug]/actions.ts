"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  localizedPath,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  blockCommunityContributionAuthor,
  communityMutationRefusal,
  contributePublicJournalToCommunity,
  reportCommunityContribution,
  setCommunityMembership,
  type CommunityMutationRefusal,
} from "@/server/community-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { publicCommunityChangeTags } from "@/lib/public-cache-tags";
import { announceCommunity } from "@/server/indexnow-public-addresses";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";
import { publicCommunityPath } from "@/lib/garden/public-paths";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** The two places on the page an action may return the reader to. */
const CONTRIBUTE_ANCHOR = "community-contribute";

/**
 * What the reader is told when the server refused (`OVE-500`, criterion 6):
 * the rule that refused, in words, and the step it points to — not one
 * "unavailable" for being a guest, a closed community and a duplicate alike.
 * Anything else — the database, a timeout — is still "unavailable", with a
 * retry.
 */
const REFUSAL_STATUS: Record<CommunityMutationRefusal, string> = {
  community_unavailable: "community_unavailable",
  participation_closed: "closed",
  membership_required: "not_member",
  membership_banned: "banned",
  entry_not_eligible: "not_eligible",
  entry_already_added: "already_added",
  entry_removed: "removed",
  moderation_denied: "unavailable",
  target_unavailable: "unavailable",
};

function refusalStatus(error: unknown) {
  const refusal = communityMutationRefusal(error);
  return refusal ? REFUSAL_STATUS[refusal] : "unavailable";
}

/**
 * Every action here is shaped `(previousState, formData)` — the shape
 * `useActionState` calls — so `OwnerScopedProgressiveForm` can hand React the
 * reference itself (`OVE-454`, ADR-0024 D3).
 *
 * The adapter form wrapped the action in a client closure, and React answers a
 * closure with `action="javascript:throw new Error('React form unexpectedly
 * submitted.')"` — a placeholder it replaces on hydration and never before. So
 * join, leave, contribute, report and block did nothing at all until the
 * bundle had run, on a page whose entire point is that a reader can act on it.
 * Nothing about what the actions *do* changes here; only how a browser reaches
 * them.
 */

export async function setCommunityMembershipAction(
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
  const slug = communitySlug(formData);
  const state =
    String(formData.get("membershipState")) === "left" ? "left" : "active";
  let status: string;
  try {
    await setCommunityMembership(scope, { slug, state });
    revalidatePublicCacheTags(publicCommunityChangeTags(slug), "update");
    announceCommunity(slug);
    status = state === "left" ? "left" : "joined";
  } catch (error) {
    status = refusalStatus(error);
  }
  // Joined from the contribution step: back to the step, with the entry the
  // reader was adding still offered first.
  const anchor =
    String(formData.get("returnAnchor") ?? "") === CONTRIBUTE_ANCHOR
      ? CONTRIBUTE_ANCHOR
      : "community-membership";
  finish(formData, slug, status, anchor, contributeEntryId(formData));
}

export async function contributeJournalToCommunityAction(
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
  const slug = communitySlug(formData);
  const journalEntryId = String(formData.get("journalEntryId") ?? "");
  let status: string;
  try {
    await contributePublicJournalToCommunity(scope, { slug, journalEntryId });
    revalidatePublicCacheTags(publicCommunityChangeTags(slug), "update");
    announceCommunity(slug);
    status = "contributed";
  } catch (error) {
    status = refusalStatus(error);
  }
  // A refusal keeps the entry chosen, so a retry is one press.
  finish(
    formData,
    slug,
    status,
    CONTRIBUTE_ANCHOR,
    status === "contributed" ? null : normalizeEntryId(journalEntryId),
  );
}

export async function reportCommunityContributionAction(
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
  const slug = communitySlug(formData);
  let status: string;
  try {
    await reportCommunityContribution(scope, {
      slug,
      contributionId: String(formData.get("contributionId") ?? ""),
      reason: communityReportReason(formData),
    });
    revalidatePublicCacheTags(publicCommunityChangeTags(slug), "update");
    announceCommunity(slug);
    status = "reported";
  } catch (error) {
    status = refusalStatus(error);
  }
  finish(formData, slug, status, "community-journals");
}

export async function blockCommunityContributionAuthorAction(
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
  const slug = communitySlug(formData);
  let status: string;
  try {
    await blockCommunityContributionAuthor(scope, {
      slug,
      contributionId: String(formData.get("contributionId") ?? ""),
    });
    revalidatePublicCacheTags(publicCommunityChangeTags(slug), "update");
    announceCommunity(slug);
    status = "blocked";
  } catch (error) {
    status = refusalStatus(error);
  }
  finish(formData, slug, status, "community-journals");
}

function finish(
  formData: FormData,
  slug: string,
  status: string,
  anchor: string,
  contributeEntry: string | null = null,
): never {
  for (const locale of PUBLIC_LOCALES) {
    revalidatePath(localizedPath(locale, publicCommunityPath(slug)));
  }
  revalidatePath("/communities");
  const path = localizedPath(
    requestedLocale(formData),
    publicCommunityPath(slug),
  );
  // The contribution step reports its own outcome in place; the page's head
  // reports the rest. Neither key is a `/q` twin key, so the community stays
  // its static document and the step reads the outcome at request time.
  const query = new URLSearchParams({
    [anchor === CONTRIBUTE_ANCHOR ? "contributeAction" : "communityAction"]:
      status,
  });
  if (contributeEntry) query.set("contribute", contributeEntry);
  redirect(`${path}?${query.toString()}#${anchor}`);
}

function contributeEntryId(formData: FormData) {
  return normalizeEntryId(String(formData.get("contribute") ?? ""));
}

function normalizeEntryId(value: string) {
  const id = value.trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

function communityReportReason(formData: FormData) {
  const value = String(formData.get("reason") ?? "");
  return value === "spam" ||
    value === "harassment" ||
    value === "privacy" ||
    value === "misinformation" ||
    value === "off_topic" ||
    value === "other"
    ? value
    : "other";
}

function communitySlug(formData: FormData) {
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : "unavailable";
}

function requestedLocale(formData: FormData): PublicLocale {
  const locale = String(formData.get("locale") ?? "");
  return isPublicLocale(locale) ? locale : DEFAULT_PUBLIC_LOCALE;
}
