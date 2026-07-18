import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { PublicProfileView } from "@/components/public/public-profile";
import { publicProfilePath } from "@/lib/garden/public-paths";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import {
  buildLanguageAlternates,
  isPublicLocale,
} from "@/lib/public-localization";
import { getPublicProfileCopy } from "@/lib/public-profile-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getProfileViewerState } from "@/server/profile-interaction-repository";
import {
  getPublicProfileEvidencePageByHandle,
  getPublicProfileLifecycleLookup,
} from "@/server/public-profile-repository";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";
import { scopedToUser } from "@/server/request-scope";

export const dynamic = "force-dynamic";

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
      getPublicProfileEvidencePageByHandle(handle, locale),
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
  const routeState =
    isPublicLocale(localeParam) && routeHandle
      ? await getCachedPublicProfileRouteState(routeHandle, localeParam)
      : UNAVAILABLE_PROFILE_ROUTE_STATE;
  const page = routeState.kind === "available" ? routeState.profile : null;
  const indexState = evaluatePublicSurfaceIndexability({
    kind: page ? "profile" : "missing",
  });

  if (!page) {
    return {
      title: `${copy.profileLabel} | OverGarden`,
      robots: indexState.robots,
    };
  }

  const basePath = `/@${page.handle}`;
  const description =
    page.bio ??
    `${copy.publicObjects}: ${page.summary.publicObjectCount}. ${copy.publicEntries}: ${page.summary.publicEntryCount}.`;

  return {
    title: `${page.displayName} (${page.mention}) · ${copy.metadataSuffix} | OverGarden`,
    description,
    alternates: {
      canonical: publicProfilePath(locale, page.handle),
      languages: buildLanguageAlternates(basePath),
    },
    robots: indexState.robots,
    openGraph: {
      locale,
      ...(page.avatarUrl
        ? { images: [{ url: page.avatarUrl, alt: page.avatarAlt }] }
        : {}),
    },
  };
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

  return (
    <main
      lang={localeParam}
      className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8"
    >
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
