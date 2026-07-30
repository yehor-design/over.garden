import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { db } from "@/db";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { isPublicLocale, localizedPath } from "@/lib/public-localization";
import { getCommunityCopy } from "@/lib/community-copy";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  buildPublicCommunityContributionCommentTargetQuery,
  getEngagementCommentThread,
} from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";

export const dynamic = "force-dynamic";

interface ContributionDiscussionRouteProps {
  params: Promise<{ locale: string; slug: string; contributionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};
const COMMUNITY_CONTRIBUTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  if (contribution.discussionState !== "open") {
    const copy = getCommunityCopy(locale);
    return (
      <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-5 sm:px-6">
        <p className="text-sm text-muted-foreground" role="status">
          {copy.discussionClosed}
        </p>
        <Link
          href={localizedPath(locale, `/communities/${slug}`)}
          className={buttonVariants({ variant: "outline", className: "w-fit" })}
        >
          {copy.backToCommunity}
        </Link>
      </main>
    );
  }

  const target = { kind: "community_contribution" as const, ref: contributionId };
  const thread = await getEngagementCommentThread(target, viewerScope, {
    commentCursor: first(query.cursor),
  });
  const returnTo = localizedPath(
    locale,
    `/communities/${slug}/discussions/${contributionId}`,
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col px-4 py-5 sm:px-6">
      <PublicEngagementPanel
        isAuthenticated={Boolean(viewerScope)}
        locale={locale}
        target={target}
        summary={thread}
        returnTo={returnTo}
        commentOnly
        status={first(query.engagement) || null}
        resumeAction={normalizeAuthIntentResumeAction(query.authIntent)}
        resumeControl={normalizeAuthIntentResumeControl(query.authControl)}
      />
    </main>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
