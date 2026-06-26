import type { MetadataRoute } from "next";

import { publicVarietyPath } from "@/lib/garden/public-paths";
import { absolutePublicUrl } from "@/lib/garden/public-url";
import { listIndexablePublicVarietySitemapEntries } from "@/server/public-variety-repository";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const varietyEntries = await listIndexablePublicVarietySitemapEntries();

  return varietyEntries.map((entry) => ({
    url: absolutePublicUrl(publicVarietyPath(entry.publicSlug)),
    lastModified: new Date(entry.lastModified),
    changeFrequency: "weekly",
    priority: 0.6,
  }));
}
