import { ChatCircleIcon as MessageCircle } from "@/components/icons/ChatCircle";
import { NotePencilIcon as NotePencil } from "@/components/icons/NotePencil";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { ShieldCheckIcon as ShieldCheck } from "@/components/icons/ShieldCheck";
import { MagnifyingGlassIcon as Search } from "@/components/icons/MagnifyingGlass";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import { UsersIcon as UsersRound } from "@/components/icons/Users";

import {
  blockCommunityContributionAuthorAction,
  contributeJournalToCommunityAction,
  reportCommunityContributionAction,
  setCommunityMembershipAction,
} from "@/app/[locale]/communities/[slug]/actions";
import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { SignInIcon as SignIn } from "@/components/icons/SignIn";
import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { ActionOutcomeNotice } from "@/components/ui/action-outcome-notice";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard } from "@/components/ui/entry-card";
import { Field } from "@/components/ui/field";
import { getFilterBarChromeCopy } from "@/lib/filter-bar-copy";
import { FilterBar } from "@/components/ui/filter-bar";
import { HiddenField } from "@/components/ui/hidden-field";
import NextLink from "next/link";
import type { ReactNode } from "react";

import { Link } from "@/components/ui/link";
import { MediaFigure } from "@/components/ui/media-figure";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  buildAuthIntentAnchor,
  type AuthIntentAction,
} from "@/lib/auth/auth-intent-contract";
import {
  getCommunityContentCopy,
  getCommunityCopy,
  type CommunityCopy,
} from "@/lib/community-copy";
import { resolveIllustration } from "@/lib/illustrations";
import { localizeTopicLabel } from "@/lib/system-topic-labels";
import {
  publicCommunityDiscussionPath,
  publicCommunityPath,
  publicTopicPath,
} from "@/lib/garden/public-paths";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import { publicCardMediaAltText } from "@/lib/public-media-alt";
import {
  buildCommunityRemovalHref,
  buildPublicCommunityHref,
  communityBasePath,
  communityFacts,
  isFirstRunCommunity,
  PUBLIC_COMMUNITY_OBJECT_KINDS,
  type PublicCommunityViewRequest,
} from "@/lib/public-community-view";
import {
  contentLanguageAttribute,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import type {
  PublicCommunityContribution,
  PublicCommunityContributor,
  PublicCommunityDirectoryItem,
  PublicCommunityPageModel,
} from "@/server/community-repository";

/**
 * The community family (`OVE-454`): a list, a community, and the shape a
 * discussion hangs in.
 *
 * Three decisions here are the task, and each replaces something that was on
 * the screen before:
 *
 * - **A count of zero is not shown.** The one community on the site rendered
 *   `0 Записи · 0 Живі об'єкти · 0 Учасники` as its entire card footer, which
 *   told a visitor only that nothing was happening. `communityFacts` returns
 *   what a community *has*; when it has nothing, the card says what it is —
 *   its topic and that it is open — because a community with no photographs is
 *   type and structure, not filler (ADR-0031 D3).
 * - **An empty community is one state, not a stack of empty sections.** No
 *   filter bar over nothing, no "Записи · 0" heading, no contribution picker
 *   with an empty select: one `empty-first-run` with one action, and the rules
 *   a first contributor is agreeing to.
 * - **The rules are on the page.** They used to be `xl:hidden` — so above
 *   `xl`, where the rail took them, the community page itself carried no rules
 *   at all. They are a `Section` at every width now, and the rail carries the
 *   thing a rail is for: other communities (Digg's "Discover Communities").
 *
 * And the one that does not show: every form here is an
 * `OwnerScopedProgressiveForm`, so join, leave, contribute, report and block
 * decide on a real endpoint before the bundle runs (ADR-0024 D3). Whether a
 * reader may actually post is decided on the server at the moment of the
 * mutation — a control that looks available to somebody who will be refused is
 * correct, and hiding it would be the client-side pre-check ADR-0022 forbids.
 */

export type PublicCommunityState = "ready" | "loading" | "error";

/**
 * What differs by reader, when the community is a static document (ADR-0032).
 *
 * The page is the same bytes for everyone, prerendered; each of these is a
 * request-time region whose fallback is the guest's working rendering (D2).
 * Without them — the `/q` twin, which renders at request time anyway — the view
 * decides from `viewer` and `community.viewer` as it always has.
 */
export interface PublicCommunityViewerRegions {
  /** The resumed sign-in intent's focus target. */
  intentFocus: ReactNode;
  /** The header's join / leave control. */
  membership: ReactNode;
  /** A membership or report result, from the redirect that carried it. */
  status: ReactNode;
  /** The contribution step's content, for this reader (`OVE-500`). */
  contribute: ReactNode;
  /** One contribution's report and block controls. */
  safety: (item: PublicCommunityContribution) => ReactNode;
  /** The owner's way into moderation. */
  moderator: ReactNode;
}

export function PublicCommunityDirectory({
  locale,
  communities,
  state = "ready",
  jsonLd,
}: {
  locale: PublicLocale;
  communities: PublicCommunityDirectoryItem[];
  state?: PublicCommunityState;
  jsonLd?: Record<string, unknown> | null;
}) {
  const copy = getCommunityCopy(locale);
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);

  return (
    <main
      lang={locale}
      data-public-community-directory={state}
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}

      <PageHeader
        title={copy.directoryTitle}
        description={copy.directoryDescription}
      />

      {state === "loading" ? (
        <p className="py-10 text-body-sm text-text-muted">{copy.loading}</p>
      ) : state === "error" ? (
        <p className="py-10 text-body-sm text-text-muted" role="alert">
          {copy.error}
        </p>
      ) : communities.length === 0 ? (
        <EmptyState
          illustration={resolveIllustration("empty-community")}
          title={copy.directoryEmpty}
          description={copy.directoryDescription}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {communities.map((community, index) => (
            <li key={community.id} className="min-w-0">
              <CommunityCard
                locale={locale}
                copy={copy}
                community={community}
                priority={index < 2}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/**
 * One community, shown by what it has.
 *
 * The photograph is the only coloured thing on it (ADR-0031 D3) and its box is
 * reserved whether or not one exists, so a late image shifts nothing. Beneath
 * the description come the community's facts — and only the facts: a zero is
 * absent, and a community with none of them gets the one badge that is true of
 * it instead.
 */
function CommunityCard({
  locale,
  copy,
  community,
  priority,
}: {
  locale: PublicLocale;
  copy: CommunityCopy;
  community: PublicCommunityDirectoryItem;
  priority: boolean;
}) {
  const content = getCommunityContentCopy(locale, community.contentKey);
  const facts = communityFacts(community, copy);
  const titleId = `community-${community.id}-title`;
  const topic = localizeTopicLabel(
    locale,
    community.topicSlug,
    community.topicLabel,
  );

  return (
    <Card
      as="article"
      interactive
      aria-labelledby={titleId}
      data-public-community-card={community.slug}
      className="grid h-full content-start gap-3 overflow-hidden p-4"
    >
      {community.coverUrl ? (
        <MediaFigure
          aspect="card"
          className="-mx-4 -mt-4"
          src={community.coverUrl}
          srcSet={
            buildPublicMediaSourceSet({
              publicUrl: community.coverUrl,
              intrinsicWidth: community.coverIntrinsicWidth,
              intrinsicHeight: community.coverIntrinsicHeight,
            }).srcSet
          }
          sizes="(max-width: 639px) 100vw, 344px"
          alt={content.name}
          focalX={community.coverFocalX}
          focalY={community.coverFocalY}
          intrinsicWidth={community.coverIntrinsicWidth}
          intrinsicHeight={community.coverIntrinsicHeight}
          priority={priority}
        />
      ) : null}
      <p className="text-overline text-text-muted uppercase">{copy.eyebrow}</p>
      <h2 id={titleId} className="text-h3 break-words text-text-heading">
        <Link
          href={localizedPath(locale, publicCommunityPath(community.slug))}
          variant="quiet"
          className="before:absolute before:inset-0"
        >
          {content.name}
        </Link>
      </h2>
      <p className="line-clamp-3 text-body-sm text-text-muted">
        {content.description}
      </p>
      {/* The topic the community gathers (vc.ru's attribution), when it is
          not simply the community's own name said twice. */}
      {topic !== content.name ? (
        <p
          data-community-topic={community.topicSlug}
          className="text-caption text-text-muted"
        >
          {copy.topicLabel}: {topic}
        </p>
      ) : null}
      <CommunityFacts
        community={community}
        copy={copy}
        facts={facts}
        className="mt-1"
      />
      {/* What a reader can do here, in words: the one action the card
          promises is the one the community page offers. */}
      {acceptsContributions(community) ? (
        <p
          data-community-open="true"
          className="text-caption text-text-secondary"
        >
          {copy.cardOpen}
        </p>
      ) : null}
    </Card>
  );
}

/** Active and open: a member may add an entry here now. */
function acceptsContributions(
  community: Pick<
    PublicCommunityDirectoryItem,
    "lifecycleState" | "participationState"
  >,
) {
  return (
    community.lifecycleState === "active" &&
    community.participationState === "open"
  );
}

/**
 * What this community has — and when it has nothing yet, what it is.
 *
 * A row of noughts is the defect this component exists to prevent, so the
 * empty case is a deliberate branch rather than an empty list: a badge saying
 * the community is new and open, which is the one true statement available.
 */
function CommunityFacts({
  community,
  copy,
  facts,
  className,
}: {
  community: Pick<
    PublicCommunityDirectoryItem,
    "lifecycleState" | "participationState"
  >;
  copy: CommunityCopy;
  facts: ReturnType<typeof communityFacts>;
  className?: string;
}) {
  const stateBadge =
    community.lifecycleState === "archived"
      ? { tone: "neutral" as const, label: copy.archived }
      : community.participationState === "closed"
        ? { tone: "warning" as const, label: copy.participationClosed }
        : null;

  if (facts.length === 0) {
    return (
      <p
        data-community-facts="none"
        className={["flex flex-wrap gap-2", className]
          .filter(Boolean)
          .join(" ")}
      >
        <Badge tone={stateBadge ? stateBadge.tone : "action"}>
          {stateBadge ? stateBadge.label : copy.newCommunity}
        </Badge>
      </p>
    );
  }

  return (
    <dl
      data-community-facts={facts.length}
      className={["flex flex-wrap gap-x-4 gap-y-1", className]
        .filter(Boolean)
        .join(" ")}
    >
      {facts.map((fact) => (
        <div key={fact.key} className="flex items-baseline gap-1.5">
          <dt className="text-caption text-text-muted">{fact.label}</dt>
          <dd className="text-body-sm font-medium text-text tabular-nums">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PublicCommunityView({
  locale,
  community,
  viewer,
  request,
  otherCommunities = [],
  actionStatus,
  contributeStatus = null,
  contributeEntryId = null,
  state = "ready",
  resumeAction = null,
  resumeControl = null,
  jsonLd,
  regions,
}: {
  locale: PublicLocale;
  community: PublicCommunityPageModel;
  viewer: "guest" | "member";
  /** Set by the static page; see `PublicCommunityViewerRegions`. */
  regions?: PublicCommunityViewerRegions;
  request: PublicCommunityViewRequest;
  /** The rest of the directory, for the rail (Digg's "Discover Communities"). */
  otherCommunities?: readonly PublicCommunityDirectoryItem[];
  actionStatus?: string | null;
  /** The contribution step's own outcome (`contributeAction`). */
  contributeStatus?: string | null;
  /** A just-published entry to offer first (`contribute`). */
  contributeEntryId?: string | null;
  state?: PublicCommunityState;
  resumeAction?: AuthIntentAction | null;
  resumeControl?: string | null;
  jsonLd?: Record<string, unknown> | null;
}) {
  const copy = getCommunityCopy(locale);
  const contentCopy = getCommunityContentCopy(locale, community.contentKey);
  const canonicalPath = communityBasePath(locale, community.slug);
  const returnPath = buildPublicCommunityHref(locale, community.slug, request);
  const topicPath = localizedPath(locale, publicTopicPath(community.topicSlug));
  const topic = localizeTopicLabel(
    locale,
    community.topicSlug,
    community.topicLabel,
  );
  const actionMessage = actionStatus ? copy.actionMessages[actionStatus] : null;
  const searchState = community.search ?? {
    mode: "browse" as const,
    degradedReason: null,
    shortQuery: false,
  };
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);
  const firstRun = state === "ready" && isFirstRunCommunity(community, request);
  const facts = communityFacts(community, copy);
  const accepting = state === "ready" && acceptsContributions(community);
  const contextModules = buildCommunityContextModules(
    locale,
    copy,
    community,
    otherCommunities,
    { path: topicPath, label: topic },
    accepting,
  );

  return (
    <main
      lang={locale}
      data-public-community={community.slug}
      data-public-community-state={state}
      data-public-community-screen={firstRun ? "empty-first-run" : state}
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      {regions ? (
        regions.intentFocus
      ) : (
        <AuthIntentFocus action={resumeAction} control={resumeControl} />
      )}
      <SiteShellContextRailRegistration modules={contextModules} />

      <PageHeader
        breadcrumb={
          <CommunityBreadcrumb
            locale={locale}
            copy={copy}
            current={contentCopy.name}
          />
        }
        eyebrow={copy.eyebrow}
        title={contentCopy.name}
        description={contentCopy.description}
        actions={
          state === "ready" ? (
            <div className="flex flex-wrap items-center gap-2">
              {regions ? (
                regions.membership
              ) : (
                <CommunityMembershipAction
                  locale={locale}
                  community={community}
                  viewer={viewer}
                  communityPath={returnPath}
                  resumeAction={resumeAction}
                  resumeControl={resumeControl}
                />
              )}
              {/* The community's one way to take part, for every reader: the
                  step below says what it takes from where they are. */}
              {accepting ? (
                <a
                  href="#community-contribute"
                  data-community-add-entry="header"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  <NotePencil aria-hidden="true" />
                  {copy.addEntry}
                </a>
              ) : null}
            </div>
          ) : null
        }
      />

      {community.coverUrl ? (
        <MediaFigure
          src={community.coverUrl}
          srcSet={
            buildPublicMediaSourceSet({
              publicUrl: community.coverUrl,
              intrinsicWidth: community.coverIntrinsicWidth,
              intrinsicHeight: community.coverIntrinsicHeight,
            }).srcSet
          }
          sizes="(max-width: 767px) 100vw, 704px"
          alt={contentCopy.name}
          focalX={community.coverFocalX}
          focalY={community.coverFocalY}
          intrinsicWidth={community.coverIntrinsicWidth}
          intrinsicHeight={community.coverIntrinsicHeight}
          priority
        />
      ) : null}

      {/* Who this community is: what it gathers, the topic it files under,
          and what it holds — and, while it is open, how a reader takes part
          (`OVE-500`, criterion 1). */}
      <div data-community-identity="true" className="grid gap-3">
        {accepting ? (
          <p className="max-w-prose text-body-sm text-text-secondary">
            {copy.participationSummary}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p
            data-community-topic={community.topicSlug}
            className="text-body-sm"
          >
            <span className="text-text-muted">{copy.topicLabel}:</span>{" "}
            <Link href={topicPath}>{topic}</Link>
          </p>
          <CommunityFacts community={community} copy={copy} facts={facts} />
        </div>
      </div>

      {regions ? (
        regions.status
      ) : actionMessage ? (
        <Callout
          tone={communityOutcomeTone(actionStatus)}
          role="status"
          data-community-action={actionStatus ?? undefined}
        >
          {actionMessage}
        </Callout>
      ) : null}
      {community.lifecycleState === "archived" ? (
        <Callout tone="info">{copy.archived}</Callout>
      ) : community.participationState === "closed" ? (
        <Callout tone="warning">{copy.participationClosed}</Callout>
      ) : null}

      {firstRun ? (
        <EmptyState
          illustration={resolveIllustration("empty-community")}
          title={copy.firstRunTitle}
          description={copy.firstRunDescription}
          action={
            accepting ? <CommunityFirstRunAction locale={locale} /> : undefined
          }
        />
      ) : (
        <>
          <CommunityFilters
            locale={locale}
            copy={copy}
            slug={community.slug}
            request={request}
            canonicalPath={canonicalPath}
          />

          {searchState.shortQuery ? (
            <p className="text-body-sm text-text-muted" role="status">
              {copy.shortSearch}
            </p>
          ) : searchState.degradedReason ? (
            <Callout tone="warning" role="status">
              {copy.degradedSearch}
            </Callout>
          ) : null}

          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
            <h2 className="text-h2 text-text-heading">{copy.journals}</h2>
            {/* Always in the document, so a filter change announces the new
                number into this node rather than arriving with a fresh one
                that announces nothing. */}
            <p
              data-community-result-count="true"
              aria-live="polite"
              className="text-body-sm text-text-muted tabular-nums"
            >
              {state === "ready" ? community.contributions.items.length : ""}
            </p>
          </div>

          {state === "loading" ? (
            <p className="py-10 text-body-sm text-text-muted">{copy.loading}</p>
          ) : state === "error" ? (
            <p className="py-10 text-body-sm text-text-muted" role="alert">
              {copy.error}
            </p>
          ) : community.contributions.items.length === 0 ? (
            <EmptyState
              variant="no-results"
              title={copy.noResultsTitle}
              filters={
                <CommunityFilterChips
                  locale={locale}
                  copy={copy}
                  slug={community.slug}
                  request={request}
                />
              }
              action={
                <NextLink
                  href={canonicalPath}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  {copy.clearFilters}
                </NextLink>
              }
            />
          ) : (
            <ul className="grid gap-4">
              {community.contributions.items.map((item, index) => (
                <li key={item.id} className="min-w-0">
                  <CommunityContributionCard
                    locale={locale}
                    copy={copy}
                    item={item}
                    viewer={viewer}
                    community={community}
                    communityPath={returnPath}
                    resumeAction={resumeAction}
                    resumeControl={resumeControl}
                    priority={index === 0}
                    safety={regions?.safety(item)}
                  />
                </li>
              ))}
            </ul>
          )}

          {state === "ready" && community.contributions.nextCursor ? (
            <NextLink
              href={buildPublicCommunityHref(locale, community.slug, {
                ...request,
                cursor: community.contributions.nextCursor,
              })}
              className={buttonVariants({
                variant: "secondary",
                className: "w-fit",
              })}
            >
              {copy.showMore}
            </NextLink>
          ) : null}

          {community.contributors.length > 0 ? (
            <Section
              id="community-contributors"
              title={copy.contributors}
              description={copy.contributorsDescription}
            >
              <ul className="flex flex-wrap gap-x-5 gap-y-3">
                {community.contributors.map((contributor) => (
                  <li key={contributor.handle}>
                    <CommunityContributor
                      contributor={contributor}
                      copy={copy}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </>
      )}

      {/* The one step that adds an entry (`OVE-500`, criterion 2), on every
          open community and for every reader: a guest signs in and comes back
          here, a reader who is not a member joins here, a member picks one of
          their published entries or writes one for this community. Its
          heading is static; what it offers is the reader's own. */}
      {accepting ? (
        <Section
          id="community-contribute"
          title={copy.contributeTitle}
          description={copy.contributeDescription}
          className="scroll-mt-20"
        >
          {regions ? (
            regions.contribute
          ) : (
            <CommunityContributionStep
              locale={locale}
              community={community}
              viewer={viewer}
              communityPath={canonicalPath}
              freshEntryId={contributeEntryId}
              outcome={contributeStatus}
            />
          )}
        </Section>
      ) : null}

      {/* The rules are the page's, at every width. They were `xl:hidden`
          before, so a reader above `xl` met a community whose own page never
          said what it expected of them (`OVE-454`, criterion 5). */}
      <Section
        id="community-rules"
        title={copy.rules}
        description={copy.rulesDescription}
        className="scroll-mt-20"
      >
        <ol className="grid gap-2">
          {community.rules.map((rule) => (
            <li
              id={`rule-${rule.id}`}
              key={rule.id}
              className="flex scroll-mt-20 gap-3 text-body-sm text-text"
            >
              <span className="font-medium text-text-muted tabular-nums">
                {rule.order}.
              </span>
              <span>{copy.ruleLabels[rule.key] ?? rule.key}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* The owner's way into this community's moderation, for whoever the
          server would let moderate it. One link, not a second surface. */}
      {state === "ready" && regions ? (
        regions.moderator
      ) : state === "ready" && community.viewer.isModerator ? (
        <CommunityModeratorLink locale={locale} slug={community.slug} />
      ) : null}

      <div className="border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
    </main>
  );
}

/** Refusals interrupt; what went through is said politely. */
export function communityOutcomeTone(
  status: string | null | undefined,
): "success" | "warning" {
  return status === "joined" ||
    status === "left" ||
    status === "contributed" ||
    status === "reported" ||
    status === "blocked"
    ? "success"
    : "warning";
}

/** The first-run empty state's action: to the step that adds an entry. */
export function CommunityFirstRunAction({ locale }: { locale: PublicLocale }) {
  const copy = getCommunityCopy(locale);
  return (
    <a
      href="#community-contribute"
      data-community-add-entry="first-run"
      className={buttonVariants()}
    >
      <NotePencil aria-hidden="true" />
      {copy.firstRunAction}
    </a>
  );
}

/** The moderator's way into this community's moderation. */
export function CommunityModeratorLink({
  locale,
  slug,
}: {
  locale: PublicLocale;
  slug: string;
}) {
  const copy = getCommunityCopy(locale);
  return (
    <p className="flex items-center gap-2 text-body-sm">
      <ShieldCheck aria-hidden="true" className="size-4 text-text-muted" />
      {/* Unprefixed for the same reason: `/account/**` is signed-in and has no
          `[locale]` twin. */}
      <Link
        href={`/account/communities/${encodeURIComponent(slug)}`}
        data-community-moderation-link="true"
      >
        {copy.moderatorQueue}
      </Link>
    </p>
  );
}

/**
 * The step that adds an entry to the community, for one reader
 * (`OVE-500`, criterion 2).
 *
 * The community keeps its existing contract: a contribution is one of the
 * member's **published** entries about a plant or an animal, referenced — the
 * entry keeps its one address and stays in its author's journal. Nothing here
 * creates an entry, an object or a space; "write one" opens the one composer
 * with this community named, and brings the reader back here with the new
 * entry offered first. Every control is a real endpoint before hydration, and
 * the server decides at the moment of the mutation.
 */
export function CommunityContributionStep({
  locale,
  community,
  viewer,
  communityPath,
  freshEntryId = null,
  outcome = null,
}: {
  locale: PublicLocale;
  community: PublicCommunityPageModel;
  viewer: "guest" | "member";
  /** The community's own address in this locale, with no query. */
  communityPath: string;
  freshEntryId?: string | null;
  outcome?: string | null;
}) {
  const copy = getCommunityCopy(locale);
  const message = outcome ? copy.actionMessages[outcome] : null;
  const notice =
    outcome && message ? (
      <ActionOutcomeNotice
        outcome={outcome}
        about={`${outcome}:${freshEntryId ?? ""}`}
        tone={communityOutcomeTone(outcome)}
        title={message}
      />
    ) : null;
  const composerHref = buildCommunityComposerHref(
    community.slug,
    communityPath,
  );

  if (viewer === "guest") {
    return (
      <div data-community-contribute-step="guest" className="grid gap-3">
        <p className="text-body-sm text-text-secondary">
          {copy.contributeGuest}
        </p>
        <AuthIntentTrigger
          action="contribute"
          returnTo={communityPath}
          target={{ kind: "collection", ref: community.slug }}
          control={CONTRIBUTE_CONTROL}
          label={copy.contributeSignIn}
          icon={<SignIn aria-hidden="true" />}
          className="w-fit"
        />
      </div>
    );
  }

  const membership = community.viewer.membershipState;
  if (membership === "banned") {
    return (
      <div data-community-contribute-step="banned" className="grid gap-3">
        {notice}
        <p
          tabIndex={-1}
          {...CONTRIBUTE_FOCUS}
          className="text-body-sm text-text-secondary outline-none"
        >
          {copy.banned}
        </p>
      </div>
    );
  }

  if (membership !== "active") {
    return (
      <div data-community-contribute-step="join" className="grid gap-3">
        {notice}
        <p className="text-body-sm text-text-secondary">
          {copy.contributeJoinFirst}
        </p>
        <OwnerScopedProgressiveForm action={setCommunityMembershipAction}>
          <CommunityActionFields locale={locale} slug={community.slug} />
          <HiddenField name="membershipState" value="active" />
          <HiddenField name="returnAnchor" value="community-contribute" />
          {freshEntryId ? (
            <HiddenField name="contribute" value={freshEntryId} />
          ) : null}
          <SubmitButton {...CONTRIBUTE_FOCUS} className="w-fit">
            <UsersRound aria-hidden="true" />
            {copy.follow}
          </SubmitButton>
        </OwnerScopedProgressiveForm>
      </div>
    );
  }

  const entries = community.viewer.eligibleJournals;
  const fresh = freshEntryId
    ? (entries.find((entry) => entry.id === freshEntryId) ?? null)
    : null;

  if (entries.length === 0) {
    return (
      <div data-community-contribute-step="write" className="grid gap-3">
        {notice}
        <p className="text-body-sm text-text-secondary">
          {copy.noEligibleJournals}
        </p>
        <NextLink
          href={composerHref}
          {...CONTRIBUTE_FOCUS}
          data-community-compose="true"
          className={buttonVariants({ className: "w-fit" })}
        >
          <NotePencil aria-hidden="true" />
          {copy.writeForCommunity}
        </NextLink>
      </div>
    );
  }

  return (
    <div data-community-contribute-step="choose" className="grid gap-3">
      {notice ??
        (fresh ? (
          <ActionOutcomeNotice
            outcome="fresh-entry"
            about={fresh.id}
            tone="success"
            title={copy.freshEntry(fresh.title)}
          />
        ) : null)}
      <OwnerScopedProgressiveForm
        action={contributeJournalToCommunityAction}
        className="grid gap-3 sm:flex sm:items-end"
      >
        <CommunityActionFields locale={locale} slug={community.slug} />
        <Field
          label={copy.chooseJournal}
          required
          className="min-w-0 sm:flex-1"
        >
          <Select
            name="journalEntryId"
            defaultValue={fresh?.id}
            {...CONTRIBUTE_FOCUS}
          >
            {entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title} · {entry.objectDisplayName} ·{" "}
                {formatCommunityDate(entry.entryDate, locale)}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton className="w-fit">{copy.contribute}</SubmitButton>
      </OwnerScopedProgressiveForm>
      <NextLink
        href={composerHref}
        data-community-compose="true"
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "w-fit",
        })}
      >
        <NotePencil aria-hidden="true" />
        {copy.writeForCommunity}
      </NextLink>
    </div>
  );
}

/** The resumed sign-in's control, and the one the step focuses on return. */
const CONTRIBUTE_CONTROL = "add-entry";
const CONTRIBUTE_FOCUS = {
  "data-auth-intent-control": "contribute",
  "data-auth-intent-control-ref": CONTRIBUTE_CONTROL,
} as const;

/**
 * The one composer, opened for this community. `/garden/new` has no locale
 * twin; the community's own address rides along so Close and Publish come
 * back to it in the reader's language.
 */
export function buildCommunityComposerHref(
  slug: string,
  communityPath: string,
) {
  const query = new URLSearchParams({
    community: slug,
    returnTo: communityPath,
  });
  return `/garden/new?${query.toString()}`;
}

/**
 * What a reader meets when the community could not be read at request time: a
 * bounded state with the way back, never a thrown error — a throw under a
 * postponed shell leaves the skeleton up for good on a hard load (ADR-0023).
 */
export function PublicCommunityUnavailable({
  locale,
  retryHref,
}: {
  locale: PublicLocale;
  retryHref: string;
}) {
  const copy = getCommunityCopy(locale);
  return (
    <main
      lang={locale}
      data-public-community-state="error"
      className="flex w-full min-w-0 flex-col items-start gap-4 px-4 py-10 sm:px-6"
    >
      <h1 className="text-h1 text-text-heading">{copy.directoryTitle}</h1>
      <p className="text-body-sm text-text-muted" role="alert">
        {copy.error}
      </p>
      <NextLink href={retryHref} className={buttonVariants()}>
        {copy.retry}
      </NextLink>
    </main>
  );
}

function CommunityBreadcrumb({
  locale,
  copy,
  current,
}: {
  locale: PublicLocale;
  copy: CommunityCopy;
  current: string;
}) {
  return (
    <nav aria-label={copy.breadcrumbHome}>
      <ol className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
        <li>
          <Link href={localizedPath(locale, "/communities")}>
            {copy.breadcrumbHome}
          </Link>
        </li>
        <li aria-hidden="true">·</li>
        <li aria-current="page" className="min-w-0 truncate">
          {current}
        </li>
      </ol>
    </nav>
  );
}

/**
 * The same bar `/journals`, `/catalog` and `/knowledge` use (DESIGN.md §5.1):
 * the search, plants or animals as the one mode, a real `GET` submit, and
 * chips above the results.
 */
function CommunityFilters({
  locale,
  copy,
  slug,
  request,
  canonicalPath,
}: {
  locale: PublicLocale;
  copy: CommunityCopy;
  slug: string;
  request: PublicCommunityViewRequest;
  canonicalPath: string;
}) {
  const chrome = getFilterBarChromeCopy(locale);
  return (
    <FilterBar
      /* The community's query views are `/q` twins (ADR-0032). */
      documentNavigation
      action={canonicalPath}
      search={
        <div className="flex items-end gap-2">
          <Field
            label={copy.searchLabel}
            id="community-search"
            className="min-w-0 flex-1"
          >
            <SearchInput
              name="q"
              defaultValue={request.query}
              maxLength={100}
              placeholder={copy.searchPlaceholder}
            />
          </Field>
          <Button type="submit" className="shrink-0">
            <Search aria-hidden="true" />
            {copy.search}
          </Button>
        </div>
      }
      facets={[]}
      /* Plants or animals is the community's one split, so it is a mode —
         not a sheet holding a single select (OVE-482). */
      modes={(["all", ...PUBLIC_COMMUNITY_OBJECT_KINDS] as const).map(
        (kind) => ({
          label: kind === "all" ? copy.allKinds : copy.kindLabels[kind],
          href: buildPublicCommunityHref(locale, slug, {
            query: request.query,
            kind,
            cursor: null,
          }),
          current: request.kind === kind,
        }),
      )}
      hidden={request.kind === "all" ? {} : { kind: request.kind }}
      chips={buildCommunityChips(locale, copy, slug, request)}
      clearAllHref={canonicalPath}
      labels={{
        filters: copy.filtersLabel,
        openFilters: copy.filtersLabel,
        sheetDescription: copy.rulesDescription,
        apply: chrome.showResults,
        close: chrome.close,
        clear: chrome.clearFilters,
        clearAll: copy.clearFilters,
        activeFilters: copy.filtersLabel,
        sort: copy.kindLabel,
        modes: copy.kindLabel,
        pending: chrome.pending,
      }}
    />
  );
}

function CommunityFilterChips({
  locale,
  copy,
  slug,
  request,
}: {
  locale: PublicLocale;
  copy: CommunityCopy;
  slug: string;
  request: PublicCommunityViewRequest;
}) {
  const chips = buildCommunityChips(locale, copy, slug, request);
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} />
      ))}
    </>
  );
}

function buildCommunityChips(
  locale: PublicLocale,
  copy: CommunityCopy,
  slug: string,
  request: PublicCommunityViewRequest,
) {
  const chips: {
    key: string;
    label: string;
    removeHref: string;
    removeLabel: string;
  }[] = [];
  if (request.query) {
    chips.push({
      key: `q:${request.query}`,
      label: request.query,
      removeHref: buildCommunityRemovalHref(locale, slug, request, "q"),
      removeLabel: `${copy.clearFilters}: ${request.query}`,
    });
  }
  if (request.kind !== "all") {
    chips.push({
      key: `kind:${request.kind}`,
      label: copy.kindLabels[request.kind],
      removeHref: buildCommunityRemovalHref(locale, slug, request, "kind"),
      removeLabel: `${copy.clearFilters}: ${copy.kindLabels[request.kind]}`,
    });
  }
  return chips;
}

/**
 * The rail, for this community (`OVE-500`, criterion 3; OG-UX-040): the
 * topic it files under, the step that adds an entry while it is open, its
 * rules and the people writing here — each a place on this page or the
 * topic's — and then the other communities (Digg's "Discover Communities"),
 * when there are some. No generic welcome, and no module whose only entry
 * leads back to the list.
 */
function buildCommunityContextModules(
  locale: PublicLocale,
  copy: CommunityCopy,
  community: PublicCommunityPageModel,
  otherCommunities: readonly PublicCommunityDirectoryItem[],
  topic: { path: string; label: string },
  accepting: boolean,
): SiteShellContextRailModule[] {
  const others = otherCommunities
    .filter((item) => item.slug !== community.slug)
    .slice(0, 6)
    .map((item) => ({
      href: localizedPath(locale, publicCommunityPath(item.slug)),
      label: getCommunityContentCopy(locale, item.contentKey).name,
    }));

  return [
    {
      key: "community-about",
      title: copy.aboutCommunity,
      items: [
        { href: topic.path, label: topic.label, meta: copy.topicLabel },
        ...(accepting
          ? [{ href: "#community-contribute", label: copy.addEntry }]
          : []),
        { href: "#community-rules", label: copy.rules },
        ...(community.contributors.length > 0
          ? [
              {
                href: "#community-contributors",
                label: copy.contributors,
                meta: String(community.contributors.length),
              },
            ]
          : []),
      ],
    },
    ...(others.length > 0
      ? [
          {
            key: "community-discover",
            title: copy.discoverCommunities,
            items: others,
            emptyLabel: copy.directoryEmpty,
          },
        ]
      : []),
  ];
}

function CommunityContributor({
  contributor,
  copy,
}: {
  contributor: PublicCommunityContributor;
  copy: CommunityCopy;
}) {
  return (
    <Link
      href={contributor.href}
      variant="quiet"
      className="flex items-center gap-2"
    >
      <Avatar src={contributor.avatarUrl} name={contributor.label} size="sm" />
      <span className="grid min-w-0">
        <span className="truncate text-body-sm text-text">
          {contributor.label}
        </span>
        <span className="text-caption text-text-muted tabular-nums">
          {copy.contributorEntries(contributor.entryCount)}
        </span>
      </span>
    </Link>
  );
}

export function CommunityMembershipAction({
  locale,
  community,
  viewer,
  communityPath,
  resumeAction,
  resumeControl,
}: {
  locale: PublicLocale;
  community: PublicCommunityPageModel;
  viewer: "guest" | "member";
  communityPath: string;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
}) {
  const copy = getCommunityCopy(locale);
  const control = "community-membership";
  const active = community.viewer.membershipState === "active";
  if (community.lifecycleState !== "active" && !active) return null;
  if (community.participationState === "closed" && !active) return null;

  if (viewer === "guest") {
    return (
      <AuthIntentTrigger
        action="follow"
        returnTo={communityPath}
        target={{ kind: "collection", ref: community.slug }}
        control={control}
        label={copy.follow}
        icon={<UsersRound aria-hidden="true" />}
      />
    );
  }

  if (community.viewer.membershipState === "banned") {
    return (
      <p className="max-w-xs text-body-sm text-text-muted">{copy.banned}</p>
    );
  }

  return (
    <OwnerScopedProgressiveForm action={setCommunityMembershipAction}>
      <CommunityActionFields locale={locale} slug={community.slug} />
      <HiddenField name="membershipState" value={active ? "left" : "active"} />
      <button
        id={
          resumeAction === "follow" && resumeControl === control
            ? buildAuthIntentAnchor("follow", control)
            : undefined
        }
        data-auth-intent-control="follow"
        data-auth-intent-control-ref={control}
        className={buttonVariants({
          variant: active ? "secondary" : "primary",
        })}
      >
        <UsersRound aria-hidden="true" />
        {active ? copy.leave : copy.follow}
      </button>
    </OwnerScopedProgressiveForm>
  );
}

/**
 * One contribution, as `EntryCard` (`OVE-447`).
 *
 * The community's own controls — read, discuss, report, block — arrive through
 * the card's `engagement` slot, which is exactly what that slot is for: the
 * page resolves what a viewer may be offered and hands the rendered controls
 * down, so the card never reads a viewer's state itself.
 */
function CommunityContributionCard({
  locale,
  copy,
  item,
  viewer,
  community,
  communityPath,
  resumeAction,
  resumeControl,
  priority,
  safety,
}: {
  locale: PublicLocale;
  copy: CommunityCopy;
  item: PublicCommunityContribution;
  viewer: "guest" | "member";
  community: PublicCommunityPageModel;
  communityPath: string;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
  priority: boolean;
  /** The static page's request-time region for the report and block controls. */
  safety?: ReactNode;
}) {
  const KindIcon = item.object.kind === "plant" ? Sprout : PawPrint;

  return (
    <EntryCard
      id={item.id}
      href={item.href}
      title={item.title}
      headingLevel={3}
      contentLanguage={
        contentLanguageAttribute(item.sourceLanguage, locale).lang
      }
      dateTime={isoDay(item.entryDate)}
      dateLabel={formatCommunityDate(item.entryDate, locale)}
      excerpt={item.excerpt}
      subject={{
        label: item.object.displayName,
        href: item.object.href,
        kindLabel: copy.kindLabels[item.object.kind] ?? copy.objects,
        icon: <KindIcon className="size-6" aria-hidden="true" />,
      }}
      author={
        item.author
          ? { displayName: item.author.label, href: item.author.href }
          : null
      }
      cover={
        item.coverUrl
          ? {
              src: item.coverUrl,
              srcSet: buildPublicMediaSourceSet({
                publicUrl: item.coverUrl,
                intrinsicWidth: item.coverIntrinsicWidth,
                intrinsicHeight: item.coverIntrinsicHeight,
              }).srcSet,
              alt: publicCardMediaAltText({ caption: item.coverCaption }),
              focalX: item.coverFocalX,
              focalY: item.coverFocalY,
              intrinsicWidth: item.coverIntrinsicWidth,
              intrinsicHeight: item.coverIntrinsicHeight,
              sizes: "(max-width: 767px) 100vw, 704px",
            }
          : null
      }
      priority={priority}
      engagement={
        <div className="relative flex flex-wrap items-center gap-2">
          {item.discussionState === "open" ? (
            <NextLink
              href={localizedPath(
                locale,
                publicCommunityDiscussionPath(community.slug, item.id),
              )}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <MessageCircle aria-hidden="true" />
              {copy.comments}
            </NextLink>
          ) : (
            <span className="text-caption text-text-muted">
              {copy.discussionClosed}
            </span>
          )}
          {safety !== undefined ? (
            safety
          ) : (
            <CommunitySafetyActions
              locale={locale}
              item={item}
              viewer={viewer}
              community={community}
              communityPath={communityPath}
              resumeAction={resumeAction}
              resumeControl={resumeControl}
            />
          )}
        </div>
      }
    />
  );
}

export function CommunitySafetyActions({
  locale,
  item,
  viewer,
  community,
  communityPath,
  resumeAction,
  resumeControl,
}: {
  locale: PublicLocale;
  item: PublicCommunityContribution;
  viewer: "guest" | "member";
  community: PublicCommunityPageModel;
  communityPath: string;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
}) {
  const copy = getCommunityCopy(locale);
  if (!item.author) return null;
  // The reader's own entry: the server refuses a report or a block of
  // yourself, so neither is offered (`OVE-500`, criterion 6).
  if (viewer === "member" && item.viewerIsAuthor) {
    return (
      <span
        data-community-own-entry="true"
        className="text-caption text-text-muted"
      >
        {copy.ownEntry}
      </span>
    );
  }
  const target = { kind: "collection" as const, ref: community.slug };
  const reportControl = `contribution-${item.id}`;
  const blockControl = `contribution-${item.id}`;

  if (viewer === "guest") {
    return (
      <>
        <AuthIntentTrigger
          action="report"
          returnTo={communityPath}
          target={target}
          control={reportControl}
          label={copy.report}
          variant="ghost"
          size="sm"
        />
        <AuthIntentTrigger
          action="block"
          returnTo={communityPath}
          target={target}
          control={blockControl}
          label={copy.block}
          variant="ghost"
          size="sm"
        />
      </>
    );
  }

  return (
    <>
      {item.viewerReportState ? (
        <span className="text-caption text-text-muted">
          {copy.reportPending}
        </span>
      ) : (
        <details
          id={
            resumeAction === "report" && resumeControl === reportControl
              ? buildAuthIntentAnchor("report", reportControl)
              : undefined
          }
          open={resumeAction === "report" && resumeControl === reportControl}
          className="sm:relative"
        >
          <summary
            data-auth-intent-control="report"
            data-auth-intent-control-ref={reportControl}
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "cursor-pointer list-none",
            })}
          >
            {copy.report}
          </summary>
          <OwnerScopedProgressiveForm
            action={reportCommunityContributionAction}
            className="absolute left-0 z-popover mt-1 grid w-72 gap-3 rounded-md border border-border bg-surface-raised p-3 shadow-popover"
          >
            <CommunityActionFields locale={locale} slug={community.slug} />
            <HiddenField name="contributionId" value={item.id} />
            <Field label={copy.reportReason} id={`report-reason-${item.id}`}>
              <Select name="reason">
                {Object.entries(copy.reportReasons).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" size="sm">
              {copy.sendReport}
            </Button>
          </OwnerScopedProgressiveForm>
        </details>
      )}
      <OwnerScopedProgressiveForm
        action={blockCommunityContributionAuthorAction}
      >
        <CommunityActionFields locale={locale} slug={community.slug} />
        <HiddenField name="contributionId" value={item.id} />
        <button
          id={
            resumeAction === "block" && resumeControl === blockControl
              ? buildAuthIntentAnchor("block", blockControl)
              : undefined
          }
          data-auth-intent-control="block"
          data-auth-intent-control-ref={blockControl}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          {copy.block}
        </button>
      </OwnerScopedProgressiveForm>
    </>
  );
}

/**
 * The discussion page's own shape (`OVE-454`, criterion 3; `OVE-500`,
 * criterion 4).
 *
 * The thread itself is `PublicEngagementPanel`, which the page passes in: this
 * component is what a reader arriving from a search result needs around it —
 * where they are, which entry is being discussed, and the way back. The entry
 * is the same readable post the community lists (`EntryCard`), so the
 * discussion reads as a conversation under a post — and the post's own link
 * is the entry's one address, never a copy of it here.
 */
export function PublicCommunityDiscussion({
  locale,
  communitySlug,
  communityName,
  entry,
  children,
}: {
  locale: PublicLocale;
  communitySlug: string;
  communityName: string;
  entry: {
    id: string;
    title: string;
    href: string;
    excerpt: string;
    sourceLanguage: PublicLocale;
    authorLabel: string | null;
    authorHref: string | null;
    dateTime: string | undefined;
    dateLabel: string;
    objectLabel: string;
    objectKind: "plant" | "animal" | null;
  } | null;
  children: React.ReactNode;
}) {
  const copy = getCommunityCopy(locale);
  const communityPath = communityBasePath(locale, communitySlug);
  const KindIcon = entry?.objectKind === "animal" ? PawPrint : Sprout;

  return (
    <main
      lang={locale}
      data-public-community-discussion={communitySlug}
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      <PageHeader
        breadcrumb={
          <DiscussionBreadcrumb
            locale={locale}
            copy={copy}
            communityPath={communityPath}
            communityName={communityName}
          />
        }
        title={copy.discussionTitle}
        description={
          entry ? (
            <span {...contentLanguageAttribute(entry.sourceLanguage, locale)}>
              {entry.title}
            </span>
          ) : undefined
        }
        actions={
          <NextLink
            href={communityPath}
            data-community-discussion-back="true"
            className={buttonVariants({ variant: "secondary" })}
          >
            {copy.discussionBack}
          </NextLink>
        }
      />

      {entry ? (
        <Section id="discussion-entry" title={copy.discussionEntry}>
          <EntryCard
            id={`discussion-${entry.id}`}
            href={entry.href}
            title={entry.title}
            headingLevel={3}
            contentLanguage={
              contentLanguageAttribute(entry.sourceLanguage, locale).lang
            }
            dateTime={entry.dateTime ?? ""}
            dateLabel={entry.dateLabel}
            excerpt={entry.excerpt}
            subject={{
              label: entry.objectLabel,
              kindLabel: entry.objectKind
                ? copy.kindLabels[entry.objectKind]
                : copy.objects,
              icon: <KindIcon className="size-6" aria-hidden="true" />,
            }}
            author={
              entry.authorLabel && entry.authorHref
                ? { displayName: entry.authorLabel, href: entry.authorHref }
                : null
            }
          />
        </Section>
      ) : null}

      {children}
    </main>
  );
}

/**
 * A discussion whose entry is no longer in the community — removed by a
 * moderator, withdrawn by its author, or never here (`OVE-500`, criterion 6).
 * It says so and leads back, instead of a bare "not found" that reads like a
 * broken link.
 */
export function PublicCommunityDiscussionUnavailable({
  locale,
  communitySlug,
  communityName,
}: {
  locale: PublicLocale;
  communitySlug: string;
  communityName: string | null;
}) {
  const copy = getCommunityCopy(locale);
  const communityPath = communityBasePath(locale, communitySlug);
  return (
    <main
      lang={locale}
      data-public-community-discussion={communitySlug}
      data-public-community-discussion-state="unavailable"
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      <PageHeader
        breadcrumb={
          communityName ? (
            <DiscussionBreadcrumb
              locale={locale}
              copy={copy}
              communityPath={communityPath}
              communityName={communityName}
            />
          ) : undefined
        }
        title={copy.discussionUnavailableTitle}
        description={copy.discussionUnavailableBody}
      />
      <NextLink
        href={
          communityName ? communityPath : localizedPath(locale, "/communities")
        }
        data-community-discussion-back="true"
        className={buttonVariants({ className: "w-fit" })}
      >
        {communityName ? copy.discussionBack : copy.breadcrumbHome}
      </NextLink>
    </main>
  );
}

function DiscussionBreadcrumb({
  locale,
  copy,
  communityPath,
  communityName,
}: {
  locale: PublicLocale;
  copy: CommunityCopy;
  communityPath: string;
  communityName: string;
}) {
  return (
    <nav aria-label={copy.breadcrumbHome}>
      <ol className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
        <li>
          <Link href={localizedPath(locale, "/communities")}>
            {copy.breadcrumbHome}
          </Link>
        </li>
        <li aria-hidden="true">·</li>
        <li>
          <Link href={communityPath}>{communityName}</Link>
        </li>
        <li aria-hidden="true">·</li>
        <li aria-current="page" className="min-w-0 truncate">
          {copy.discussionTitle}
        </li>
      </ol>
    </nav>
  );
}

function CommunityActionFields({
  locale,
  slug,
}: {
  locale: PublicLocale;
  slug: string;
}) {
  return (
    <>
      <HiddenField name="locale" value={locale} />
      <HiddenField name="slug" value={slug} />
    </>
  );
}

function formatCommunityDate(value: Date | string, locale: PublicLocale) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

/** `YYYY-MM-DD` for `<time datetime>`: a day, not an instant. */
function isoDay(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}
