import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { cache, Suspense } from "react";

import { PublicKnowledgeTopicPage } from "@/components/public/public-knowledge-topic";
import { EngagementFollowControl } from "@/app/engagement/public-engagement-panel";
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import { getPublicKnowledgeCopy } from "@/lib/public-knowledge-copy";
import {
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  buildPublicTopicDiscoverySource,
  type PublicTopicAggregationPage,
} from "@/server/public-topic-repository";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfacePayload,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import {
  readPublicKnowledgeEvidence,
  readPublicTopicPage,
} from "@/server/public-cache";
import { STATIC_PARAMS_PLACEHOLDER } from "@/server/public-prerender";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  StaticRenderDeferred,
  type PublicRenderPhase,
} from "@/server/static-public-page";
import { TopicViewerFollow } from "./topic-regions";
import { publicTopicPath } from "@/lib/garden/public-paths";
import { listKnowledgeForTopic } from "@/server/public-knowledge-related";
import { ReportContentLink } from "@/components/public/report-content-link";
import { getReportCopy } from "@/lib/moderation/report-copy";

const TOPIC_VISIBLE_ENTRIES = 8;

interface PublicTopicRouteProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** One topic read per request: `generateMetadata` and the page share it (React.cache). */
const loadTopicPage = cache((slug: string, locale: PublicLocale) =>
  readPublicTopicPage(slug, locale),
);

export async function generateMetadata({
  params,
}: PublicTopicRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;
  if (!isPublicLocale(localeParam)) {
    return missingTopicMetadata();
  }

  if (slug === STATIC_PARAMS_PLACEHOLDER) return {};
  const bounded = await resolvePublicSurfacePayload({
    consumerId: "localized_topic",
    document: "static",
    load: async () => {
      const topic = await loadTopicPage(slug, localeParam);
      if (!topic) throw new Error("Public topic unavailable.");
      return {
        source: buildPublicTopicDiscoverySource(
          topic,
          "localized_topic",
          "candidate",
          localeParam,
        ),
        payload: topic,
      };
    },
  });
  if (!bounded.payload) return missingTopicMetadata(localeParam);

  return buildTopicSurface(localeParam, bounded.payload, bounded).metadata;
}

export function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }];
}

export default async function TopicRoute({
  params,
  searchParams,
}: PublicTopicRouteProps) {
  const { locale: localeParam, slug } = await params;
  if (slug === STATIC_PARAMS_PLACEHOLDER) return null;
  if (!isPublicLocale(localeParam)) notFound();
  return renderStaticPublicPage({
    fallback: <RootLoadingSkeleton />,
    render: (phase) => renderTopicPage(localeParam, slug, searchParams, phase),
  });
}

/**
 * A topic as a static document (ADR-0032 D8). Its entries, its evidence and
 * its counts are the same for every reader; the one thing that is not — the
 * follow control, which says whether *this* reader already follows the topic —
 * is a request-time region below it, with the guest's control as its fallback.
 */
export async function renderTopicPage(
  locale: PublicLocale,
  slug: string,
  searchParams: PublicTopicRouteProps["searchParams"],
  phase: PublicRenderPhase,
) {
  await deferStaticRenderWithoutDatabase(phase);
  const topic = await loadTopicPage(slug, locale).catch((error: unknown) => {
    unstable_rethrow(error);
    if (error instanceof StaticRenderDeferred) throw error;
    // A topic that could not be read is not a topic that is not there.
    deferStaticRenderAfterFailure(phase);
    return null;
  });
  if (!topic) notFound();
  const followTarget = { kind: "topic" as const, ref: topic.topic.slug };
  const returnTo = localizedPath(locale, publicTopicPath(topic.topic.slug));
  const surface = buildTopicSurface(locale, topic);

  // The topic's entries are the page, so it shows as many as the evidence
  // read lists (eight), and the rest are one link away.
  const evidenceResult = await readPublicKnowledgeEvidence(
    { topicSlugs: [topic.topic.slug], catalogSlugs: [] },
    locale,
    TOPIC_VISIBLE_ENTRIES,
  ).then(
    (evidence) => ({
      evidence,
      state: evidence.totalCount > 0 ? ("ready" as const) : ("empty" as const),
    }),
    (error: unknown) => {
      unstable_rethrow(error);
      deferStaticRenderAfterFailure(phase);
      return { evidence: emptyEvidence(locale), state: "error" as const };
    },
  );

  return (
    <PublicKnowledgeTopicPage
      locale={locale}
      copy={getPublicKnowledgeCopy(locale)}
      topic={topic}
      evidence={evidenceResult.evidence}
      evidenceState={evidenceResult.state}
      related={listKnowledgeForTopic(locale, topic.topic.slug)}
      actions={
        <>
          <Suspense
            fallback={
              <EngagementFollowControl
                isAuthenticated={false}
                locale={locale}
                target={followTarget}
                returnTo={returnTo}
                following={false}
              />
            }
          >
            <TopicViewerFollow
              locale={locale}
              target={followTarget}
              returnTo={returnTo}
              searchParams={searchParams}
            />
          </Suspense>
          {/* ADR-0038 D5: anyone may report the tag page. */}
          <ReportContentLink
            address={publicTopicPath(topic.topic.slug)}
            label={getReportCopy(locale).link}
          />
        </>
      }
      jsonLd={surface.jsonLd}
    />
  );
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
    buildPublicTopicDiscoverySource(
      topic,
      "localized_topic",
      "candidate",
      locale,
    ),
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
