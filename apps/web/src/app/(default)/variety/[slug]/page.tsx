import type { Metadata } from "next";

import {
  generatePublicCatalogEvidenceMetadata,
  renderPublicCatalogEvidenceRoute,
  type PublicCatalogEvidenceRouteProps,
} from "@/app/catalog-evidence-route";

export function generateMetadata(
  props: PublicCatalogEvidenceRouteProps,
): Promise<Metadata> {
  return generatePublicCatalogEvidenceMetadata("plant_variety", props);
}

export default function PublicVarietyRoute(
  props: PublicCatalogEvidenceRouteProps,
) {
  return renderPublicCatalogEvidenceRoute("plant_variety", props);
}
