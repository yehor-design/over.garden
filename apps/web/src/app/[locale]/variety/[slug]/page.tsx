import type { Metadata } from "next";

import {
  generatePublicCatalogEvidenceMetadata,
  generatePublicCatalogEvidenceStaticParams,
  renderPublicCatalogEvidenceRoute,
  type PublicCatalogEvidenceRouteProps,
} from "@/app/catalog-evidence-route";

/**
 * One placeholder sample, so an organism's card is prerendered per address and
 * kept (ADR-0032 D6) instead of streaming into a fallback shell on every
 * request. There is no `loading.tsx` above this page for the same reason: a
 * boundary over a static page puts its content in a hidden segment.
 */
export function generateStaticParams() {
  return generatePublicCatalogEvidenceStaticParams("plant_variety");
}

/** The locale-prefixed mirror of the unprefixed organism route. */
export function generateMetadata(
  props: PublicCatalogEvidenceRouteProps,
): Promise<Metadata> {
  return generatePublicCatalogEvidenceMetadata("plant_variety", props);
}

export default function LocalizedPublicCatalogEvidenceRoute(
  props: PublicCatalogEvidenceRouteProps,
) {
  return renderPublicCatalogEvidenceRoute("plant_variety", props);
}
