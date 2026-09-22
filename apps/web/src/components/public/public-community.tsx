import { ChatCircleIcon as MessageCircle } from "@/components/icons/ChatCircle";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
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
import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
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
import { ListRow } from "@/components/ui/list-row";
import { MediaFigure } from "@/components/ui/media-figure";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
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
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
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
  /** The contribution picker, for a member who may write here. */
  contribute: ReactNode;
  /** The first-run empty state's one action. */
  firstRunAction: ReactNode;
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
      <CommunityFacts
        community={community}
        copy={copy}
        facts={facts}
        className="mt-1"
      />
    </Card>
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
  state?: PublicCommunityState;
  resumeAction?: AuthIntentAction | null;
  resumeControl?: string | null;
  jsonLd?: Record<string, unknown> | null;
}) {
  const copy = getCommunityCopy(locale);
  const contentCopy = getCommunityContentCopy(locale, community.contentKey);
  const canonicalPath = communityBasePath(locale, community.slug);
  const returnPath = buildPublicCommunityHref(locale, community.slug, request);
  const knowledgePath = localizedPath(
    locale,
    publicTopicPath(community.topicSlug),
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
  const contextModules = buildCommunityContextModules(
    locale,
    copy,
    community,
    otherCommunities,
    knowledgePath,
  );
  const canContribute =
    state === "ready" &&
    viewer === "member" &&
    community.viewer.membershipState === "active" &&
    community.lifecycleState === "active" &&
    community.participationState === "open";

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
          state === "ready" && regions ? (
            regions.membership
          ) : state === "ready" ? (
            <CommunityMembershipAction
              locale={locale}
              community={community}
              viewer={viewer}
              communityPath={returnPath}
              resumeAction={resumeAction}
              resumeControl={resumeControl}
            />
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

      <CommunityFacts community={community} copy={copy} facts={facts} />

      {regions ? (
        regions.status
      ) : actionMessage ? (
        <Callout tone="info" role="status">
          {actionMessage}
        </Callout>
      ) : null}
      {community.lifecycleState === "archived" ? (
        <Callout tone="info">{copy.archived}</Callout>
      ) : community.participationState === "closed" ? (
        <Callout tone="warning">{copy.participationClosed}</Callout>
      ) : null}

      {firstRun ? (
        <>
          <EmptyState
            illustration={resolveIllustration("empty-community")}
            title={copy.firstRunTitle}
            description={copy.firstRunDescription}
            action={
              regions ? (
                regions.firstRunAction
              ) : (
                <CommunityFirstRunAction
                  locale={locale}
                  canContribute={canContribute}
                />
              )
            }
          />
          {/* The action, where the action's anchor points. A member who can
              write is offered the picker itself rather than an anchor to a
              section that is not on the page. */}
          {regions ? (
            regions.contribute
          ) : canContribute ? (
            <CommunityContributionForm locale={locale} community={community} />
          ) : null}
        </>
      ) : (
        <>
          {regions ? (
            regions.contribute
          ) : canContribute ? (
            <CommunityContributionForm locale={locale} community={community} />
          ) : null}

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

      {/* The rules are the page's, at every width. They were `xl:hidden`
          before, so a reader above `xl` met a community whose own page never
          said what it expected of them (`OVE-454`, criterion 5). */}
      <Section
        id="community-rules"
        title={copy.rules}
        description={copy.rulesDescription}
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
        <NextLink
          href={knowledgePath}
          className={buttonVariants({
            variant: "secondary",
            className: "w-fit",
          })}
        >
          {copy.openKnowledge}
        </NextLink>
      </Section>

      {/* The owner's way into moderation from the community itself. One link,
          not a second surface: `/account/communities` is `OVE-456`'s. */}
      {state === "ready" && regions ? (
        regions.moderator
      ) : state === "ready" && community.viewer.isModerator ? (
        <CommunityModeratorLink locale={locale} />
      ) : null}

      <div className="border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
    </main>
  );
}

/** The first-run empty state's action: the picker below, or the workspace. */
export function CommunityFirstRunAction({
  locale,
  canContribute,
}: {
  locale: PublicLocale;
  canContribute: boolean;
}) {
  const copy = getCommunityCopy(locale);
  return (
    <NextLink
      // `/garden` has no locale-prefixed twin — the prefixed tree is a subset
      // of the unprefixed one, and `/bg/garden` is a `404` the proxy decides
      // before rendering. A gardener's own workspace is one address.
      // A reader with nothing to contribute yet writes it first, in the one
      // composer (OVE-486); the garden home carries no editor (OVE-489).
      href={canContribute ? "#community-contribute" : "/garden/new"}
      className={buttonVariants()}
    >
      {copy.firstRunAction}
    </NextLink>
  );
}

/** The owner's way into moderation from the community itself. */
export function CommunityModeratorLink({ locale }: { locale: PublicLocale }) {
  const copy = getCommunityCopy(locale);
  return (
    <Callout tone="info">
      {/* Unprefixed for the same reason: `/account/**` is signed-in and has no
          `[locale]` twin. */}
      <Link href="/account/communities">{copy.moderatorQueue}</Link>
    </Callout>
  );
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

function buildCommunityContextModules(
  locale: PublicLocale,
  copy: CommunityCopy,
  community: PublicCommunityPageModel,
  otherCommunities: readonly PublicCommunityDirectoryItem[],
  knowledgePath: string,
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
      key: "community-knowledge",
      title: copy.relatedKnowledge,
      items: [{ href: knowledgePath, label: copy.openKnowledge }],
      emptyLabel: copy.openKnowledge,
    },
    // Digg's "Discover Communities" panel — and only when there are some. A
    // module headed "other communities" whose one entry is a link back to the
    // list is a heading that promises something the rail does not have.
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

export function CommunityContributionForm({
  locale,
  community,
}: {
  locale: PublicLocale;
  community: PublicCommunityPageModel;
}) {
  const copy = getCommunityCopy(locale);
  return (
    <Section
      id="community-contribute"
      title={copy.contributeTitle}
      description={copy.contributeDescription}
    >
      {community.viewer.eligibleJournals.length > 0 ? (
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
            <Select name="journalEntryId">
              {community.viewer.eligibleJournals.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title} · {entry.objectDisplayName}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">{copy.contribute}</Button>
        </OwnerScopedProgressiveForm>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm text-text-muted">
            {copy.noEligibleJournals}
          </p>
          <NextLink
            href="/garden/new"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {copy.createJournal}
          </NextLink>
        </div>
      )}
    </Section>
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
              alt: publicCardMediaAltText({}),
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
 * The discussion page's own shape (`OVE-454`, criterion 3).
 *
 * The thread itself is `PublicEngagementPanel`, which the page passes in: this
 * component is what a reader arriving from a search result needs around it —
 * where they are, which entry is being discussed, and the way back. The entry
 * is a `ListRow` rather than a second card, because the page is about the
 * conversation and the entry is its subject line.
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
    title: string;
    href: string;
    authorLabel: string | null;
    authorHref: string | null;
    dateTime: string | undefined;
    dateLabel: string;
    objectLabel: string;
  } | null;
  children: React.ReactNode;
}) {
  const copy = getCommunityCopy(locale);
  const communityPath = communityBasePath(locale, communitySlug);

  return (
    <main
      lang={locale}
      data-public-community-discussion={communitySlug}
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      <PageHeader
        breadcrumb={
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
        }
        title={copy.discussionTitle}
        description={entry?.title}
        actions={
          <NextLink
            href={communityPath}
            className={buttonVariants({ variant: "secondary" })}
          >
            {copy.discussionBack}
          </NextLink>
        }
      />

      {entry ? (
        <Section id="discussion-entry" title={copy.discussionEntry}>
          <ul>
            <ListRow
              title={entry.title}
              href={entry.href}
              description={entry.objectLabel}
              meta={
                <>
                  {entry.authorLabel ? `${entry.authorLabel} · ` : null}
                  <time dateTime={entry.dateTime}>{entry.dateLabel}</time>
                </>
              }
            />
          </ul>
        </Section>
      ) : null}

      {children}
    </main>
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
