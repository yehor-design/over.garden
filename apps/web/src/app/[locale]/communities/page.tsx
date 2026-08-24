import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicCommunityDirectory } from "@/components/public/public-community";
import {
  getCommunityContentCopy,
  getCommunityCopy,
} from "@/lib/community-copy";
import {
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  listPublicCommunities,
  type PublicCommunityDirectoryItem,
} from "@/server/community-repository";
import {
  combinePublicProjectionQualityClasses,
  latestMeaningfulContentTimestamp,
  PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfaceDiscoveryWithDeadline,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { AUTHORED_PUBLIC_SURFACE_LASTMOD } from "@/server/public-surface-indexing-policy";
import { scopedToUser, type RequestScope } from "@/server/request-scope";

export const dynamic = "force-dynamic";

interface CommunityDirectoryRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: CommunityDirectoryRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery(
        "localized_community_directory",
      ).decision.robots,
    };
  }
  const locale = localeParam;
  const discovery = await resolvePublicSurfaceDiscoveryWithDeadline({
    consumerId: "localized_community_directory",
    evaluatedAt: new Date(),
    deadlineMs: PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
    loadSource: async () =>
      buildCommunityDirectoryDiscoverySource(
        locale,
        await listPublicCommunities(null),
      ),
  });
  return buildCommunityDirectorySurface(locale, [], discovery).metadata;
}

export async function renderCommunityDirectory(locale: PublicLocale) {
  const viewerScope = await currentViewerScope();
  try {
    const communities = await listPublicCommunities(viewerScope);
    const discovery = resolvePublicSurfaceDiscoveryForRequest(
      buildCommunityDirectoryDiscoverySource(locale, communities),
    );
    const surface = buildCommunityDirectorySurface(
      locale,
      communities,
      discovery,
    );
    return (
      <PublicCommunityDirectory
        locale={locale}
        communities={communities}
        state="ready"
        jsonLd={surface.jsonLd}
      />
    );
  } catch {
    return (
      <PublicCommunityDirectory
        locale={locale}
        communities={[]}
        state="error"
      />
    );
  }
}

function buildCommunityDirectoryDiscoverySource(
  locale: PublicLocale,
  communities: readonly PublicCommunityDirectoryItem[],
): PublicSurfaceDiscoverySource {
  const copy = getCommunityCopy(locale);
  const active = communities.filter(
    (community) =>
      community.lifecycleState === "active" && community.navigationReady,
  );
  return {
    consumerId: "localized_community_directory",
    candidateState: "candidate",
    qualityClass: combinePublicProjectionQualityClasses(
      active.map((community) => community.qualityClass),
    ),
    visibleText: [
      copy.directoryTitle,
      copy.directoryDescription,
      ...active.flatMap((community) => {
        const content = getCommunityContentCopy(locale, community.contentKey);
        return [content.name, content.description];
      }),
    ],
    distinctPublicEntityIds: active.map((community) => community.id),
    meaningfulContentAt:
      latestMeaningfulContentTimestamp(
        active.map((community) => community.updatedAt),
      ) ?? AUTHORED_PUBLIC_SURFACE_LASTMOD,
    canonicalPath: localizedPath(locale, "/communities"),
    equivalentLocales: getLanguageSwitcherLocales(locale),
  };
}

function buildCommunityDirectorySurface(
  locale: PublicLocale,
  communities: readonly PublicCommunityDirectoryItem[],
  discovery: PublicSurfaceDiscoveryResult,
) {
  const copy = getCommunityCopy(locale);
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: `${copy.directoryTitle} | OverGarden`,
    description: copy.directoryDescription,
    visibleFacts: {
      type: "CollectionPage",
      name: copy.directoryTitle,
      description: copy.directoryDescription,
      itemNames: communities.map(
        (community) =>
          getCommunityContentCopy(locale, community.contentKey).name,
      ),
    },
  });
}

export default async function CommunityDirectoryRoute({
  params,
}: CommunityDirectoryRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) return notFound();
  return renderCommunityDirectory(localeParam);
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
