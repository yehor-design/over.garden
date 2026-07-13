"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { localizedPath, PUBLIC_LOCALES } from "@/lib/public-localization";
import { resolveVisualCommunityScenario } from "@/lib/visual-fixtures/community-scenarios";
import { requireCurrentRequestScope } from "@/server/auth-session";
import {
  moderateCommunityContribution,
  moderateCommunityDiscussion,
  moderateCommunityMembership,
  resolveCommunityReport,
  setCommunityParticipation,
} from "@/server/community-repository";
import { scopedToUser } from "@/server/request-scope";
import { resolveVisualCommunityMutationActor } from "@/server/visual-fixtures/community-actor";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const MODERATION_REASONS = new Set([
  "spam",
  "harassment",
  "privacy",
  "misinformation",
  "off_topic",
  "rule_violation",
  "other",
]);

export async function moderateCommunityContributionAction(formData: FormData) {
  const scope = await moderationScope(formData);
  const slug = communitySlug(formData);
  let status: string;
  try {
    const result = await moderateCommunityContribution(scope, {
      slug,
      contributionId: String(formData.get("contributionId") ?? ""),
      state:
        String(formData.get("contributionState")) === "active"
          ? "active"
          : "removed",
      reason: moderationReason(formData),
    });
    status = result.state;
  } catch {
    status = "unavailable";
  }
  finish(formData, slug, status);
}

export async function moderateCommunityDiscussionAction(formData: FormData) {
  const scope = await moderationScope(formData);
  const slug = communitySlug(formData);
  let status: string;
  try {
    const result = await moderateCommunityDiscussion(scope, {
      slug,
      contributionId: String(formData.get("contributionId") ?? ""),
      state:
        String(formData.get("discussionState")) === "open" ? "open" : "closed",
      reason: moderationReason(formData),
    });
    status = result.state;
  } catch {
    status = "unavailable";
  }
  finish(formData, slug, status);
}

export async function moderateCommunityMembershipAction(formData: FormData) {
  const scope = await moderationScope(formData);
  const slug = communitySlug(formData);
  let status: string;
  try {
    const result = await moderateCommunityMembership(scope, {
      slug,
      membershipId: String(formData.get("membershipId") ?? ""),
      state:
        String(formData.get("membershipState")) === "active"
          ? "active"
          : "banned",
      reason: moderationReason(formData),
    });
    status = result.state;
  } catch {
    status = "unavailable";
  }
  finish(formData, slug, status);
}

export async function resolveCommunityReportAction(formData: FormData) {
  const scope = await moderationScope(formData);
  const slug = communitySlug(formData);
  let status: string;
  try {
    const result = await resolveCommunityReport(scope, {
      slug,
      reportId: String(formData.get("reportId") ?? ""),
      state:
        String(formData.get("reportState")) === "dismissed"
          ? "dismissed"
          : "actioned",
      reason: moderationReason(formData),
    });
    status = result.state;
  } catch {
    status = "unavailable";
  }
  finish(formData, slug, status);
}

export async function setCommunityParticipationAction(formData: FormData) {
  const scope = await moderationScope(formData);
  const slug = communitySlug(formData);
  let status: string;
  try {
    const result = await setCommunityParticipation(scope, {
      slug,
      state:
        String(formData.get("participationState")) === "open"
          ? "open"
          : "closed",
      reason: moderationReason(formData),
    });
    status = result.state;
  } catch {
    status = "unavailable";
  }
  finish(formData, slug, status);
}

function finish(formData: FormData, slug: string, status: string): never {
  revalidatePath(`/admin/communities/${slug}`);
  revalidatePath("/admin/communities");
  for (const locale of PUBLIC_LOCALES) {
    revalidatePath(localizedPath(locale, "/communities"));
    revalidatePath(localizedPath(locale, `/communities/${slug}`));
  }
  revalidatePath("/", "layout");
  const query = new URLSearchParams({ moderationAction: status });
  const scenario = resolveVisualCommunityScenario(
    String(formData.get("visualCommunity") ?? ""),
  );
  if (scenario?.communitySlug === slug && scenario.actorRole === "moderator") {
    query.set("visualCommunity", scenario.id);
  }
  redirect(`/admin/communities/${slug}?${query.toString()}#moderation-queue`);
}

async function moderationScope(formData: FormData) {
  const visualActor = resolveVisualCommunityMutationActor(formData);
  return visualActor?.scenario.actorRole === "moderator"
    ? scopedToUser(visualActor.actorId)
    : requireCurrentRequestScope();
}

function communitySlug(formData: FormData) {
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : "unavailable";
}

function moderationReason(formData: FormData) {
  const reason = String(formData.get("reason") ?? "");
  return (MODERATION_REASONS.has(reason) ? reason : "other") as
    | "spam"
    | "harassment"
    | "privacy"
    | "misinformation"
    | "off_topic"
    | "rule_violation"
    | "other";
}
