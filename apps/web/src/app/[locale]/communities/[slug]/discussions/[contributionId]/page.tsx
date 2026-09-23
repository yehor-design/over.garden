import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import {
  PublicCommunityDiscussion,
  PublicCommunityDiscussionUnavailable,
} from "@/components/public/public-community";
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
import { readPublicCommunityDirectory } from "@/server/public-cache";
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
 *
 * It is still its own page (`OVE-500`, criterion 4): its title names the
 * entry under discussion, and its canonical is its own address — a shared
 * link says what it leads to, and never claims to be the entry.
 */
export async function generateMetadata({
  params,
}: Pick<ContributionDiscussionRouteProps, "params">): Promise<Metadata> {
  const robots = { index: false, follow: false };
  const { locale, slug, contributionId } = await params;
  if (
    !isPublicLocale(locale) ||
    !/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug) ||
    !COMMUNITY_CONTRIBUTION_ID_PATTERN.test(contributionId)
  ) {
    return { robots };
  }
  const copy = getCommunityCopy(locale);
  const canonical = communityDiscussionPath(locale, slug, contributionId);
  try {
    const contribution =
      await buildPublicCommunityContributionCommentTargetQuery(
        db,
        contributionId,
        null,
      ).executeTakeFirst();
    const title =
      contribution && contribution.communitySlug === slug
        ? copy.discussionMetaTitle(contribution.entryTitle)
        : copy.discussionUnavailableTitle;
    return {
      title: `${title} | OverGarden`,
      robots,
      alternates: { canonical },
    };
  } catch (error) {
    unstable_rethrow(error);
    return { title: copy.discussionTitle, robots, alternates: { canonical } };
  }
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
  if (!contribution || contribution.communitySlug !== slug) {
    // Removed from the community, withdrawn by its author, or hidden from
    // this reader by a block: the page says so and leads back
    // (`OVE-500`, criterion 6).
    return (
      <PublicCommunityDiscussionUnavailable
        locale={locale}
        communitySlug={slug}
        communityName={await readCommunityName(locale, slug)}
      />
    );
  }

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
    contributionId: string;
    entryTitle: string;
    entryBody: string;
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

  const excerpt = contribution.entryBody.replace(/\s+/g, " ").trim();
  const objectKind: "plant" | "animal" | null =
    contribution.objectKind === "plant" || contribution.objectKind === "animal"
      ? contribution.objectKind
      : null;
  return {
    id: contribution.contributionId,
    title: contribution.entryTitle,
    excerpt:
      excerpt.length <= 320 ? excerpt : `${excerpt.slice(0, 319).trimEnd()}…`,
    objectKind,
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

/** The community's name for the way back, from the cached directory. */
async function readCommunityName(locale: PublicLocale, slug: string) {
  try {
    const directory = await readPublicCommunityDirectory();
    const community = directory.find((item) => item.slug === slug);
    return community
      ? getCommunityContentCopy(locale, community.contentKey).name
      : null;
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
