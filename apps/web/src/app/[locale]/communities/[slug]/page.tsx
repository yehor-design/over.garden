import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicCommunityView } from "@/components/public/public-community";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { getCommunityCopy } from "@/lib/community-copy";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
} from "@/lib/public-localization";
import { resolveVisualCommunityScenario } from "@/lib/visual-fixtures/community-scenarios";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  getPublicCommunityPage,
  type CommunityObjectKind,
} from "@/server/community-repository";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";
import { scopedToUser, type RequestScope } from "@/server/request-scope";

export const dynamic = "force-dynamic";

interface CommunityDetailRouteProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

export async function generateMetadata({
  params,
}: CommunityDetailRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";
  const copy = getCommunityCopy(locale);
  const indexState = evaluatePublicSurfaceIndexability({ kind: "community" });
  const safeSlug = normalizeCommunitySlug(slug) ?? "unavailable";
  const basePath = `/communities/${safeSlug}`;

  return {
    title: `${copy.name} | OverGarden`,
    description: copy.description,
    alternates: {
      canonical: localizedPath(locale, basePath),
      languages: buildLanguageAlternates(basePath),
    },
    robots: indexState.robots,
    openGraph: { locale },
  };
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
  const visualScenario = resolveVisualCommunityScenario(
    queryParams.visualCommunity,
  );
  if (
    visualScenario &&
    (visualScenario.communitySlug !== slug ||
      visualScenario.expectedStatus === 404)
  ) {
    return notFound();
  }
  const viewerScope = visualScenario
    ? visualScenario.actorId
      ? scopedToUser(visualScenario.actorId)
      : null
    : await currentViewerScope();

  const query = firstValue(queryParams.q).slice(0, 100).trim();
  const kind = normalizeKind(firstValue(queryParams.kind));
  const cursor = firstValue(queryParams.cursor).slice(0, 512) || null;
  const community = await getPublicCommunityPage(slug, localeParam, {
    viewerScope,
    query,
    kind,
    cursor,
  });
  if (!community) return notFound();

  return (
    <PublicCommunityView
      locale={localeParam}
      community={community}
      viewer={viewerScope ? "member" : "guest"}
      query={query}
      kind={kind}
      cursor={cursor ?? ""}
      actionStatus={firstValue(queryParams.communityAction) || null}
      state={
        visualScenario?.state === "loading" || visualScenario?.state === "error"
          ? visualScenario.state
          : "ready"
      }
      visualScenarioId={visualScenario?.id}
      resumeAction={normalizeAuthIntentResumeAction(queryParams.authIntent)}
      resumeControl={normalizeAuthIntentResumeControl(queryParams.authControl)}
    />
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function normalizeKind(value: string): CommunityObjectKind {
  return value === "plant" || value === "animal" || value === "bee_colony"
    ? value
    : "all";
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
