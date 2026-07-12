import type { MetadataRoute } from "next";

import {
  publicCatalogEvidencePath,
  publicTopicPath,
} from "@/lib/garden/public-paths";
import { absolutePublicUrl } from "@/lib/garden/public-url";
import { listIndexableAuthoredPublicContentSitemapEntries } from "@/server/public-seo-content";
import { listStaticIndexablePublicSurfaces } from "@/server/public-surface-indexing-policy";
import { listIndexablePublicVarietySitemapEntries } from "@/server/public-variety-repository";
import { listPublicKnowledgeTopics } from "@/server/public-topic-repository";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const varietyEntries = await listIndexablePublicVarietySitemapEntries();
  const topicEntries = (await listPublicKnowledgeTopics()).filter(
    (topic) => topic.indexState.sitemapEligible && topic.latestPublishedAt,
  );
  const staticEntries = listStaticIndexablePublicSurfaces();
  const authoredContentEntries =
    listIndexableAuthoredPublicContentSitemapEntries();

  return [
    ...staticEntries.map((entry) => ({
      url: absolutePublicUrl(entry.path),
      lastModified: new Date(entry.lastModified),
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    })),
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
      url: absolutePublicUrl(publicTopicPath(entry.slug)),
      lastModified: new Date(entry.latestPublishedAt!),
      changeFrequency: "weekly" as const,
      priority: 0.55,
    })),
  ];
}
