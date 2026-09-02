import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { PublicProfileView } from "@/components/public/public-profile";
import { publicProfilePath } from "@/lib/garden/public-paths";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { isPublicLocale, type PublicLocale } from "@/lib/public-localization";
import { getPublicProfileCopy } from "@/lib/public-profile-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getProfileViewerState } from "@/server/profile-interaction-repository";
import {
  getPublicProfileLifecycleLookup,
  type PublicProfileEvidencePage,
} from "@/server/public-profile-repository";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfacePayload,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { scopedToUser } from "@/server/request-scope";
import { readPublicProfileEvidencePage } from "@/server/public-cache";

interface LocalizedPublicProfileRouteProps {
  params: Promise<{ locale: string; profileHandle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};
const GUEST_PROFILE_VIEWER = { kind: "guest" } as const;
const UNAVAILABLE_PROFILE_ROUTE_STATE = { kind: "unavailable" } as const;

const getCachedPublicProfileRouteState = cache(
  async (handle: string, locale: "uk" | "bg" | "ru") => {
    const session = await getCurrentSession();
    const viewerUserId = session?.user?.id ?? null;
    const lifecycle = await getPublicProfileLifecycleLookup(
      handle,
      viewerUserId,
    );
    if (lifecycle.status !== "active") {
      return UNAVAILABLE_PROFILE_ROUTE_STATE;
    }

    const viewerPromise = viewerUserId
      ? getProfileViewerState(
          scopedToUser(viewerUserId, getSessionId(session)),
          handle,
        )
      : Promise.resolve(GUEST_PROFILE_VIEWER);
    const [profile, viewer] = await Promise.all([
      readPublicProfileEvidencePage(handle, locale),
      viewerPromise,
    ]);

    if (
      !profile ||
      viewer.kind === "blocked" ||
      viewer.kind === "unavailable"
    ) {
      return UNAVAILABLE_PROFILE_ROUTE_STATE;
    }

    return { kind: "available", profile, viewer } as const;
  },
);

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
          load: async () => {
            const routeState = await getCachedPublicProfileRouteState(
              routeHandle,
              localeParam,
            );
            if (routeState.kind !== "available") {
              throw new Error("Public profile unavailable.");
            }
            return {
              source: buildProfileDiscoverySource(
                localeParam,
                routeState.profile,
              ),
              payload: routeState.profile,
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
  const [{ locale: localeParam, profileHandle }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
  ]);

  if (!isPublicLocale(localeParam)) notFound();
  const routeHandle = routeHandleFromSegment(profileHandle);
  if (!routeHandle) notFound();

  const routeState = await getCachedPublicProfileRouteState(
    routeHandle,
    localeParam,
  );
  if (routeState.kind === "unavailable") notFound();
  const { profile, viewer } = routeState;
  const resumeAction = profileResumeAction(query.authIntent);
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
        viewer={viewer}
        actionStatus={firstParam(query.profileAction)}
        resumeAction={resumeAction}
        resumeControl={normalizeAuthIntentResumeControl(query.authControl)}
      />
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
    equivalentLocales: [locale],
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

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function profileResumeAction(value: string | string[] | undefined) {
  const action = normalizeAuthIntentResumeAction(value);
  return action === "follow" || action === "report" || action === "block"
    ? action
    : null;
}
