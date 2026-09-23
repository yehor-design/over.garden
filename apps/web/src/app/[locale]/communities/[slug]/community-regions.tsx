import { cache, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";

import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import {
  CommunityContributionStep,
  CommunityMembershipAction,
  CommunityModeratorLink,
  CommunitySafetyActions,
  communityOutcomeTone,
} from "@/components/public/public-community";
import { Callout } from "@/components/ui/callout";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { getCommunityCopy } from "@/lib/community-copy";
import type { PublicLocale } from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  getPublicCommunityPage,
  type PublicCommunityContribution,
  type PublicCommunityPageModel,
} from "@/server/community-repository";
import { scopedToUser } from "@/server/request-scope";

/**
 * The community's request-time regions (ADR-0032 D2).
 *
 * The page is the guest's community, prerendered. Each region below is a
 * boundary whose fallback is exactly what a guest gets, and whose resolved
 * rendering takes the same box: a gardener's join or leave, their
 * contribution picker, their report and block, and the owner's moderation
 * link. The member's view of the community is read once per request and
 * shared by every region (`React.cache`).
 *
 * A failed session or member read settles to the guest's rendering, which is
 * also what the fallback already shows: the controls still reach a real
 * endpoint, and the server decides at the moment of the mutation (ADR-0024).
 */
type Query = Promise<Record<string, string | string[] | undefined>> | undefined;

interface CommunityViewer {
  member: PublicCommunityPageModel | null;
}

const GUEST: CommunityViewer = { member: null };

const readCommunityViewer = cache(
  async (slug: string, locale: PublicLocale): Promise<CommunityViewer> => {
    try {
      const session = await getCurrentSession();
      const userId = session?.user?.id;
      if (!userId) return GUEST;
      const member = await getPublicCommunityPage(slug, locale, {
        viewerScope: scopedToUser(userId, getSessionId(session)),
        query: "",
        kind: "all",
        cursor: null,
      });
      return { member };
    } catch (error) {
      unstable_rethrow(error);
      return GUEST;
    }
  },
);

async function readQuery(searchParams: Query) {
  return (await searchParams) ?? {};
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A just-published entry the composer sent back (`?contribute=`). */
function contributeEntryId(
  query: Record<string, string | string[] | undefined>,
) {
  const value = firstValue(query.contribute).trim().toLowerCase();
  return UUID_PATTERN.test(value) ? value : null;
}

export async function CommunityIntentFocus({
  searchParams,
}: {
  searchParams: Query;
}) {
  const query = await readQuery(searchParams);
  return (
    <AuthIntentFocus
      action={normalizeAuthIntentResumeAction(query.authIntent)}
      control={normalizeAuthIntentResumeControl(query.authControl)}
    />
  );
}

export async function CommunityViewerMembership({
  locale,
  community,
  communityPath,
  searchParams,
}: {
  locale: PublicLocale;
  community: PublicCommunityPageModel;
  communityPath: string;
  searchParams: Query;
}) {
  const [{ member }, query] = await Promise.all([
    readCommunityViewer(community.slug, locale),
    readQuery(searchParams),
  ]);
  return (
    <CommunityMembershipAction
      locale={locale}
      community={member ?? community}
      viewer={member ? "member" : "guest"}
      communityPath={communityPath}
      resumeAction={normalizeAuthIntentResumeAction(query.authIntent)}
      resumeControl={normalizeAuthIntentResumeControl(query.authControl)}
    />
  );
}

export async function CommunityViewerStatus({
  locale,
  searchParams,
}: {
  locale: PublicLocale;
  searchParams: Query;
}) {
  const query = await readQuery(searchParams);
  const status = firstValue(query.communityAction);
  const message = status
    ? getCommunityCopy(locale).actionMessages[status]
    : null;
  return message ? (
    <Callout
      tone={communityOutcomeTone(status)}
      role="status"
      data-community-action={status}
    >
      {message}
    </Callout>
  ) : null;
}

/**
 * The contribution step, for this reader (`OVE-500`, criterion 2). Its
 * fallback is the guest's step — sign in to add an entry — which is also what
 * a failed session or member read settles to.
 */
export async function CommunityViewerContribution({
  locale,
  community,
  communityPath,
  searchParams,
}: {
  locale: PublicLocale;
  community: PublicCommunityPageModel;
  communityPath: string;
  searchParams: Query;
}) {
  const [{ member }, query] = await Promise.all([
    readCommunityViewer(community.slug, locale),
    readQuery(searchParams),
  ]);
  return (
    <CommunityContributionStep
      locale={locale}
      community={member ?? community}
      viewer={member ? "member" : "guest"}
      communityPath={communityPath}
      freshEntryId={contributeEntryId(query)}
      outcome={firstValue(query.contributeAction) || null}
    />
  );
}

export async function CommunityViewerSafety({
  locale,
  community,
  item,
  communityPath,
  searchParams,
}: {
  locale: PublicLocale;
  community: PublicCommunityPageModel;
  item: PublicCommunityContribution;
  communityPath: string;
  searchParams: Query;
}): Promise<ReactNode> {
  const [{ member }, query] = await Promise.all([
    readCommunityViewer(community.slug, locale),
    readQuery(searchParams),
  ]);
  const resumeAction = normalizeAuthIntentResumeAction(query.authIntent);
  const resumeControl = normalizeAuthIntentResumeControl(query.authControl);
  if (!member) {
    return (
      <CommunitySafetyActions
        locale={locale}
        item={item}
        viewer="guest"
        community={community}
        communityPath={communityPath}
        resumeAction={resumeAction}
        resumeControl={resumeControl}
      />
    );
  }
  // The member's own reading of the list leaves out anyone a block stands
  // between; there is nothing to report or block about them again.
  const own = member.contributions.items.find(
    (candidate) => candidate.id === item.id,
  );
  if (!own) return null;
  return (
    <CommunitySafetyActions
      locale={locale}
      item={own}
      viewer="member"
      community={member}
      communityPath={communityPath}
      resumeAction={resumeAction}
      resumeControl={resumeControl}
    />
  );
}

export async function CommunityViewerModerator({
  locale,
  slug,
}: {
  locale: PublicLocale;
  slug: string;
}) {
  const { member } = await readCommunityViewer(slug, locale);
  return member?.viewer.isModerator ? (
    <CommunityModeratorLink locale={locale} slug={slug} />
  ) : null;
}
