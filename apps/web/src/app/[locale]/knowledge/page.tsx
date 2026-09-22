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
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  listLocalizedAnswerPages,
  getContentAvailableLocales,
  listLocalizedGuides,
} from "@/server/public-localized-content";
import { listPublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import {
  authoredContentEntityIds,
  resolveAuthoredPublicSurfaceDiscovery,
} from "@/server/public-seo-content";
import { AUTHORED_PUBLIC_SURFACE_LASTMOD } from "@/server/public-surface-indexing-policy";
import { resolveUnresolvedPublicSurfaceDiscovery } from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import {
  readPublicKnowledgeEvidence,
  readPublicKnowledgeTopics,
} from "@/server/public-cache";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  type PublicRenderPhase,
} from "@/server/static-public-page";
import { publicTopicPath } from "@/lib/garden/public-paths";
import { localizeTopicLabel } from "@/lib/system-topic-labels";

type SearchParams = Record<string, string | string[] | undefined>;

interface PublicKnowledgeRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams>;
}

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PublicKnowledgeRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery("localized_knowledge_hub")
        .decision.robots,
    };
  }

  return buildKnowledgeSurface(localeParam).metadata;
}

export async function renderPublicKnowledgePage(
  locale: PublicLocale,
  searchParams: SearchParams = {},
  phase: PublicRenderPhase = "request",
) {
  await deferStaticRenderWithoutDatabase(phase);
  const request = normalizePublicKnowledgeRequest(searchParams);
  const surface = buildKnowledgeSurface(locale);
  const guides = listLocalizedGuides(locale);
  const answers = listLocalizedAnswerPages(locale);
  const evidenceRequests = [...guides, ...answers].map((content) =>
    readPublicKnowledgeEvidence(content.knowledge.evidence, locale),
  );
  const [topicsResult, evidenceResults] = await Promise.all([
    Promise.allSettled([readPublicKnowledgeTopics()]).then(
      (results) => results[0],
    ),
    Promise.allSettled(evidenceRequests),
  ]);
  const failed =
    topicsResult?.status === "rejected" ||
    evidenceResults.some((result) => result.status === "rejected");
  // A hub with no topics and no evidence counts renders successfully and would
  // be cached as the shell for everyone (ADR-0032 D4).
  if (failed) deferStaticRenderAfterFailure(phase);

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
          path: publicTopicPath(topic.slug),
          // A system topic is named in the page's language (the cached list
          // is language-neutral); a gardener's tag is the gardener's word.
          title: localizeTopicLabel(locale, topic.slug, topic.label),
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
      jsonLd={surface.jsonLd}
    />
  );
}

function buildKnowledgeSurface(locale: PublicLocale) {
  const copy = getPublicKnowledgeCopy(locale);
  const guides = listLocalizedGuides(locale);
  const answers = listLocalizedAnswerPages(locale);
  const items = [...guides, ...answers];
  const discovery = resolveAuthoredPublicSurfaceDiscovery({
    consumerId: "localized_knowledge_hub",
    canonicalPath: localizedPath(locale, "/knowledge"),
    equivalentLocales: getContentAvailableLocales("/knowledge"),
    visibleText: [...items.flatMap((item) => [item.title, item.description])],
    distinctPublicEntityIds: authoredContentEntityIds(
      "/knowledge",
      items.map((item) => item.path),
    ),
    meaningfulContentAt: AUTHORED_PUBLIC_SURFACE_LASTMOD,
    candidateState: "candidate",
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
}: PublicKnowledgeRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  return renderStaticPublicKnowledgePage(localeParam);
}

/** The hub with nothing asked of it: the static document (ADR-0032 D8). */
export function renderStaticPublicKnowledgePage(locale: PublicLocale) {
  return renderStaticPublicPage({
    render: (phase) => renderPublicKnowledgePage(locale, {}, phase),
    fallback: (
      <PublicKnowledgeHub
        locale={locale}
        copy={getPublicKnowledgeCopy(locale)}
        request={normalizePublicKnowledgeRequest({})}
        items={[]}
        contextItems={[]}
        state="loading"
      />
    ),
  });
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
