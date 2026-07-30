import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicKnowledgeTopicPage } from "@/components/public/public-knowledge-topic";
import { EngagementFollowControl } from "@/app/engagement/public-engagement-panel";
import { normalizeAuthIntentResumeAction } from "@/lib/auth/auth-intent-contract";
import { getPublicKnowledgeCopy } from "@/lib/public-knowledge-copy";
import {
  buildLanguageAlternates,
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  localizedPath,
} from "@/lib/public-localization";
import { resolveVisualFixturePublicKnowledgeMode } from "@/lib/visual-fixtures/public-knowledge-scenarios";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getEngagementFollowState } from "@/server/engagement-repository";
import { listPublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import { getPublicTopicAggregationPage } from "@/server/public-topic-repository";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";
import { scopedToUser } from "@/server/request-scope";

interface PublicTopicRouteProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: PublicTopicRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;
  if (!isPublicLocale(localeParam)) {
    return missingTopicMetadata();
  }

  const visual = await resolveVisualTopicRequest(
    localeParam,
    (await searchParams) ?? {},
  );
  if (visual.mode === "unavailable") return missingTopicMetadata(localeParam);
  const topic = await getPublicTopicAggregationPage(slug, {
    locale: localeParam,
    restrictToEntryIds: visual.publicEntryIds,
  }).catch(() => null);
  if (!topic) return missingTopicMetadata(localeParam);

  const indexState = visual.mode
    ? evaluatePublicSurfaceIndexability({ kind: "missing" })
    : evaluatePublicSurfaceIndexability({
        kind: "topic_aggregation",
        entryCount: topic.entryCount,
        aggregateBodyLength: topic.aggregateBodyLength,
        topicTrust: "curated",
        canonicalLocale: localeParam === DEFAULT_PUBLIC_LOCALE,
      });

  const canonicalPath = localizedPath(
    localeParam,
    `/topics/${topic.topic.slug}`,
  );

  return {
    title: `${topic.topic.label} | OverGarden`,
    description: getPublicKnowledgeCopy(localeParam).metadataDescription,
    alternates: {
      canonical: canonicalPath,
      languages: buildLanguageAlternates(`/topics/${topic.topic.slug}`),
    },
    robots: indexState.robots,
    openGraph: { locale: localeParam, url: canonicalPath },
  };
}

export default async function TopicRoute({
  params,
  searchParams,
}: PublicTopicRouteProps) {
  const { locale: localeParam, slug } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  const query = (await searchParams) ?? {};
  const [visual, session] = await Promise.all([
    resolveVisualTopicRequest(localeParam, query),
    getCurrentSession().catch(() => null),
  ]);
  if (visual.mode === "unavailable") notFound();
  const topic = await getPublicTopicAggregationPage(slug, {
    locale: localeParam,
    restrictToEntryIds: visual.publicEntryIds,
  }).catch(() => null);
  if (!topic) notFound();
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const followTarget = {
    kind: "topic" as const,
    ref: topic.topic.slug,
  };
  const following = scope
    ? await getEngagementFollowState(scope, followTarget).catch(() => false)
    : false;
  const returnTo = localizedPath(localeParam, `/topics/${topic.topic.slug}`);

  const evidenceResult =
    visual.mode === "loading" || visual.mode === "error"
      ? { evidence: emptyEvidence(localeParam), state: visual.mode }
      : await listPublicKnowledgeEvidence(
          { topicSlugs: [topic.topic.slug], catalogSlugs: [] },
          localeParam,
          {
            restrictToEntryIds: visual.publicEntryIds,
            visualCorpus: visual.mode === "corpus",
          },
        ).then(
          (evidence) => ({
            evidence,
            state:
              evidence.totalCount > 0 ? ("ready" as const) : ("empty" as const),
          }),
          () => ({
            evidence: emptyEvidence(localeParam),
            state: "error" as const,
          }),
        );

  return (
    <PublicKnowledgeTopicPage
      locale={localeParam}
      copy={getPublicKnowledgeCopy(localeParam)}
      topic={topic}
      evidence={evidenceResult.evidence}
      evidenceState={evidenceResult.state}
      visualCorpus={visual.mode === "corpus"}
      actions={
        <EngagementFollowControl
          isAuthenticated={Boolean(userId)}
          locale={localeParam}
          target={followTarget}
          returnTo={returnTo}
          following={following}
          resumeAction={normalizeAuthIntentResumeAction(
            firstParam(query.authIntent) ?? undefined,
          )}
        />
      }
    />
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function missingTopicMetadata(locale?: "uk" | "bg" | "ru"): Metadata {
  return {
    title: locale
      ? `${getPublicKnowledgeCopy(locale).publicTopicLabel} | OverGarden`
      : "OverGarden",
    robots: evaluatePublicSurfaceIndexability({ kind: "missing" }).robots,
  };
}

async function resolveVisualTopicRequest(
  locale: "uk" | "bg" | "ru",
  searchParams: Record<string, string | string[] | undefined>,
) {
  const mode = resolveVisualFixturePublicKnowledgeMode(
    searchParams,
    process.env,
  );
  if (!mode || mode === "unavailable") {
    return { mode, publicEntryIds: mode ? [] : null };
  }

  const { loadVisualFixtureKnowledgeCorpus } =
    await import("@/server/public-knowledge-visual-fixture");
  return {
    mode,
    publicEntryIds: loadVisualFixtureKnowledgeCorpus(locale).publicEntryIds,
  };
}

function emptyEvidence(locale: "uk" | "bg" | "ru") {
  return {
    items: [],
    totalCount: 0,
    hasMore: false,
    allEvidencePath: localizedPath(locale, "/journals"),
  };
}
