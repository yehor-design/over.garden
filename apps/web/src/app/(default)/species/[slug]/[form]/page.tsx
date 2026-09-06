import type { Metadata } from "next";

import {
  generatePublicCatalogEvidenceMetadata,
  renderPublicCatalogEvidenceRoute,
  type PublicCatalogEvidenceRouteProps,
} from "@/app/catalog-evidence-route";

/** A cultivar or breed under its species: `/species/{species}/{form}`. */
export function generateMetadata(
  props: PublicCatalogEvidenceRouteProps,
): Promise<Metadata> {
  return generatePublicCatalogEvidenceMetadata("species", props);
}

export default function PublicSpeciesFormRoute(
  props: PublicCatalogEvidenceRouteProps,
) {
  return renderPublicCatalogEvidenceRoute("species", props);
}
