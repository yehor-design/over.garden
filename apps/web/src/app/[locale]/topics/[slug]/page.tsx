import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicKnowledgeTopicPage } from "@/components/public/public-knowledge-topic";
import { EngagementFollowControl } from "@/app/engagement/public-engagement-panel";
import { normalizeAuthIntentResumeAction } from "@/lib/auth/auth-intent-contract";
import { getPublicKnowledgeCopy } from "@/lib/public-knowledge-copy";
import {
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getEngagementFollowState } from "@/server/engagement-repository";
import { listPublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import {
  buildPublicTopicDiscoverySource,
  getPublicTopicAggregationPage,
  type PublicTopicAggregationPage,
} from "@/server/public-topic-repository";
import {
  PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfacePayloadWithDeadline,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { scopedToUser } from "@/server/request-scope";

interface PublicTopicRouteProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: PublicTopicRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;
  if (!isPublicLocale(localeParam)) {
    return missingTopicMetadata();
  }

  const bounded = await resolvePublicSurfacePayloadWithDeadline({
    consumerId: "localized_topic",
    evaluatedAt: new Date(),
    deadlineMs: PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
    load: async () => {
      const topic = await getPublicTopicAggregationPage(slug, {
        locale: localeParam,
      });
      if (!topic) throw new Error("Public topic unavailable.");
      return {
        source: buildPublicTopicDiscoverySource(
          topic,
          "localized_topic",
          "candidate",
        ),
        payload: topic,
      };
    },
  });
  if (!bounded.payload) return missingTopicMetadata(localeParam);

  return buildTopicSurface(localeParam, bounded.payload, bounded).metadata;
}

export default async function TopicRoute({
  params,
  searchParams,
}: PublicTopicRouteProps) {
  const { locale: localeParam, slug } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  const query = (await searchParams) ?? {};
  const session = await getCurrentSession().catch(() => null);
  const topic = await getPublicTopicAggregationPage(slug, {
    locale: localeParam,
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
  const surface = buildTopicSurface(localeParam, topic);

  const evidenceResult = await listPublicKnowledgeEvidence(
    { topicSlugs: [topic.topic.slug], catalogSlugs: [] },
    localeParam,
  ).then(
    (evidence) => ({
      evidence,
      state: evidence.totalCount > 0 ? ("ready" as const) : ("empty" as const),
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
      jsonLd={surface.jsonLd}
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
    robots:
      resolveUnresolvedPublicSurfaceDiscovery("localized_topic").decision
        .robots,
  };
}

function buildTopicSurface(
  locale: PublicLocale,
  topic: PublicTopicAggregationPage,
  discovery: PublicSurfaceDiscoveryResult = resolvePublicSurfaceDiscoveryForRequest(
    buildPublicTopicDiscoverySource(topic, "localized_topic", "candidate"),
  ),
) {
  const copy = getPublicKnowledgeCopy(locale);
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: null,
    title: `${topic.topic.label} | OverGarden`,
    description: copy.metadataDescription,
    visibleFacts: {
      type: "CollectionPage",
      name: topic.topic.label,
      description: copy.metadataDescription,
      itemNames: topic.entries.map((entry) => entry.title),
      trustQualifier: "Curated topic with public gardener evidence",
    },
  });
}

function emptyEvidence(locale: "uk" | "bg" | "ru") {
  return {
    items: [],
    totalCount: 0,
    hasMore: false,
    allEvidencePath: localizedPath(locale, "/journals"),
  };
}
