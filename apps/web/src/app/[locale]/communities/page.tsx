import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";

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
import { type PublicCommunityDirectoryItem } from "@/server/community-repository";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfaceDiscoveryFromLoad,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { readPublicCommunityDirectory } from "@/server/public-cache";
import {
  describeWorkspaceFailure,
  recordPublicSurfaceFailure,
} from "@/server/workspace-failure";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  StaticRenderDeferred,
  type PublicRenderPhase,
} from "@/server/static-public-page";

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
    document: "static",
    loadSource: async () =>
      buildCommunityDirectoryDiscoverySource(
        locale,
        await readPublicCommunityDirectory(),
      ),
  });
  return buildCommunityDirectorySurface(locale, [], discovery).metadata;
}

/**
 * The directory is a static document (ADR-0032): the same list for every
 * reader, prerendered with its cards, photographs and title in the first bytes.
 *
 * It used to read the session first and hand a gardener a list with the covers
 * and counts of anyone they had blocked left out. A static page cannot know
 * who is reading, and the directory now follows the home feed there: a block
 * governs what a gardener is offered to do and whose profile they are shown
 * (the proxy refuses it), not which communities a public list names.
 *
 * A failed read is never prerendered (D4): in a static attempt it defers to
 * the request, where the degraded state is drawn for that reader only and
 * written to the log, so the next time a public surface degrades somebody
 * reads about it.
 */
export async function renderCommunityDirectory(
  locale: PublicLocale,
  phase: PublicRenderPhase = "request",
) {
  await deferStaticRenderWithoutDatabase(phase);
  try {
    const communities = await readPublicCommunityDirectory();
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
    if (error instanceof StaticRenderDeferred) throw error;
    deferStaticRenderAfterFailure(phase);
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

export function renderStaticCommunityDirectory(locale: PublicLocale) {
  return renderStaticPublicPage({
    render: (phase) => renderCommunityDirectory(locale, phase),
    fallback: (
      <PublicCommunityDirectory
        locale={locale}
        communities={[]}
        state="loading"
      />
    ),
  });
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
  return renderStaticCommunityDirectory(localeParam);
}
