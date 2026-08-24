import type { MetadataRoute } from "next";

import {
  publicCatalogEvidencePath,
  publicTopicPath,
} from "@/lib/garden/public-paths";
import { absolutePublicUrl } from "@/lib/garden/public-url";
import { listIndexableLocalizedAuthoredSitemapEntries } from "@/server/public-localized-content";
import { resolvePublicSurfaceDiscoveryForRequest } from "@/server/public-surface-discovery";
import { listIndexablePublicVarietySitemapEntries } from "@/server/public-variety-repository";
import {
  buildPublicTopicDiscoverySource,
  getPublicTopicAggregationPage,
  listPublicKnowledgeTopics,
} from "@/server/public-topic-repository";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const varietyEntries = await listIndexablePublicVarietySitemapEntries();
  const topicPages = await Promise.all(
    (await listPublicKnowledgeTopics()).map((topic) =>
      getPublicTopicAggregationPage(topic.slug),
    ),
  );
  const topicEntries = topicPages.flatMap((page) => {
    if (!page?.latestPublishedAt) return [];
    const decision = resolvePublicSurfaceDiscoveryForRequest(
      buildPublicTopicDiscoverySource(page, "topic_sitemap"),
    ).decision;
    return decision.sitemapEligible ? [page] : [];
  });
  const authoredContentEntries = listIndexableLocalizedAuthoredSitemapEntries();

  return [
    ...authoredContentEntries.map((entry) => ({
      url: absolutePublicUrl(entry.path),
      lastModified: new Date(entry.lastModified),
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    })),
    ...varietyEntries.map((entry) => ({
      url: absolutePublicUrl(
        publicCatalogEvidencePath(entry.catalogKind, entry.publicSlug),
      ),
      lastModified: new Date(entry.lastModified),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...topicEntries.map((entry) => ({
      url: absolutePublicUrl(publicTopicPath(entry.topic.slug)),
      lastModified: new Date(entry.latestPublishedAt!),
      changeFrequency: "weekly" as const,
      priority: 0.55,
    })),
  ];
}
