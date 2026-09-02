import type { Metadata } from "next";

import {
  generatePublicCatalogEvidenceMetadata,
  renderPublicCatalogEvidenceRoute,
  type PublicCatalogEvidenceRouteProps,
} from "@/app/catalog-evidence-route";

export function generateMetadata(
  props: PublicCatalogEvidenceRouteProps,
): Promise<Metadata> {
  return generatePublicCatalogEvidenceMetadata("species", props);
}

export default function PublicSpeciesRoute(
  props: PublicCatalogEvidenceRouteProps,
) {
  return renderPublicCatalogEvidenceRoute("species", props);
}
