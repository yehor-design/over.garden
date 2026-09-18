import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { PublicCommunityDiscussion } from "@/components/public/public-community";
import { Callout } from "@/components/ui/callout";
import { db } from "@/db";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import {
  getCommunityContentCopy,
  getCommunityCopy,
} from "@/lib/community-copy";
import {
  isPublicLocale,
  type PublicLocale,
} from "@/lib/public-localization";
import { communityDiscussionPath } from "@/lib/public-community-view";
import {
  publicJournalEntryAddress,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  buildPublicCommunityContributionCommentTargetQuery,
  getEngagementCommentThread,
} from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";

interface ContributionDiscussionRouteProps {
  params: Promise<{ locale: string; slug: string; contributionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};
const COMMUNITY_CONTRIBUTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A discussion is not a page a search engine should hold (ADR-0022 D4): the
 * entry it is about is the indexable thing, and this is the conversation
 * beside it. Unchanged by `OVE-454`, and deliberately so.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

export default async function ContributionDiscussionRoute({
  params,
  searchParams,
}: ContributionDiscussionRouteProps) {
  const [{ locale, slug, contributionId }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
  ]);
  if (
    !isPublicLocale(locale) ||
    !/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug) ||
    !COMMUNITY_CONTRIBUTION_ID_PATTERN.test(contributionId)
  ) {
    return notFound();
  }
  const session = await getCurrentSession();
  const viewerScope = session?.user?.id
    ? scopedToUser(session.user.id, getSessionId(session))
    : null;
  const contribution = await buildPublicCommunityContributionCommentTargetQuery(
    db,
    contributionId,
    viewerScope,
  ).executeTakeFirst();
  if (!contribution || contribution.communitySlug !== slug) return notFound();

  const copy = getCommunityCopy(locale);
  const communityName = getCommunityContentCopy(
    locale,
    contribution.communityContentKey,
  ).name;
  const entry = describeDiscussedEntry(locale, contribution);

  if (contribution.discussionState !== "open") {
    return (
      <PublicCommunityDiscussion
        locale={locale}
        communitySlug={slug}
        communityName={communityName}
        entry={entry}
      >
        <Callout tone="info" role="status">
          {copy.discussionClosed}
        </Callout>
      </PublicCommunityDiscussion>
    );
  }

  const target = {
    kind: "community_contribution" as const,
    ref: contributionId,
  };
  const thread = await getEngagementCommentThread(target, viewerScope, {
    commentCursor: first(query.cursor),
  });

  return (
    <PublicCommunityDiscussion
      locale={locale}
      communitySlug={slug}
      communityName={communityName}
      entry={entry}
    >
      <PublicEngagementPanel
        isAuthenticated={Boolean(viewerScope)}
        locale={locale}
        target={target}
        summary={thread}
        returnTo={communityDiscussionPath(locale, slug, contributionId)}
        commentOnly
        resumeAction={normalizeAuthIntentResumeAction(query.authIntent)}
        resumeControl={normalizeAuthIntentResumeControl(query.authControl)}
      />
    </PublicCommunityDiscussion>
  );
}

/**
 * The entry the thread hangs from, as the header shows it.
 *
 * Every field comes from the one target query the page already ran — the
 * visibility joins there are the community listing's, so an entry this page
 * names is one the reader can already open.
 */
function describeDiscussedEntry(
  locale: PublicLocale,
  contribution: {
    entryTitle: string;
    entryPublicSlug: string | null;
    entryNumber: number | null;
    entryDate: Date | string;
    objectDisplayName: string;
    objectKind: string;
    authorHandle: string | null;
    authorDisplayName: string | null;
    addressHandle: string;
  },
) {
  const publicSlug = contribution.entryPublicSlug?.trim();
  if (!publicSlug) return null;
  const date =
    contribution.entryDate instanceof Date
      ? contribution.entryDate
      : new Date(contribution.entryDate);
  const handle = contribution.authorHandle?.trim() || null;

  return {
    title: contribution.entryTitle,
    href: publicJournalEntryAddress({
      authorHandle: contribution.addressHandle,
      entryNumber: contribution.entryNumber,
      publicSlug,
    }),
    authorLabel: handle
      ? contribution.authorDisplayName?.trim() || `@${handle}`
      : null,
    authorHref: handle ? publicProfilePath(locale, handle) : null,
    dateTime: Number.isNaN(date.getTime())
      ? undefined
      : date.toISOString().slice(0, 10),
    dateLabel: Number.isNaN(date.getTime())
      ? ""
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date),
    objectLabel: contribution.objectDisplayName,
  };
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
