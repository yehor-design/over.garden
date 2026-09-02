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
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfaceDiscoveryFromLoad,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { scopedToUser, type RequestScope } from "@/server/request-scope";
import { readPublicCommunityDirectory } from "@/server/public-cache";

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
  const discovery = await resolvePublicSurfaceDiscoveryFromLoad({
    consumerId: "localized_community_directory",
    loadSource: async () =>
      buildCommunityDirectoryDiscoverySource(
        locale,
        await readPublicCommunityDirectory(),
      ),
  });
  return buildCommunityDirectorySurface(locale, [], discovery).metadata;
}

export async function renderCommunityDirectory(locale: PublicLocale) {
  const viewerScope = await currentViewerScope();
  try {
    const communities = viewerScope
      ? await listPublicCommunities(viewerScope)
      : await readPublicCommunityDirectory();
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
  // The directory lists every live community; readiness is a navigation
  // concern and never decides indexability (ADR-0022, D3).
  const active = communities.filter(
    (community) =>
      community.lifecycleState === "active" ||
      community.lifecycleState === "archived",
  );
  return {
    consumerId: "localized_community_directory",
    candidateState: "candidate",
    visibleText: [
      ...active.flatMap((community) => {
        const content = getCommunityContentCopy(locale, community.contentKey);
        return [content.name, content.description];
      }),
    ],
    distinctPublicEntityIds: active.map((community) => community.id),
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
