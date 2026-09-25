import "server-only";

import {
  catalogIdentifierUrl,
  schemaTaxonRank,
} from "@/lib/catalog/addresses";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import { absolutePublicUrl } from "@/lib/garden/public-url";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import { resolvePublicSurfaceDiscoveryForRequest } from "@/server/public-surface-discovery";
import type { PublicSurfaceDiscoveryResult } from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import {
  buildPublicVarietyDiscoverySource,
  type PublicVarietyPage,
} from "@/server/public-variety-repository";

/**
 * Title, description, canonical, alternates and the JSON-LD graph of an
 * organism page: `Taxon` with the permalink as `@id`, `scientificName`,
 * `taxonRank`, `parentTaxon` for a form, `sameAs` from the external
 * identifiers, `dateModified` from the content clock, and a `BreadcrumbList`
 * (ADR-0026 D9).
 */
export function buildPublicVarietySurfaceMetadata(
  page: PublicVarietyPage,
  locale: InterfaceLocale = "uk",
  options: {
    /** The route family serving the page; every URL in the graph follows it. */
    routeLocale?: PublicLocale;
    discovery?: PublicSurfaceDiscoveryResult;
  } = {},
) {
  const routeLocale = options.routeLocale ?? DEFAULT_PUBLIC_LOCALE;
  const discovery =
    options.discovery ??
    resolvePublicSurfaceDiscoveryForRequest(
      buildPublicVarietyDiscoverySource(page, "catalog_evidence", routeLocale),
    );
  const copy = getPublicSurfaceCopy(locale);
  const suffix = getCollectionPageSuffix(
    page.catalog.catalogKind,
    locale,
    copy.variety.collectionPageSuffix,
  );
  const species = page.catalog.species;
  const speciesUrl = species
    ? absolutePublicUrl(
        localizedPath(
          routeLocale,
          publicCatalogEvidencePath({
            catalogKind: "species",
            publicSlug: species.publicSlug,
          }),
        ),
      )
    : null;
  // The name a gardener knows it by (ADR-0035 D3): a species reads by its
  // everyday name in the reader's language — the standard base's — and the
  // Latin name is the `scientificName` beneath it. A form keeps its own name.
  const name = organismReaderName(page, locale);
  const speciesName = species
    ? capitalizeFirst(species.displayName, locale)
    : null;
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: null,
    title: `${name} · ${suffix} | OverGarden`,
    description: `${suffix}: ${name}.`,
    visibleFacts: {
      type: "Taxon",
      name,
      description: `${suffix}: ${name}.`,
      dateModified: toIsoDate(page.catalog.contentUpdatedAt),
      // A node reaches a public page only while its identity is active, so
      // this says what publication already guarantees rather than echoing a
      // column that used to say "seeded" for every row (OVE-399).
      trustQualifier: "Catalog identity: active",
      taxon: {
        id: absolutePublicUrl(page.catalog.permalinkPath),
        scientificName: page.catalog.scientificName,
        taxonRank: schemaTaxonRank({
          nodeKind: page.catalog.nodeKind,
          rank: page.catalog.rank,
        }),
        ...(species && speciesUrl
          ? { parentTaxon: { name: speciesName ?? species.canonicalName, url: speciesUrl } }
          : {}),
        sameAs: page.catalog.identifiers.flatMap((identifier) => {
          const url = catalogIdentifierUrl(identifier.scheme, identifier.value);
          return url ? [url] : [];
        }),
      },
      // The other side of an entry's `about`: what gardeners have written about
      // this organism, by the `@id` those entries claim. The card already
      // renders them, so the traversal closes on facts a reader can see
      // (ADR-0022 D3, ADR-0029 D13).
      subjectOf: page.entries.map((entry) => ({
        id: `${absolutePublicUrl(entry.publicPath)}#article`,
        url: absolutePublicUrl(entry.publicPath),
      })),
      breadcrumbs: [
        {
          name: "OverGarden",
          url: absolutePublicUrl(localizedPath(routeLocale, "/")),
        },
        ...(species && speciesUrl
          ? [{ name: speciesName ?? species.canonicalName, url: speciesUrl }]
          : []),
        {
          name,
          url: absolutePublicUrl(
            localizedPath(routeLocale, page.catalog.canonicalPath),
          ),
        },
      ],
    },
  });
}

export function buildPublicVarietyJsonLd(
  page: PublicVarietyPage,
  locale: InterfaceLocale = "uk",
  routeLocale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
) {
  return buildPublicVarietySurfaceMetadata(page, locale, { routeLocale }).jsonLd;
}

/**
 * An organism's name for a reader: a species' own name in the reader's
 * language when the catalogue holds one, its accepted name otherwise; a
 * cultivar's or a breed's registered name as it is.
 */
export function organismReaderName(page: PublicVarietyPage, locale: InterfaceLocale) {
  return page.catalog.catalogKind === "species" && page.catalog.vernacularName
    ? capitalizeFirst(page.catalog.vernacularName, locale)
    : page.catalog.canonicalName;
}

function capitalizeFirst(value: string, locale: InterfaceLocale) {
  const [first, ...rest] = Array.from(value);
  return first ? `${first.toLocaleUpperCase(locale)}${rest.join("")}` : value;
}

function toIsoDate(value: Date | string | null | undefined) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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
