import "server-only";

import {
  publicCatalogEvidencePath,
  publicTopicPath,
} from "@/lib/garden/public-paths";
import { absolutePublicUrl } from "@/lib/garden/public-url";
import { listIndexableLocalizedAuthoredSitemapEntries } from "@/server/public-localized-content";
import {
  countPublicJournalEntriesForSitemap,
  countPublicProfilesForSitemap,
  listPublicCommunitySitemapUrls,
  listPublicJournalEntrySitemapUrls,
  listPublicProfileSitemapUrls,
  sitemapChunkCount,
  type PublicSitemapUrl,
} from "@/server/public-sitemap-repository";
import { resolvePublicSurfaceDiscoveryForRequest } from "@/server/public-surface-discovery";
import {
  buildPublicTopicDiscoverySource,
  getPublicTopicAggregationPage,
  listPublicKnowledgeTopics,
} from "@/server/public-topic-repository";
import { listIndexablePublicVarietySitemapEntries } from "@/server/public-variety-repository";

export type PublicSitemapChunkId =
  | "authored"
  | "catalog"
  | "topics"
  | "communities"
  | `profiles-${number}`
  | `entries-${number}`;

export const PUBLIC_SITEMAP_INDEX_PATH = "/sitemap.xml";

export function publicSitemapChunkPath(id: PublicSitemapChunkId) {
  return `/sitemaps/${id}.xml`;
}

/** The chunk list is the sitemap index (ADR-0022, D3). */
export async function listPublicSitemapChunkIds(): Promise<
  PublicSitemapChunkId[]
> {
  const [entryCount, profileCount] = await Promise.all([
    countPublicJournalEntriesForSitemap(),
    countPublicProfilesForSitemap(),
  ]);
  return [
    "authored",
    "catalog",
    "topics",
    "communities",
    ...Array.from(
      { length: sitemapChunkCount(profileCount) },
      (_, index) => `profiles-${index}` as const,
    ),
    ...Array.from(
      { length: sitemapChunkCount(entryCount) },
      (_, index) => `entries-${index}` as const,
    ),
  ];
}

export function parsePublicSitemapChunkId(
  value: string,
): PublicSitemapChunkId | null {
  const id = value.endsWith(".xml") ? value.slice(0, -4) : value;
  if (
    id === "authored" ||
    id === "catalog" ||
    id === "topics" ||
    id === "communities"
  ) {
    return id;
  }
  const chunk = /^(profiles|entries)-(\d{1,4})$/.exec(id);
  if (!chunk) return null;
  return `${chunk[1] as "profiles" | "entries"}-${Number(chunk[2])}`;
}

export async function buildPublicSitemapChunk(
  id: PublicSitemapChunkId,
): Promise<PublicSitemapUrl[]> {
  if (id === "authored") {
    return listIndexableLocalizedAuthoredSitemapEntries().map((entry) => ({
      url: entry.path,
      lastModified: new Date(entry.lastModified),
    }));
  }
  if (id === "catalog") {
    return (await listIndexablePublicVarietySitemapEntries()).map((entry) => ({
      url: publicCatalogEvidencePath(entry.catalogKind, entry.publicSlug),
      lastModified: new Date(entry.lastModified),
    }));
  }
  if (id === "topics") {
    const pages = await Promise.all(
      (await listPublicKnowledgeTopics()).map((topic) =>
        getPublicTopicAggregationPage(topic.slug),
      ),
    );
    return pages.flatMap((page) => {
      if (!page?.latestPublishedAt) return [];
      const decision = resolvePublicSurfaceDiscoveryForRequest(
        buildPublicTopicDiscoverySource(page, "topic_sitemap"),
      ).decision;
      return decision.sitemapEligible
        ? [
            {
              url: publicTopicPath(page.topic.slug),
              lastModified: new Date(page.latestPublishedAt),
            },
          ]
        : [];
    });
  }
  if (id === "communities") return listPublicCommunitySitemapUrls();
  const [kind, index] = id.split("-") as ["profiles" | "entries", string];
  return kind === "profiles"
    ? listPublicProfileSitemapUrls(Number(index))
    : listPublicJournalEntrySitemapUrls(Number(index));
}

export function renderSitemapIndexXml(ids: readonly PublicSitemapChunkId[]) {
  const items = ids
    .map(
      (id) =>
        `  <sitemap><loc>${escapeXml(absolutePublicUrl(publicSitemapChunkPath(id)))}</loc></sitemap>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

export function renderSitemapUrlsetXml(urls: readonly PublicSitemapUrl[]) {
  const items = urls
    .map(
      (entry) =>
        `  <url><loc>${escapeXml(absolutePublicUrl(entry.url))}</loc><lastmod>${entry.lastModified.toISOString()}</lastmod></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

export const SITEMAP_RESPONSE_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
  // The chunk data is a tagged `use cache` read that every entry mutation
  // expires; the CDN copy must not outlive that by an hour (ADR-0022, D4).
  "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
} as const;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
