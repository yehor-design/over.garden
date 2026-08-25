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
] as const;

export type EppoObservedDetailEndpointClass =
  (typeof EPPO_OBSERVED_DETAIL_ENDPOINT_CLASSES)[number];
