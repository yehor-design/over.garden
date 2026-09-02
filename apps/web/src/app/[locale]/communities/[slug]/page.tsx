import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { PublicCommunityView } from "@/components/public/public-community";
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
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  getPublicCommunityPage,
  type CommunityObjectKind,
  type PublicCommunityPageModel,
} from "@/server/community-repository";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfaceDiscoveryFromLoad,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { scopedToUser, type RequestScope } from "@/server/request-scope";

export const dynamic = "force-dynamic";

interface CommunityDetailRouteProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

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
  ) => getPublicCommunityPage(slug, locale, { viewerScope, query, kind, cursor }),
);

export async function generateMetadata({
  params,
}: CommunityDetailRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;
  const safeSlug = normalizeCommunitySlug(slug);
  if (!isPublicLocale(localeParam) || !safeSlug) {
    return missingCommunityMetadata();
  }
  const discovery = await resolvePublicSurfaceDiscoveryFromLoad({
    consumerId: "localized_community",
    loadSource: async () => {
      const community = await loadCommunityPage(
        safeSlug,
        localeParam,
        null,
        "",
        undefined,
        null,
      );
      if (!community) throw new Error("Public community unavailable.");
      return buildCommunityDiscoverySource(localeParam, community);
    },
  });
  return buildCommunitySurface(localeParam, safeSlug, null, discovery).metadata;
}

export default async function CommunityDetailRoute({
  params,
  searchParams,
}: CommunityDetailRouteProps) {
  const [{ locale: localeParam, slug: slugParam }, queryParams] =
    await Promise.all([
      params,
      searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    ]);
  if (!isPublicLocale(localeParam)) return notFound();
  const slug = normalizeCommunitySlug(slugParam);
  if (!slug) return notFound();
  const viewerScope = await currentViewerScope();

  const query = firstValue(queryParams.q).slice(0, 100);
  const kind = normalizeKind(firstValue(queryParams.kind));
  const cursor = firstValue(queryParams.cursor).slice(0, 512) || null;
  const community = await loadCommunityPage(
    slug,
    localeParam,
    viewerScope,
    query,
    kind,
    cursor,
  );
  if (!community) return notFound();
  const discovery = resolvePublicSurfaceDiscoveryForRequest(
    buildCommunityDiscoverySource(localeParam, community),
  );
  const surface = buildCommunitySurface(
    localeParam,
    slug,
    community,
    discovery,
  );

  return (
    <PublicCommunityView
      locale={localeParam}
      community={community}
      viewer={viewerScope ? "member" : "guest"}
      query={query}
      kind={kind}
      cursor={cursor ?? ""}
      actionStatus={firstValue(queryParams.communityAction) || null}
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

function buildCommunityDiscoverySource(
  locale: PublicLocale,
  community: PublicCommunityPageModel,
): PublicSurfaceDiscoverySource {
  const copy = getCommunityContentCopy(locale, community.contentKey);
  const contributions = community.contributions?.items ?? [];
  const activeCandidate =
    community.lifecycleState === "active" &&
    community.participationState === "open" &&
    community.navigationReady;
  return {
    consumerId: "localized_community",
    candidateState: activeCandidate ? "candidate" : "not_public_candidate",
    visibleText: [
      copy.name,
      copy.description,
      ...contributions.flatMap((item) => [
        item.title,
        item.excerpt,
        item.object.displayName,
      ]),
    ],
    distinctPublicEntityIds: [
      community.id,
      ...contributions.flatMap((item) => [item.id, item.object.id]),
    ],
    canonicalPath: localizedPath(locale, `/communities/${community.slug}`),
    equivalentLocales: [locale],
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

function normalizeKind(value: string): CommunityObjectKind {
  return value === "plant" || value === "animal" ? value : "all";
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
  } catch {
    return null;
  }
}
