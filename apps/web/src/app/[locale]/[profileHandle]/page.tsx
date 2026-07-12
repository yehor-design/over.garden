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
import { getPublicProfileEvidencePageByHandle } from "@/server/public-profile-repository";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";
import { scopedToUser } from "@/server/request-scope";

export const dynamic = "force-dynamic";

interface LocalizedPublicProfileRouteProps {
  params: Promise<{ locale: string; profileHandle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

const getCachedPublicProfilePage = cache(
  (handle: string, locale: "uk" | "bg" | "ru") =>
    getPublicProfileEvidencePageByHandle(handle, locale),
);

export async function generateMetadata({
  params,
}: LocalizedPublicProfileRouteProps): Promise<Metadata> {
  const { locale: localeParam, profileHandle } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";
  const copy = getPublicProfileCopy(locale);
  const routeHandle = routeHandleFromSegment(profileHandle);
  const page =
    isPublicLocale(localeParam) && routeHandle
      ? await getCachedPublicProfilePage(routeHandle, localeParam)
      : null;
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
  const [{ locale: localeParam, profileHandle }, query, session] =
    await Promise.all([
      params,
      searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
      getCurrentSession(),
    ]);

  if (!isPublicLocale(localeParam)) notFound();
  const routeHandle = routeHandleFromSegment(profileHandle);
  if (!routeHandle) notFound();

  const profile = await getCachedPublicProfilePage(routeHandle, localeParam);
  if (!profile) notFound();

  const viewer = session?.user?.id
    ? await getProfileViewerState(
        scopedToUser(session.user.id, getSessionId(session)),
        profile.handle,
      )
    : ({ kind: "guest" } as const);
  if (viewer.kind === "blocked" || viewer.kind === "unavailable") notFound();
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
