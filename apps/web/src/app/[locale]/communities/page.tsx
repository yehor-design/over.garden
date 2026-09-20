import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";

import { PublicCommunityDirectory } from "@/components/public/public-community";
import {
  getCommunityContentCopy,
  getCommunityCopy,
} from "@/lib/community-copy";
import {
  isPublicLocale,
  localizedPath,
  type PublicLocale,
  PUBLIC_LOCALES,
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
import {
  describeWorkspaceFailure,
  recordPublicSurfaceFailure,
} from "@/server/workspace-failure";

interface CommunityDirectoryRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
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

/**
 * The directory is a request-time page, and says so before anything is read.
 *
 * It answered "temporarily unavailable" on production from the day the
 * `(default)` wrapper stopped redirecting until 2026-09-13, and nothing in any
 * log said why. The cause was two `catch` blocks in a row: `currentViewerScope`
 * swallowed the bail-out that `headers()` throws during a prerender — Next
 * signals "this page is dynamic" by *throwing*, and a `try/catch` around the
 * session read caught it — so the prerender walked on into the cached
 * directory read, which the aborted prerender then cancelled ("Connection
 * closed."), and the `catch` below turned that into the degraded state.
 * `connection()` first makes the page request-time in one line nobody can
 * catch; `unstable_rethrow` in both catches lets Next's own signals through;
 * and the degraded branch now writes one log line, so the next time a public
 * surface degrades, somebody reads about it.
 */
export async function renderCommunityDirectory(locale: PublicLocale) {
  await connection();
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
  } catch (error) {
    // Next's own control flow — a prerender bail-out, a redirect, a
    // not-found — is not a degraded directory, and swallowing it is exactly
    // the defect this branch used to hide.
    unstable_rethrow(error);
    recordPublicSurfaceFailure(describeWorkspaceFailure(error), {
      surface: "community_directory",
      section: "directory",
      locale,
    });
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
    equivalentLocales: [...PUBLIC_LOCALES],
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
  } catch (error) {
    // A guest is a guest whatever the session store said — but a prerender
    // bail-out is not a session failure, and it must reach Next.
    unstable_rethrow(error);
    return null;
  }
}
