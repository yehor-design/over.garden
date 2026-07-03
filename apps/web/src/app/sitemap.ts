import type { MetadataRoute } from "next";

import { publicVarietyPath } from "@/lib/garden/public-paths";
import { absolutePublicUrl } from "@/lib/garden/public-url";
import { listStaticIndexablePublicSurfaces } from "@/server/public-surface-indexing-policy";
import { listIndexablePublicVarietySitemapEntries } from "@/server/public-variety-repository";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const varietyEntries = await listIndexablePublicVarietySitemapEntries();
  const staticEntries = listStaticIndexablePublicSurfaces();

  return [
    ...staticEntries.map((entry) => ({
      url: absolutePublicUrl(entry.path),
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    })),
    ...varietyEntries.map((entry) => ({
      url: absolutePublicUrl(publicVarietyPath(entry.publicSlug)),
      lastModified: new Date(entry.lastModified),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
