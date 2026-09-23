"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { localizedPath, PUBLIC_LOCALES } from "@/lib/public-localization";
import {
  communityMutationRefusal,
  moderateCommunityContribution,
  moderateCommunityDiscussion,
  moderateCommunityMembership,
  resolveCommunityReport,
  setCommunityParticipation,
} from "@/server/community-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import type { RequestScope } from "@/server/request-scope";
import { publicCommunityPath } from "@/lib/garden/public-paths";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODERATION_REASONS = new Set([
  "spam",
  "harassment",
  "privacy",
  "misinformation",
  "off_topic",
  "rule_violation",
  "other",
]);

type ModerationResult = "done" | "stale" | "failed" | "denied";

/**
 * Every moderation action is `(previousState, formData)` — the shape
 * `useActionState` calls, and the one that lets `OwnerScopedProgressiveForm`
 * hand React a Server Action reference rather than a client closure. A closure
 * renders `action="javascript:throw …"` until the bundle arrives, so the
 * control the owner pressed did nothing (ADR-0024 D3, `OVE-456`).
 *
 * `OVE-500` changes what they report, not what they do:
 *
 * - **Who may act is the repository's one rule** — an active assignment to
 *   this community, or the owner — asked inside the same transaction as the
 *   change. The operator-only pre-check that stood in front of it refused a
 *   community's own moderator the server would have let act.
 * - **They come back to where the owner was**: the same view of the queue,
 *   the same report, with an outcome the page reads back from the record —
 *   `done`, `stale` (somebody got there first), `denied` or `failed`, which
 *   changed nothing and is safe to press again.
 * - A forged form from somebody who may not moderate changes nothing and
 *   lands on the page that says so.
 */
export async function moderateCommunityContributionAction(
  _previousState: unknown,
  formData: FormData,
) {
  return runModeration(formData, (scope, slug) =>
    moderateCommunityContribution(scope, {
      slug,
      contributionId: field(formData, "contributionId"),
      state:
        field(formData, "contributionState") === "active"
          ? "active"
          : "removed",
      reason: moderationReason(formData),
    }),
  );
}

export async function moderateCommunityDiscussionAction(
  _previousState: unknown,
  formData: FormData,
) {
  return runModeration(formData, (scope, slug) =>
    moderateCommunityDiscussion(scope, {
      slug,
      contributionId: field(formData, "contributionId"),
      state: field(formData, "discussionState") === "open" ? "open" : "closed",
      reason: moderationReason(formData),
    }),
  );
}

export async function moderateCommunityMembershipAction(
  _previousState: unknown,
  formData: FormData,
) {
  return runModeration(formData, (scope, slug) =>
    moderateCommunityMembership(scope, {
      slug,
      membershipId: field(formData, "membershipId"),
      state:
        field(formData, "membershipState") === "active" ? "active" : "banned",
      reason: moderationReason(formData),
    }),
  );
}

export async function resolveCommunityReportAction(
  _previousState: unknown,
  formData: FormData,
) {
  return runModeration(formData, (scope, slug) =>
    resolveCommunityReport(scope, {
      slug,
      reportId: field(formData, "reportId"),
      state:
        field(formData, "reportState") === "dismissed"
          ? "dismissed"
          : "actioned",
      reason: moderationReason(formData),
    }),
  );
}

export async function setCommunityParticipationAction(
  _previousState: unknown,
  formData: FormData,
) {
  return runModeration(
    formData,
    (scope, slug) =>
      setCommunityParticipation(scope, {
        slug,
        state:
          field(formData, "participationState") === "open" ? "open" : "closed",
        reason: moderationReason(formData),
      }),
    "settings",
  );
}

async function runModeration(
  formData: FormData,
  run: (scope: RequestScope, slug: string) => Promise<unknown>,
  page: "reports" | "settings" = "reports",
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const slug = communitySlug(formData);
  let result: ModerationResult;
  try {
    await run(admission.scope, slug);
    result = "done";
  } catch (error) {
    const refusal = communityMutationRefusal(error);
    result =
      refusal === "moderation_denied"
        ? "denied"
        : refusal === "target_unavailable"
          ? "stale"
          : "failed";
  }
  if (result === "done") revalidateCommunity(slug);
  redirectToOutcome(formData, slug, result, page);
}

function revalidateCommunity(slug: string) {
  revalidatePath(`/account/communities/${slug}`);
  revalidatePath("/account/communities");
  for (const locale of PUBLIC_LOCALES) {
    revalidatePath(localizedPath(locale, "/communities"));
    revalidatePath(localizedPath(locale, publicCommunityPath(slug)));
  }
  revalidatePath("/", "layout");
}

function redirectToOutcome(
  formData: FormData,
  slug: string,
  result: ModerationResult,
  page: "reports" | "settings",
): never {
  const base = `/account/communities/${slug}`;
  if (page === "settings") {
    redirect(`${base}/settings?${new URLSearchParams({ result })}`);
  }
  const query = new URLSearchParams();
  if (field(formData, "view") === "resolved") query.set("view", "resolved");
  const reportId = field(formData, "reportId").trim().toLowerCase();
  if (UUID_PATTERN.test(reportId)) query.set("report", reportId);
  query.set("result", result);
  // The report's own card while it is still in this view; the page puts the
  // outcome above the list, and focuses it, when the action moved it out.
  redirect(
    `${base}?${query.toString()}#${
      UUID_PATTERN.test(reportId) ? `report-${reportId}` : "moderation-queue"
    }`,
  );
}

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function communitySlug(formData: FormData) {
  const slug = field(formData, "slug").trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : "unavailable";
}

function moderationReason(formData: FormData) {
  const reason = field(formData, "reason");
  return (MODERATION_REASONS.has(reason) ? reason : "other") as
    | "spam"
    | "harassment"
    | "privacy"
    | "misinformation"
    | "off_topic"
    | "rule_violation"
    | "other";
}
