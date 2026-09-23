import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";

import {
  PublicKnowledgeHub,
  type PublicKnowledgeHubItem,
  type PublicKnowledgeHubState,
} from "@/components/public/public-knowledge-hub";
import {
  filterPublicKnowledgeItems,
  normalizePublicKnowledgeRequest,
} from "@/lib/public-knowledge-content";
import { getPublicKnowledgeCopy } from "@/lib/public-knowledge-copy";
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
import {
  authoredContentEntityIds,
  knowledgeSearchText,
  resolveAuthoredPublicSurfaceDiscovery,
} from "@/server/public-seo-content";
import { AUTHORED_PUBLIC_SURFACE_LASTMOD } from "@/server/public-surface-indexing-policy";
import { resolveUnresolvedPublicSurfaceDiscovery } from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { readPublicKnowledgeTopics } from "@/server/public-cache";
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
  // The one thing the hub reads is which topics exist and what they hold.
  // An answer's row says what it rests on, which is in the code; how many
  // gardeners wrote about the same plant is the answer page's to say.
  const topicsResult = await readPublicKnowledgeTopics().then(
    (topics) => ({ status: "fulfilled" as const, topics }),
    (error: unknown) => {
      unstable_rethrow(error);
      return { status: "rejected" as const, topics: [] };
    },
  );
  const failed = topicsResult.status === "rejected";
  // A hub with no topics renders successfully and would be cached as the
  // shell for everyone (ADR-0032 D4).
  if (failed) deferStaticRenderAfterFailure(phase);

  const authoredItems: PublicKnowledgeHubItem[] = [...answers, ...guides].map(
    (content) => ({
      kind: content.kind === "guide" ? ("guide" as const) : ("answer" as const),
      path: content.path,
      title: content.title,
      description: content.description,
      objectKinds: content.knowledge.objectKinds,
      subject: content.knowledge.subject,
      sourceCount: content.editorial.sources.length,
      updatedDate: content.editorial.updatedDate,
      searchText: knowledgeSearchText(content),
    }),
  );
  const topicItems: PublicKnowledgeHubItem[] = topicsResult.topics
    // A topic nobody has written under yet is an empty page; the hub lists
    // what a reader can read.
    .filter((topic) => topic.entryCount > 0)
    .map((topic) => ({
      kind: "topic" as const,
      path: publicTopicPath(topic.slug),
      // A system topic is named in the page's language (the cached list is
      // language-neutral); a gardener's tag is the gardener's word.
      title: localizeTopicLabel(locale, topic.slug, topic.label),
      description: "",
      objectKinds: topic.objectKinds,
      entryCount: topic.entryCount,
      latestPublishedAt: topic.latestPublishedAt,
    }));
  const items = filterPublicKnowledgeItems(
    [...authoredItems, ...topicItems],
    request,
  );
  // Without topics the hub still has its answers and guides; only a view of
  // topics alone has nothing left to show.
  const state: PublicKnowledgeHubState =
    failed && request.type === "topic"
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
      state={state}
      topicsUnavailable={failed}
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
        state="loading"
      />
    ),
  });
}
