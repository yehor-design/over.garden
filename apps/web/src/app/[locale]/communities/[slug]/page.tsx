import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { cache, Suspense } from "react";

import {
  CommunityContributionStep,
  CommunityMembershipAction,
  CommunitySafetyActions,
  PublicCommunityUnavailable,
  PublicCommunityView,
} from "@/components/public/public-community";
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import {
  getCommunityContentCopy,
  getCommunityCopy,
} from "@/lib/community-copy";
import { isPublicLocale, type PublicLocale } from "@/lib/public-localization";
import {
  buildPublicCommunityHref,
  communityBasePath,
  EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST,
  normalizePublicCommunityViewRequest,
} from "@/lib/public-community-view";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  buildPublicCommunityDiscoverySource,
  getPublicCommunityPage,
  type PublicCommunityPageModel,
} from "@/server/community-repository";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfaceDiscoveryFromLoad,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { scopedToUser, type RequestScope } from "@/server/request-scope";
import {
  readPublicCommunityDirectory,
  readPublicCommunityPage,
} from "@/server/public-cache";
import { STATIC_PARAMS_PLACEHOLDER } from "@/server/public-prerender";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  StaticRenderDeferred,
  type PublicRenderPhase,
} from "@/server/static-public-page";
import {
  describeWorkspaceFailure,
  recordPublicSurfaceFailure,
} from "@/server/workspace-failure";
import {
  CommunityIntentFocus,
  CommunityViewerContribution,
  CommunityViewerMembership,
  CommunityViewerModerator,
  CommunityViewerSafety,
  CommunityViewerStatus,
} from "./community-regions";

interface CommunityDetailRouteProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

type CommunityPageOptions = NonNullable<
  Parameters<typeof getPublicCommunityPage>[2]
>;

/** One community read per request: `generateMetadata` and the guest page share it (React.cache). */
const loadCommunityPage = cache(
  (
    slug: string,
    locale: PublicLocale,
    viewerScope: CommunityPageOptions["viewerScope"],
    query: string,
    kind: CommunityPageOptions["kind"],
    cursor: string | null,
  ) =>
    viewerScope
      ? getPublicCommunityPage(slug, locale, {
          viewerScope,
          query,
          kind,
          cursor,
        })
      : readPublicCommunityPage(slug, locale, query, kind, cursor),
);

export async function generateMetadata({
  params,
}: CommunityDetailRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;
  if (slug === STATIC_PARAMS_PLACEHOLDER) return {};
  const safeSlug = normalizeCommunitySlug(slug);
  if (!isPublicLocale(localeParam) || !safeSlug) {
    return missingCommunityMetadata();
  }
  const discovery = await resolvePublicSurfaceDiscoveryFromLoad({
    consumerId: "localized_community",
    document: "static",
    loadSource: async () => {
      const community = await loadCommunityPage(
        safeSlug,
        localeParam,
        null,
        EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST.query,
        "all",
        EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST.cursor,
      );
      if (!community) throw new Error("Public community unavailable.");
      return buildPublicCommunityDiscoverySource(localeParam, community);
    },
  });
  return buildCommunitySurface(localeParam, safeSlug, null, discovery).metadata;
}

export function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }];
}

export default async function CommunityDetailRoute({
  params,
  searchParams,
}: CommunityDetailRouteProps) {
  const { locale: localeParam, slug: slugParam } = await params;
  if (slugParam === STATIC_PARAMS_PLACEHOLDER) return null;
  if (!isPublicLocale(localeParam)) return notFound();
  const slug = normalizeCommunitySlug(slugParam);
  if (!slug) return notFound();
  return renderStaticPublicPage({
    fallback: <RootLoadingSkeleton />,
    render: (phase) =>
      renderStaticCommunity(localeParam, slug, searchParams, phase),
  });
}

/**
 * The community as a static document (ADR-0032): the guest's community and
 * the rail's directory are read in the prerender; everything that differs by
 * reader is a request-time region (`community-regions.tsx`). A query the
 * community reads — `q`, `kind`, `cursor` — renders from the `/q` twin, which
 * is `renderCommunityForRequest`.
 */
