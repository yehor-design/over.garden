import type { InterfaceLocale } from "@/lib/interface-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import { resolvePublicSurfaceDiscoveryForRequest } from "@/server/public-surface-discovery";
import type { PublicSurfaceDiscoveryResult } from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import {
  buildPublicVarietyDiscoverySource,
  type PublicVarietyPage,
} from "@/server/public-variety-repository";

export function buildPublicVarietySurfaceMetadata(
  page: PublicVarietyPage,
  locale: InterfaceLocale = "uk",
  discovery: PublicSurfaceDiscoveryResult = resolvePublicSurfaceDiscoveryForRequest(
    buildPublicVarietyDiscoverySource(page, "catalog_evidence"),
  ),
) {
  const copy = getPublicSurfaceCopy(locale);
  const suffix = getCollectionPageSuffix(
    page.catalog.catalogKind,
    locale,
    copy.variety.collectionPageSuffix,
  );
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: null,
    title: `${page.catalog.canonicalName} · ${suffix} | OverGarden`,
    description: `${suffix}: ${page.catalog.canonicalName}.`,
    visibleFacts: {
      type: "CollectionPage",
      name: `${page.catalog.canonicalName} · ${suffix}`,
      description: `${suffix}: ${page.catalog.canonicalName}.`,
      itemNames: page.entries.map((entry) => entry.title),
      trustQualifier: `Catalog status: ${page.catalog.status}`,
    },
  });
}

export function buildPublicVarietyJsonLd(
  page: PublicVarietyPage,
  locale: InterfaceLocale = "uk",
) {
  return buildPublicVarietySurfaceMetadata(page, locale).jsonLd;
}

function getCollectionPageSuffix(
  catalogKind: PublicVarietyPage["catalog"]["catalogKind"],
  locale: InterfaceLocale,
  varietySuffix: string,
) {
  if (catalogKind === "plant_variety") return varietySuffix;

  const suffixes = {
    uk: {
      species: "публічні записи про вид",
      breed: "публічні записи про породу або лінію",
    },
    bg: {
      species: "публични записи за вида",
      breed: "публични записи за породата или линията",
    },
    ru: {
      species: "публичные записи о виде",
      breed: "публичные записи о породе или линии",
    },
  } as const;

  return suffixes[locale][catalogKind];
}
