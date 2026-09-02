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
  contributePublicJournalToCommunity,
  reportCommunityContribution,
  setCommunityMembership,
} from "@/server/community-repository";
import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export async function setCommunityMembershipAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  const slug = communitySlug(formData);
  const state =
    String(formData.get("membershipState")) === "left" ? "left" : "active";
  let status: string;
  try {
    await setCommunityMembership(scope, { slug, state });
    status = state === "left" ? "left" : "joined";
  } catch {
    status = "unavailable";
  }
  finish(formData, slug, status, "community-membership");
}

export async function contributeJournalToCommunityAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  const slug = communitySlug(formData);
  let status: string;
  try {
    await contributePublicJournalToCommunity(scope, {
      slug,
      journalEntryId: String(formData.get("journalEntryId") ?? ""),
    });
    status = "contributed";
  } catch {
    status = "unavailable";
  }
  finish(formData, slug, status, "community-contribute");
}

export async function reportCommunityContributionAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
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
    status = "reported";
  } catch {
    status = "unavailable";
  }
  finish(formData, slug, status, "community-journals");
}

export async function blockCommunityContributionAuthorAction(
  formData: FormData,
) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  const slug = communitySlug(formData);
  let status: string;
  try {
    await blockCommunityContributionAuthor(scope, {
      slug,
      contributionId: String(formData.get("contributionId") ?? ""),
    });
    status = "blocked";
  } catch {
    status = "unavailable";
  }
  finish(formData, slug, status, "community-journals");
}

function finish(
  formData: FormData,
  slug: string,
  status: string,
  anchor: string,
): never {
  for (const locale of PUBLIC_LOCALES) {
    revalidatePath(localizedPath(locale, `/communities/${slug}`));
  }
  revalidatePath("/communities");
  const path = localizedPath(requestedLocale(formData), `/communities/${slug}`);
  const query = new URLSearchParams({ communityAction: status });
  redirect(`${path}?${query.toString()}#${anchor}`);
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
