import { publicVarietyPath } from "@/lib/garden/public-paths";
import { absolutePublicUrl } from "@/lib/garden/public-url";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";
import type { PublicVarietyPage } from "@/server/public-variety-repository";

const MAX_JSON_LD_ENTRIES = 10;

export interface PublicVarietyCollectionPageJsonLd {
  "@context": "https://schema.org";
  "@type": "CollectionPage";
  name: string;
  url: string;
  isPartOf: {
    "@type": "WebSite";
    name: "OverGarden";
    url: string;
  };
  about: {
    "@type": "Thing";
    name: string;
  };
  hasPart: Array<{
    "@type": "CreativeWork";
    headline: string;
    datePublished: string;
    url: string;
  }>;
}

export function buildPublicVarietyJsonLd(
  page: PublicVarietyPage,
  locale: InterfaceLocale = "uk",
): PublicVarietyCollectionPageJsonLd | null {
  const indexState = evaluatePublicSurfaceIndexability({
    kind: "variety_aggregation",
    entryCount: page.entryCount,
    aggregateBodyLength: page.aggregateBodyLength,
    catalogStatus: page.catalog.status,
    catalogSource: page.catalog.source,
  });

  if (!indexState.isIndexable) return null;

  const siteUrl = absolutePublicUrl("/");
  const copy = getPublicSurfaceCopy(locale);

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${page.catalog.canonicalName} · ${copy.variety.collectionPageSuffix}`,
    url: absolutePublicUrl(publicVarietyPath(page.catalog.publicSlug)),
    isPartOf: {
      "@type": "WebSite",
      name: "OverGarden",
      url: siteUrl,
    },
    about: {
      "@type": "Thing",
      name: page.catalog.canonicalName,
    },
    hasPart: page.entries.slice(0, MAX_JSON_LD_ENTRIES).map((entry) => ({
      "@type": "CreativeWork",
      headline: entry.title,
      datePublished: toIsoDate(entry.entryDate),
      url: absolutePublicUrl(entry.publicPath),
    })),
  };
}

function toIsoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}
