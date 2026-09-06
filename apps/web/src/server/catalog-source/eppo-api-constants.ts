/**
 * Import-safe EPPO protocol constants. Credential loading and server effects
 * stay in their dedicated server-only owners.
 */
export const EPPO_OPENAPI_URL = "https://api.eppo.int/gd/v2/eppo_api_gd_v2.yml";
export const EPPO_API_BASE_URL = "https://api.eppo.int/gd/v2";
export const EPPO_LYPES_CODE = "LYPES";
export const EPPO_LYPES_OPERATION_ID = "getGDTaxon";
export const EPPO_LYPES_PATH = `/taxons/taxon/${EPPO_LYPES_CODE}/overview`;
export const EPPO_API_KEY_HEADER = "X-Api-Key";

export const EPPO_OBSERVED_DETAIL_ENDPOINT_CLASSES = [
  "taxon_overview",
  "taxon_names",
  "taxon_taxonomy",
  "taxon_hosts",
  "taxon_distribution",
  "taxon_categorization",
] as const;

export type EppoObservedDetailEndpointClass =
  (typeof EPPO_OBSERVED_DETAIL_ENDPOINT_CLASSES)[number];

/**
 * The three classes the first capture took, and the three OVE-394 adds.
 *
 * A capture declares which classes it queues, so the second one can take only
 * what is missing for the identifiers the first one closed over instead of
 * asking EPPO for 129,214 identifiers all over again (ADR-0026 D11).
 */
export const EPPO_FIRST_CAPTURE_ENDPOINT_CLASSES = [
  "taxon_overview",
  "taxon_names",
  "taxon_taxonomy",
] as const satisfies readonly EppoObservedDetailEndpointClass[];

export const EPPO_SECOND_CAPTURE_ENDPOINT_CLASSES = [
  "taxon_hosts",
  "taxon_distribution",
  "taxon_categorization",
] as const satisfies readonly EppoObservedDetailEndpointClass[];

/** The documented path suffix of each detail class. */
export const EPPO_DETAIL_ENDPOINT_SUFFIX: Record<
  EppoObservedDetailEndpointClass,
  string
> = {
  taxon_overview: "overview",
  taxon_names: "names",
  taxon_taxonomy: "taxonomy",
  taxon_hosts: "hosts",
  taxon_distribution: "distribution",
  taxon_categorization: "categorization",
};
