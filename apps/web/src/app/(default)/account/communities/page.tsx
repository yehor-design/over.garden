import type { Metadata } from "next";
import Link from "next/link";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  WorkspaceSectionError,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import {
  ModerationAreas,
  ModerationFrame,
} from "@/components/moderation/moderation-frame";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCommunityContentCopy } from "@/lib/community-copy";
import { publicCommunityPath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  fillModerationTemplate,
  getModerationCopy,
} from "@/lib/moderation-copy";
import { localizedPath } from "@/lib/public-localization";
import {
  listModeratedCommunities,
  type ModeratedCommunity,
} from "@/server/community-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

export const COMMUNITIES_MODERATION_PATH = "/account/communities";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getModerationCopy(await getRequestInterfaceLocale());
  return {
    title: copy.communities.metadataTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * The communities this reader may moderate (`OVE-500`, criterion 5): every
 * one for the owner, the assigned ones for a community's moderator. It used
 * to be one hard-coded card for `observation-and-care`, reached only by the
 * operator — so a second community had no way in, and a moderator the server
 * would let act was shown "unavailable".
 */
export default async function CommunityModerationDirectory() {
  const [locale, viewer] = await Promise.all([
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
  ]);
  const copy = getModerationCopy(locale);
  const frame = {
    locale,
    surface: "communities-moderation" as const,
    title: copy.communities.title,
    description: copy.communities.description,
    tabs: <ModerationAreas locale={locale} current="communities" />,
  };

  if (viewer.status === "unavailable") {
    return (
      <ModerationFrame {...frame} accessState="unavailable">
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          title={copy.communities.title}
          retryHref={COMMUNITIES_MODERATION_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
        />
      </ModerationFrame>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <ModerationFrame {...frame} accessState="sign-in-required" tabs={null}>
        <SignInPrompt locale={locale} next={COMMUNITIES_MODERATION_PATH} />
      </ModerationFrame>
    );
  }

  const settled = await settleSection(
    () => listModeratedCommunities(viewer.scope),
    {
      deadlineMs: workspaceSectionDeadlineMs(4),
      surface: "communities-moderation",
      section: "communities",
    },
  );

  if (settled.status === "error") {
    return (
      <ModerationFrame {...frame} accessState="unavailable">
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          title={copy.communities.title}
          retryHref={COMMUNITIES_MODERATION_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </ModerationFrame>
    );
  }
  // Nothing this reader may moderate: no access, said as such — not an
  // empty list that reads as "all quiet".
  if (settled.value === null) {
    return (
      <ModerationFrame {...frame} accessState="denied" tabs={null}>
        <Callout tone="warning" role="alert">
          <p>{copy.accessDenied}</p>
        </Callout>
      </ModerationFrame>
    );
  }

  const communities = settled.value;
  return (
    <ModerationFrame {...frame} accessState="allowed">
      {communities.length === 0 ? (
        <EmptyState title={copy.communities.empty} />
      ) : (
        <ul
          className="grid list-none gap-3"
          data-private-moderation-queue="true"
        >
          {communities.map((community) => (
            <ModeratedCommunityCard
              key={community.id}
              locale={locale}
              community={community}
            />
          ))}
        </ul>
      )}
    </ModerationFrame>
  );
}

function ModeratedCommunityCard({
  locale,
  community,
}: {
  locale: InterfaceLocale;
  community: ModeratedCommunity;
}) {
  const copy = getModerationCopy(locale);
  const name = getCommunityContentCopy(locale, community.contentKey).name;
  const titleId = `moderated-community-${community.id}`;
  const state =
    community.lifecycleState === "archived"
      ? copy.communities.states.archived
      : copy.communities.states[community.participationState];

  return (
    <Card
      as="li"
      aria-labelledby={titleId}
      data-moderated-community={community.slug}
      className="grid min-w-0 gap-2 p-4"
    >
      <h2 id={titleId} className="text-h3 break-words text-text-heading">
        <Link
          href={`${COMMUNITIES_MODERATION_PATH}/${encodeURIComponent(community.slug)}`}
          className="rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {name}
        </Link>
      </h2>
      <p className="text-body-sm text-text-secondary">{state}</p>
      <div className="flex flex-wrap items-center gap-3">
        {/* A count of zero is the absence of a fact (DESIGN.md §5.10): an
            empty queue says so in words. */}
        {community.openReportCount > 0 ? (
          <Badge tone="warning" data-moderated-community-open-reports="true">
            {fillModerationTemplate(copy.communities.openReports, {
              count: community.openReportCount,
            })}
          </Badge>
        ) : (
          <Badge tone="success">{copy.communities.noOpenReports}</Badge>
        )}
        {/* The public page has no workspace twin: its address is the
            reader's language's (`/bg/…` for Bulgarian). */}
        <Link
          href={localizedPath(locale, publicCommunityPath(community.slug))}
          className="text-link hover:text-link-hover text-body-sm underline underline-offset-4"
        >
          {copy.communities.publicPage}
        </Link>
      </div>
    </Card>
  );
}
