import type { CatalogKind } from "@/db/schema";
import { stripLocalePrefix } from "@/lib/public-localization";

/**
 * Catalog addresses (ADR-0026 D8): the request shapes the proxy and the
 * alias resolvers recognise, the permalink, and the outbound identity URLs.
 * Pure: no database, no request.
 */

export const CATALOG_ALIAS_SCHEMES = ["eppo", "col", "gbif", "wikidata"] as const;
export type CatalogAliasScheme = (typeof CATALOG_ALIAS_SCHEMES)[number];

export type PublicCatalogAddressRequest =
  | { kind: "species"; speciesSlug: string; formSlug: string | null }
  | { kind: "legacy"; catalogKind: "plant_variety" | "breed"; slug: string };

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SPECIES_PATH = new RegExp(`^/species/(${SLUG})(?:/(${SLUG}))?/?$`, "u");
const LEGACY_PATH = new RegExp(`^/(variety|breed)/(${SLUG})/?$`, "u");

/**
 * The organism pages a document navigation can ask for, with an optional
 * locale prefix already removed. Anything else under these segments (a
 * deeper path, an upper-case slug) is left to the route families' catch-alls.
 */
export function matchPublicCatalogAddressPath(
  pathname: string,
): PublicCatalogAddressRequest | null {
  const basePath = stripLocalePrefix(pathname).path;
  const species = SPECIES_PATH.exec(basePath);
  if (species) {
    return {
      kind: "species",
      speciesSlug: species[1]!,
      formSlug: species[2] ?? null,
    };
  }
  const legacy = LEGACY_PATH.exec(basePath);
  if (legacy) {
    return {
      kind: "legacy",
      catalogKind: legacy[1] === "variety" ? "plant_variety" : "breed",
      slug: legacy[2]!,
    };
  }
  return null;
}

/** The permalink: the address that survives every rename and merge. */
export function publicCatalogPermalinkPath(catalogItemId: string): string {
  return `/id/${encodeURIComponent(catalogItemId)}`;
}

/** Where each external identifier scheme is published (D9 `sameAs`). */
export function catalogIdentifierUrl(
  scheme: string,
  value: string,
): string | null {
  const encoded = encodeURIComponent(value);
  switch (scheme) {
    case "col":
      return `https://www.catalogueoflife.org/data/taxon/${encoded}`;
    case "gbif":
      return `https://www.gbif.org/species/${encoded}`;
    case "eppo":
      return `https://gd.eppo.int/taxon/${encoded}`;
    case "wikidata":
      return `https://www.wikidata.org/wiki/${encoded}`;
    case "wfo":
      return `https://www.worldfloraonline.org/taxon/${encoded}`;
    default:
      return null;
  }
}

/** The schema.org `taxonRank` a node carries; forms are cultivars/breeds. */
export function schemaTaxonRank(input: {
  nodeKind: "taxon" | "cultivar" | "breed" | string;
  rank: string | null;
}): string {
  if (input.nodeKind === "cultivar") return "cultivar";
  if (input.nodeKind === "breed") return "breed";
  return input.rank ?? "species";
}

export function isCatalogAliasScheme(value: string): value is CatalogAliasScheme {
  return (CATALOG_ALIAS_SCHEMES as readonly string[]).includes(value);
}

export function legacyCatalogKindForSegment(
  segment: "variety" | "breed",
): CatalogKind {
  return segment === "variety" ? "plant_variety" : "breed";
}
