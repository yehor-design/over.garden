import "server-only";

import {
  publicCatalogEvidencePath,
  publicTopicPath,
} from "@/lib/garden/public-paths";
import { PUBLIC_LOCALES, localizedPath } from "@/lib/public-localization";
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
    // A profile row emits one URL per locale; an entry row emits one.
    ...Array.from(
      { length: sitemapChunkCount(profileCount, PUBLIC_LOCALES.length) },
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
    // An organism card is self-canonical in each of the three route families
    // (ADR-0029 D10), so all three are canonical URLs and all three belong
    // here. Listing only the unprefixed one left two thirds of the catalog's
    // canonicals discoverable by `hreflang` alone.
    return (await listIndexablePublicVarietySitemapEntries()).flatMap(
      (entry) => {
        const path = publicCatalogEvidencePath({
          catalogKind: entry.catalogKind,
          publicSlug: entry.publicSlug,
          speciesSlug: entry.speciesSlug,
        });
        return PUBLIC_LOCALES.map((locale) => ({
          url: localizedPath(locale, path),
          lastModified: new Date(entry.lastModified),
        }));
      },
    );
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
      if (!decision.sitemapEligible) return [];
      // A topic is self-canonical in each route family (ADR-0029 D10), so all
      // three of its canonicals belong here.
      const lastModified = new Date(page.latestPublishedAt);
      return PUBLIC_LOCALES.map((locale) => ({
        url: localizedPath(locale, publicTopicPath(page.topic.slug)),
        lastModified,
      }));
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

const IMAGE_SITEMAP_NAMESPACE = "http://www.google.com/schemas/sitemap-image/1.1";

/**
 * The image extension is declared only when a chunk uses it (OVE-432).
 *
 * An unused namespace on every chunk is noise a validator reads and a reader
 * has to explain; the entries chunk is the only one whose pages own their
 * photographs.
 */
export function renderSitemapUrlsetXml(urls: readonly PublicSitemapUrl[]) {
  const withImages = urls.some((entry) => (entry.images?.length ?? 0) > 0);
  const items = urls
    .map((entry) => {
      const images = (entry.images ?? [])
        .map(
          (image) =>
            `<image:image><image:loc>${escapeXml(absolutePublicUrl(image.url))}</image:loc>${
              image.caption
                ? `<image:caption>${escapeXml(image.caption)}</image:caption>`
                : ""
            }</image:image>`,
        )
        .join("");
      return `  <url><loc>${escapeXml(absolutePublicUrl(entry.url))}</loc><lastmod>${entry.lastModified.toISOString()}</lastmod>${images}</url>`;
    })
    .join("\n");
  const namespaces = `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${
    withImages ? ` xmlns:image="${IMAGE_SITEMAP_NAMESPACE}"` : ""
  }`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${namespaces}>\n${items}\n</urlset>\n`;
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
