import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PublicKnowledgeHub,
  type PublicKnowledgeHubItem,
  type PublicKnowledgeHubState,
} from "@/components/public/public-knowledge-hub";
import {
  filterPublicKnowledgeItems,
  normalizePublicKnowledgeRequest,
} from "@/lib/public-knowledge-content";
import {
  formatPublicKnowledgeEvidenceCount,
  getPublicKnowledgeCopy,
} from "@/lib/public-knowledge-copy";
import {
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import { resolveVisualFixturePublicKnowledgeMode } from "@/lib/visual-fixtures/public-knowledge-scenarios";
import {
  listLocalizedAnswerPages,
  getContentAvailableLocales,
  listLocalizedGuides,
} from "@/server/public-localized-content";
import { listPublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import { listPublicKnowledgeTopics } from "@/server/public-topic-repository";
import {
  authoredContentEntityIds,
  resolveAuthoredPublicSurfaceDiscovery,
} from "@/server/public-seo-content";
import { AUTHORED_PUBLIC_SURFACE_LASTMOD } from "@/server/public-surface-indexing-policy";
import { resolveUnresolvedPublicSurfaceDiscovery } from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

type SearchParams = Record<string, string | string[] | undefined>;

interface PublicKnowledgeRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
  searchParams,
}: PublicKnowledgeRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery("localized_knowledge_hub")
        .decision.robots,
    };
  }

  const visualMode = resolveVisualFixturePublicKnowledgeMode(
    (await searchParams) ?? {},
    process.env,
  );
  return buildKnowledgeSurface(localeParam, Boolean(visualMode)).metadata;
}

export async function renderPublicKnowledgePage(
  locale: PublicLocale,
  searchParams: SearchParams = {},
) {
  const request = normalizePublicKnowledgeRequest(searchParams);
  const visualMode = resolveVisualFixturePublicKnowledgeMode(
    searchParams,
    process.env,
  );
  const surface = buildKnowledgeSurface(locale, Boolean(visualMode));
  if (visualMode === "loading" || visualMode === "error") {
    return (
      <PublicKnowledgeHub
        locale={locale}
        copy={getPublicKnowledgeCopy(locale)}
        request={request}
        items={[]}
        contextItems={[]}
        state={visualMode}
        jsonLd={surface.jsonLd}
      />
    );
  }

  const visualCorpus =
    visualMode === "corpus"
      ? await loadVisualFixtureKnowledgeCorpus(locale)
      : null;
  const guides = visualCorpus?.guides ?? listLocalizedGuides(locale);
  const answers = visualCorpus?.answers ?? listLocalizedAnswerPages(locale);
  const evidenceRequests = [...guides, ...answers].map((content) =>
    listPublicKnowledgeEvidence(content.knowledge.evidence, locale, {
      restrictToEntryIds: visualCorpus?.publicEntryIds ?? null,
      visualCorpus: Boolean(visualCorpus),
    }),
  );
  const [topicsResult, evidenceResults] = await Promise.all([
    Promise.allSettled([
      listPublicKnowledgeTopics({
        restrictToEntryIds: visualCorpus?.publicEntryIds ?? null,
        restrictToTopicSlugs: visualCorpus?.topicSlugs ?? null,
      }),
    ]).then((results) => results[0]),
    Promise.allSettled(evidenceRequests),
  ]);
  const failed =
    topicsResult?.status === "rejected" ||
    evidenceResults.some((result) => result.status === "rejected");

  const authoredItems: PublicKnowledgeHubItem[] = [
    ...guides.map((guide, index) => ({
      kind: "guide" as const,
      path: guide.path,
      title: guide.title,
      description: guide.description,
      objectKinds: guide.knowledge.objectKinds,
      evidenceCount: fulfilledEvidenceCount(evidenceResults[index]),
      updatedDate: guide.editorial.updatedDate,
      indexable: true,
    })),
    ...answers.map((answer, index) => ({
      kind: "answer" as const,
      path: answer.path,
      title: answer.title,
      description: answer.description,
      objectKinds: answer.knowledge.objectKinds,
      evidenceCount: fulfilledEvidenceCount(
        evidenceResults[guides.length + index],
      ),
      updatedDate: answer.editorial.updatedDate,
      indexable: true,
    })),
  ];
  const topicItems: PublicKnowledgeHubItem[] =
    topicsResult?.status === "fulfilled"
      ? topicsResult.value.map((topic) => ({
          kind: "topic" as const,
          path: `/topics/${topic.slug}`,
          title: topic.label,
          description: topicDescription(locale, topic.entryCount),
          objectKinds: topic.objectKinds,
          evidenceCount: topic.entryCount,
          updatedDate: topic.latestPublishedAt,
          indexable: topic.indexState.isIndexable,
        }))
      : [];
  const contextItems = [...topicItems, ...authoredItems];
  const items = filterPublicKnowledgeItems(contextItems, request);
  const state: PublicKnowledgeHubState = failed
    ? "error"
    : items.length === 0
      ? "empty"
      : "ready";

  return (
    <PublicKnowledgeHub
      locale={locale}
      copy={getPublicKnowledgeCopy(locale)}
      request={request}
      items={items}
      contextItems={items}
      state={state}
      visualCorpus={Boolean(visualCorpus)}
      jsonLd={surface.jsonLd}
    />
  );
}

function buildKnowledgeSurface(locale: PublicLocale, isVisualFixture: boolean) {
  const copy = getPublicKnowledgeCopy(locale);
  const guides = listLocalizedGuides(locale);
  const answers = listLocalizedAnswerPages(locale);
  const items = [...guides, ...answers];
  const discovery = resolveAuthoredPublicSurfaceDiscovery({
    consumerId: "localized_knowledge_hub",
    canonicalPath: localizedPath(locale, "/knowledge"),
    equivalentLocales: getContentAvailableLocales("/knowledge"),
    visibleText: [
      copy.metadataTitle,
      copy.metadataDescription,
      copy.heading,
      copy.intro,
      ...items.flatMap((item) => [item.title, item.description]),
    ],
    distinctPublicEntityIds: authoredContentEntityIds(
      "/knowledge",
      items.map((item) => item.path),
    ),
    meaningfulContentAt: AUTHORED_PUBLIC_SURFACE_LASTMOD,
    candidateState: isVisualFixture ? "not_public_candidate" : "candidate",
  });
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    visibleFacts: {
      type: "CollectionPage",
      name: copy.heading,
      description: copy.intro,
      itemNames: items.map((item) => item.title),
      trustQualifier: "OverGarden editorial knowledge",
    },
  });
}

export default async function PublicKnowledgeRoute({
  params,
  searchParams,
}: PublicKnowledgeRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  return renderPublicKnowledgePage(localeParam, (await searchParams) ?? {});
}

function fulfilledEvidenceCount(
  result:
    | PromiseSettledResult<
        Awaited<ReturnType<typeof listPublicKnowledgeEvidence>>
      >
    | undefined,
) {
  return result?.status === "fulfilled" ? result.value.totalCount : 0;
}

function topicDescription(locale: PublicLocale, entryCount: number) {
  const count = formatPublicKnowledgeEvidenceCount(
    entryCount,
    locale,
    getPublicKnowledgeCopy(locale),
  );
  return {
    uk: `${count} у перевіреній темі.`,
    bg: `${count} в проверена тема.`,
    ru: `${count} в проверенной теме.`,
  }[locale];
}

async function loadVisualFixtureKnowledgeCorpus(locale: PublicLocale) {
  const visualFixture =
    await import("@/server/public-knowledge-visual-fixture");
  return visualFixture.loadVisualFixtureKnowledgeCorpus(locale);
}
