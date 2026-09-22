import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import {
  ProfileActions,
  PublicProfileView,
} from "@/components/public/public-profile";
import { normalizePublicProfileTab } from "@/lib/public-profile-tabs";
import {
  publicProfileBasePath,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import { absolutePublicUrl } from "@/lib/garden/public-url";
import {
  PUBLIC_LOCALES,
  isPublicLocale,
  type PublicLocale,
} from "@/lib/public-localization";
import { getPublicProfileCopy } from "@/lib/public-profile-copy";
import { type PublicProfileEvidencePage } from "@/server/public-profile-repository";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfacePayload,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { readPublicProfileEvidencePage } from "@/server/public-cache";
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import { STATIC_PARAMS_PLACEHOLDER } from "@/server/public-prerender";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  StaticRenderDeferred,
  type PublicRenderPhase,
} from "@/server/static-public-page";
import { ProfileActionStatus, ProfileViewerActions } from "./profile-regions";

export interface LocalizedPublicProfileRouteProps {
  params: Promise<{ locale: string; profileHandle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const GUEST_PROFILE_VIEWER = { kind: "guest" } as const;

export function generateStaticParams() {
  return [{ profileHandle: STATIC_PARAMS_PLACEHOLDER }];
}

export async function generateMetadata({
  params,
}: LocalizedPublicProfileRouteProps): Promise<Metadata> {
  const { locale: localeParam, profileHandle } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";
  const copy = getPublicProfileCopy(locale);
  const routeHandle = routeHandleFromSegment(profileHandle);
  const bounded =
    isPublicLocale(localeParam) && routeHandle
      ? await resolvePublicSurfacePayload({
          consumerId: "localized_profile",
          document: "static",
          load: async () => {
            const profile = await readPublicProfileEvidencePage(
              routeHandle,
              localeParam,
            );
            if (!profile) throw new Error("Public profile unavailable.");
            return {
              source: buildProfileDiscoverySource(localeParam, profile),
              payload: profile,
            };
          },
        })
      : null;
  const page = bounded?.payload ?? null;
  const unresolved =
    resolveUnresolvedPublicSurfaceDiscovery("localized_profile");

  if (!page) {
    return {
      title: `${copy.profileLabel} | OverGarden`,
      robots: unresolved.decision.robots,
    };
  }

  return buildProfileSurface(locale, page, bounded ?? undefined).metadata;
}

export default async function LocalizedPublicProfileRoute({
  params,
  searchParams,
}: LocalizedPublicProfileRouteProps) {
  const { locale: localeParam, profileHandle } = await params;
  if (!isPublicLocale(localeParam)) notFound();
  if (profileHandle === STATIC_PARAMS_PLACEHOLDER) return null;
  const handle = routeHandleFromSegment(profileHandle);
  if (!handle) notFound();
  return renderStaticPublicPage({
    fallback: <RootLoadingSkeleton />,
    render: (phase) =>
      renderPublicProfile(localeParam, handle, searchParams, "objects", phase),
  });
}

export async function renderPublicProfile(
  localeParam: PublicLocale,
  routeHandle: string,
  searchParams: LocalizedPublicProfileRouteProps["searchParams"],
  activeTab: ReturnType<typeof normalizePublicProfileTab> = "objects",
  phase: PublicRenderPhase = "request",
) {
  await deferStaticRenderWithoutDatabase(phase);
  const profile = await readPublicProfileEvidencePage(
    routeHandle,
    localeParam,
  ).catch((error: unknown) => {
    unstable_rethrow(error);
    if (error instanceof StaticRenderDeferred) throw error;
    deferStaticRenderAfterFailure(phase);
    throw error;
  });
  if (!profile) notFound();
  const surface = buildProfileSurface(localeParam, profile);
  const serializedJsonLd = serializePublicSurfaceJsonLd(surface.jsonLd);

  return (
    <main
      lang={localeParam}
      className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <PublicProfileView
        profile={profile}
        locale={localeParam}
        viewer={GUEST_PROFILE_VIEWER}
        activeTab={activeTab}
        actionSlot={
          <Suspense
            fallback={
              <ProfileActions
                profile={profile}
                locale={localeParam}
                viewer={GUEST_PROFILE_VIEWER}
                returnTo={publicProfilePath(localeParam, profile.handle)}
                resumeAction={null}
              />
            }
          >
            <ProfileViewerActions
              profile={profile}
              locale={localeParam}
              searchParams={searchParams}
            />
          </Suspense>
        }
      />
      <Suspense fallback={null}>
        <ProfileActionStatus locale={localeParam} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function buildProfileSurface(
  locale: PublicLocale,
  page: PublicProfileEvidencePage,
  discovery: PublicSurfaceDiscoveryResult = resolvePublicSurfaceDiscoveryForRequest(
    buildProfileDiscoverySource(locale, page),
  ),
) {
  const copy = getPublicProfileCopy(locale);
  const description =
    page.bio ??
    `${copy.publicObjects}: ${page.summary.publicObjectCount}. ${copy.publicEntries}: ${page.summary.publicEntryCount}.`;
  const output = buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: `${page.displayName} (${page.mention}) · ${copy.metadataSuffix} | OverGarden`,
    description,
    visibleFacts: {
      type: "ProfilePage",
      name: page.displayName,
      description,
      trustQualifier: "Public active OverGarden profile",
      // The page is *of* a person, and every entry that names this gardener as
      // its author points at the same `@id` (ADR-0029 D13).
      person: {
        id: absolutePublicUrl(publicProfileBasePath(page.handle)),
        name: page.displayName,
        url: absolutePublicUrl(publicProfilePath(locale, page.handle)),
        ...(page.avatarUrl ? { image: page.avatarUrl } : {}),
      },
    },
  });
  if (page.avatarUrl) {
    output.metadata.openGraph = {
      ...output.metadata.openGraph,
      images: [{ url: page.avatarUrl, alt: page.avatarAlt }],
    };
  }
  return output;
}

function buildProfileDiscoverySource(
  locale: PublicLocale,
  page: PublicProfileEvidencePage,
): PublicSurfaceDiscoverySource {
  const copy = getPublicProfileCopy(locale);
  const description =
    page.bio ??
    `${copy.publicObjects}: ${page.summary.publicObjectCount}. ${copy.publicEntries}: ${page.summary.publicEntryCount}.`;
  return {
    consumerId: "localized_profile",
    candidateState: "candidate",
    visibleText: [
      page.displayName,
      page.mention,
      page.bio ?? "",
      description,
      ...page.objects.flatMap((object) => [
        object.displayName,
        object.identityLabel ?? "",
      ]),
      ...page.journals.flatMap((journal) => [
        journal.title,
        journal.bodyPreview,
        journal.context.label,
      ]),
    ],
    distinctPublicEntityIds: [
      ...page.objects.map((object) => object.objectId),
      ...page.journals.map((journal) => journal.entryId),
    ],
    canonicalPath: publicProfilePath(locale, page.handle),
    equivalentLocales: [...PUBLIC_LOCALES],
  };
}

function routeHandleFromSegment(segment: string) {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.startsWith("@") ? decoded : null;
  } catch {
    return null;
  }
}
