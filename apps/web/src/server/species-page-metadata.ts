import "server-only";

import type { Metadata } from "next";

import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import { absolutePublicUrl } from "@/lib/garden/public-url";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  getSpeciesPageCopy,
  speciesPageSubject,
} from "@/lib/species-page-copy";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import type { SpeciesPage } from "@/server/species-page";

/**
 * What a species page says about itself, for the reader and for a machine
 * alike (`OVE-519`): «Людина теж бачить опис, структуровані дані й
 * заголовок». The heading and the line under it, the text, and the entries
 * are the page; the title is the two names, the description is the text, and
 * the JSON-LD names the organism by those names and the entries it lists.
 */

export interface SpeciesPageNames {
  /** The heading: the everyday name in the page's language, or the Latin one. */
  heading: string;
  /** True when the heading is the Latin name, so it is marked as Latin. */
  headingIsLatin: boolean;
  /** The Latin name under the heading; null when the heading is already it. */
  latin: string | null;
  /** A form's species, linked under the form's name. */
  species: { name: string; latin: string | null; path: string } | null;
}

/**
 * The names a page shows. A species leads with its own name in the page's
 * language when the catalogue holds one, with the Latin name beneath; a name
 * the catalogue does not hold is never a blank, it is the Latin name. A
 * cultivar or a breed is called what it was registered as, and the line
 * beneath it is its species — both names — as a link to the species' page.
 */
export function speciesPageNames(
  page: SpeciesPage,
  locale: InterfaceLocale,
  routeLocale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): SpeciesPageNames {
  const { catalog } = page;
  if (catalog.catalogKind !== "species") {
    const species = catalog.species;
    return {
      heading: catalog.canonicalName,
      headingIsLatin: false,
      latin: null,
      species: species
        ? {
            name: capitalizeFirst(species.displayName, locale),
            latin:
              species.displayName !== species.scientificName
                ? species.scientificName
                : null,
            path: localizedPath(
              routeLocale,
              publicCatalogEvidencePath({
                catalogKind: "species",
                publicSlug: species.publicSlug,
              }),
            ),
          }
        : null,
    };
  }
  const vernacular = catalog.vernacularName
    ? capitalizeFirst(catalog.vernacularName, locale)
    : null;
  return {
    heading: vernacular ?? catalog.scientificName,
    headingIsLatin: vernacular === null,
    latin: vernacular === null ? null : catalog.scientificName,
    species: null,
  };
}

/** The text under the names: the owner's description, until then the placeholder. */
export function speciesPageText(page: SpeciesPage, locale: InterfaceLocale) {
  return getSpeciesPageCopy(locale).placeholder[
    speciesPageSubject({
      catalogKind: page.catalog.catalogKind,
      kingdom: page.catalog.kingdom,
    })
  ];
}

/** The title: the heading and the Latin name the page shows under it. */
export function speciesPageTitle(names: SpeciesPageNames) {
  const second = names.latin ?? names.species?.latin ?? names.species?.name;
  return `${second ? `${names.heading} · ${second}` : names.heading} | OverGarden`;
}

/**
 * The page as the indexing policy reads it: what it shows, and whether it is
 * published. An unpublished page is reachable and `noindex`; a published one
 * is indexable and in the sitemap, which reads the same rule.
 */
export function buildSpeciesPageDiscoverySource(
  page: SpeciesPage,
  locale: InterfaceLocale,
  routeLocale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): PublicSurfaceDiscoverySource {
  const names = speciesPageNames(page, locale, routeLocale);
  return {
    consumerId: "catalog_evidence",
    candidateState: "candidate",
    visibleText: [
      names.heading,
      names.latin ?? "",
      speciesPageText(page, locale),
      ...page.entries.flatMap((entry) => [entry.title, entry.excerpt]),
    ],
    distinctPublicEntityIds: [
      `catalog:${page.catalog.catalogItemId}`,
      ...page.entries.map((entry) => entry.id),
    ],
    organism: { published: page.published },
    // The canonical follows the route family the page was served from.
    canonicalPath: localizedPath(routeLocale, page.catalog.canonicalPath),
    equivalentLocales: [...PUBLIC_LOCALES],
  };
}

/**
 * Title, description, canonical, alternates, `og:image` and the JSON-LD of a
 * species page. The graph is the page, the organism by its shown names — its
 * permalink as `@id`, which every entry's `about` claims — a form's species,
 * which the page links, and the entries the page lists.
 */
export function buildSpeciesPageMetadata(
  page: SpeciesPage,
  locale: InterfaceLocale,
  options: {
    routeLocale?: PublicLocale;
    discovery?: PublicSurfaceDiscoveryResult;
  } = {},
): { metadata: Metadata; jsonLd: Record<string, unknown> | null } {
  const routeLocale = options.routeLocale ?? DEFAULT_PUBLIC_LOCALE;
  const discovery =
    options.discovery ??
    resolvePublicSurfaceDiscoveryForRequest(
      buildSpeciesPageDiscoverySource(page, locale, routeLocale),
    );
  const names = speciesPageNames(page, locale, routeLocale);
  const text = speciesPageText(page, locale);
  const title = speciesPageTitle(names);
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: null,
    title,
    description: text,
    visibleFacts: {
      type: "Taxon",
      name: names.heading,
      description: text,
      ...(page.shareImage ? { image: page.shareImage.publicUrl } : {}),
      taxon: {
        id: absolutePublicUrl(page.catalog.permalinkPath),
        ...(names.latin ? { scientificName: names.latin } : {}),
        ...(names.headingIsLatin ? { scientificName: names.heading } : {}),
        ...(names.species
          ? {
              parentTaxon: {
                name: names.species.name,
                url: absolutePublicUrl(names.species.path),
              },
            }
          : {}),
      },
      subjectOf: page.entries.map((entry) => ({
        id: `${absolutePublicUrl(entry.publicPath)}#article`,
        url: absolutePublicUrl(entry.publicPath),
      })),
    },
  });
}

/** A name as a heading writes it: the catalogue stores "помідор їстівний". */
function capitalizeFirst(value: string, locale: InterfaceLocale) {
  const [first, ...rest] = Array.from(value);
  return first ? `${first.toLocaleUpperCase(locale)}${rest.join("")}` : value;
}
