import type { Metadata } from "next";

import {
  generatePublicCatalogEvidenceMetadata,
  renderPublicCatalogEvidenceRoute,
  type PublicCatalogEvidenceRouteProps,
} from "@/app/catalog-evidence-route";

export const dynamic = "force-dynamic";

export function generateMetadata(
  props: PublicCatalogEvidenceRouteProps,
): Promise<Metadata> {
  return generatePublicCatalogEvidenceMetadata("breed", props);
}

export default function PublicBreedRoute(
  props: PublicCatalogEvidenceRouteProps,
) {
  return renderPublicCatalogEvidenceRoute("breed", props);
}