export async function renderStaticCommunity(
  locale: PublicLocale,
  slug: string,
  searchParams: CommunityDetailRouteProps["searchParams"],
  phase: PublicRenderPhase,
) {
  await deferStaticRenderWithoutDatabase(phase);
  const request = EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST;
  let community: PublicCommunityPageModel | null;
  let directory: Awaited<ReturnType<typeof readPublicCommunityDirectory>>;
  try {
    [community, directory] = await Promise.all([
      loadCommunityPage(
        slug,
        locale,
        null,
        request.query,
        "all",
        request.cursor,
      ),
      readOtherCommunities(),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof StaticRenderDeferred) throw error;
    deferStaticRenderAfterFailure(phase);
    recordPublicSurfaceFailure(describeWorkspaceFailure(error), {
      surface: "community",
      section: "community",
      locale,
    });
    return (
      <PublicCommunityUnavailable
        locale={locale}
        retryHref={communityBasePath(locale, slug)}
      />
    );
  }
  if (!community) notFound();
  const guestCommunity = community;
  const discovery = resolvePublicSurfaceDiscoveryForRequest(
    buildPublicCommunityDiscoverySource(locale, guestCommunity),
  );
  const surface = buildCommunitySurface(
    locale,
    slug,
    guestCommunity,
    discovery,
  );
  const communityPath = buildPublicCommunityHref(locale, slug, request);

  return (
    <PublicCommunityView
      locale={locale}
      community={guestCommunity}
      viewer="guest"
      request={request}
      otherCommunities={directory}
      state="ready"
      jsonLd={surface.jsonLd}
      regions={{
        intentFocus: (
          <Suspense fallback={null}>
            <CommunityIntentFocus searchParams={searchParams} />
          </Suspense>
        ),
        membership: (
          <Suspense
            fallback={
              <CommunityMembershipAction
                locale={locale}
                community={guestCommunity}
                viewer="guest"
                communityPath={communityPath}
                resumeAction={null}
                resumeControl={null}
              />
            }
          >
            <CommunityViewerMembership
              locale={locale}
              community={guestCommunity}
              communityPath={communityPath}
              searchParams={searchParams}
            />
          </Suspense>
        ),
        status: (
          <Suspense fallback={null}>
            <CommunityViewerStatus
              locale={locale}
              searchParams={searchParams}
            />
          </Suspense>
        ),
        contribute: (
          <Suspense
            fallback={
              <CommunityContributionStep
                locale={locale}
                community={guestCommunity}
                viewer="guest"
                communityPath={communityBasePath(locale, slug)}
              />
            }
          >
            <CommunityViewerContribution
              locale={locale}
              community={guestCommunity}
              communityPath={communityBasePath(locale, slug)}
              searchParams={searchParams}
            />
          </Suspense>
        ),
        safety: (item) => (
          <Suspense
            fallback={
              <CommunitySafetyActions
                locale={locale}
                item={item}
                viewer="guest"
                community={guestCommunity}
                communityPath={communityPath}
                resumeAction={null}
                resumeControl={null}
              />
            }
          >
            <CommunityViewerSafety
              locale={locale}
              community={guestCommunity}
              item={item}
              communityPath={communityPath}
              searchParams={searchParams}
            />
          </Suspense>
        ),
        moderator: (
          <Suspense fallback={null}>
            <CommunityViewerModerator locale={locale} slug={slug} />
          </Suspense>
        ),
      }}
    />
  );
}

/**
 * The community with a query of its own, at request time: the `/q` twin. It
 * reads the viewer here as the page always did, behind the twin's own
 * boundary (`[locale]/q/loading.tsx`).
 */
export async function renderCommunityForRequest(
  locale: PublicLocale,
  slug: string,
  queryParams: Record<string, string | string[] | undefined>,
) {
  const viewerScope = await currentViewerScope();
  const request = normalizePublicCommunityViewRequest(queryParams);
  const [community, directory] = await Promise.all([
    loadCommunityPage(
      slug,
      locale,
      viewerScope,
      request.query,
      request.kind === "all" ? "all" : request.kind,
      request.cursor,
    ),
    // The rail's "other communities" (Digg's Discover panel). It is the same
    // cached directory read `/communities` makes, so a reader who came from
    // the list pays nothing for it.
    readOtherCommunities(),
  ]);
  if (!community) return notFound();
  const discovery = resolvePublicSurfaceDiscoveryForRequest(
    buildPublicCommunityDiscoverySource(locale, community),
  );
  const surface = buildCommunitySurface(locale, slug, community, discovery);

  return (
    <PublicCommunityView
      locale={locale}
      community={community}
      viewer={viewerScope ? "member" : "guest"}
      request={request}
      otherCommunities={directory}
      actionStatus={firstValue(queryParams.communityAction) || null}
      contributeStatus={firstValue(queryParams.contributeAction) || null}
      contributeEntryId={normalizeEntryId(firstValue(queryParams.contribute))}
      state="ready"
      resumeAction={normalizeAuthIntentResumeAction(queryParams.authIntent)}
      resumeControl={normalizeAuthIntentResumeControl(queryParams.authControl)}
      jsonLd={surface.jsonLd}
    />
  );
}

function missingCommunityMetadata(): Metadata {
  return {
    title: "OverGarden",
    robots: resolveUnresolvedPublicSurfaceDiscovery("localized_community")
      .decision.robots,
  };
}

function buildCommunitySurface(
  locale: PublicLocale,
  slug: string,
  community: PublicCommunityPageModel | null,
  discovery: PublicSurfaceDiscoveryResult,
) {
  const content = community
    ? getCommunityContentCopy(locale, community.contentKey)
    : getCommunityCopy(locale);
  const name = content.name;
  const description = content.description;
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: community ? null : locale,
    title: `${name} | OverGarden`,
    description,
    visibleFacts: {
      type: "CollectionPage",
      name,
      description,
      itemNames: community?.contributions?.items.map((item) => item.title),
      trustQualifier: community
        ? "Moderated public OverGarden community"
        : `Community ${slug}`,
    },
  });
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function normalizeEntryId(value: string) {
  const id = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    id,
  )
    ? id
    : null;
}

/**
 * The rail's other communities, and only the rail's: a directory that cannot
 * be read leaves the rail without them, not the community without its page
 * (`OVE-500`, criterion 6 — a partial failure stays partial).
 */
async function readOtherCommunities() {
  try {
    return await readPublicCommunityDirectory();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof StaticRenderDeferred) throw error;
    return [];
  }
}

function normalizeCommunitySlug(value: string) {
  const slug = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,63}$/.test(slug) ? slug : null;
}

async function currentViewerScope(): Promise<RequestScope | null> {
  try {
    const session = await getCurrentSession();
    return session?.user?.id
      ? scopedToUser(session.user.id, getSessionId(session))
      : null;
  } catch (error) {
    // A prerender bail-out is not a session failure; see the directory page.
    unstable_rethrow(error);
    return null;
  }
}
