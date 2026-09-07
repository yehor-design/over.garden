/**
 * How often a source is worth reading again (OVE-396, ADR-0026 D13).
 *
 * The owner's source card says what a source holds and when it was last read.
 * What it could not say is when reading it again would find anything new, and
 * that is the difference between a refresh button worth pressing and one that
 * re-downloads a gigabyte for nothing.
 *
 * A cadence is a fact about the upstream, so it lives with the other facts
 * about the upstream — `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json` —
 * and is named here only for the sources whose release rhythm is actually
 * known. A source that is not in this map shows no cadence rather than a
 * guess.
 */
export const CATALOG_SOURCE_REFRESH_CADENCES = [
  "twice_a_year",
  "as_released",
] as const;

export type CatalogSourceRefreshCadence =
  (typeof CATALOG_SOURCE_REFRESH_CADENCES)[number];

const CADENCE_BY_SOURCE_SLUG: Record<string, CatalogSourceRefreshCadence> = {
  // The Plant List is published as a dated Zenodo release, in June and
  // December.
  "world-flora-online": "twice_a_year",
  // The backbone moves when GBIF rebuilds it, which is neither regular nor
  // frequent: the release this repository pins is from August 2023.
  "gbif-backbone": "as_released",
};

export function catalogSourceRefreshCadence(
  sourceSlug: string,
): CatalogSourceRefreshCadence | null {
  return CADENCE_BY_SOURCE_SLUG[sourceSlug] ?? null;
}
