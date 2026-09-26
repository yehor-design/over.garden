import type { Metadata } from "next";

import {
  generatePublicCatalogEvidenceMetadata,
  renderPublicCatalogEvidenceForRequest,
  type PublicCatalogEvidenceRouteProps,
} from "@/app/catalog-evidence-route";

/**
 * A breed page with no species, at its `/breed` address,
 * with a later portion of its entries in the address (`?cursor=`): the
 * internal twin (ADR-0032 D5). The proxy rewrites here and the reader's
 * address does not change; the metadata is the page's own, so the canonical
 * stays the page without the cursor.
 */
export function generateMetadata(
  props: PublicCatalogEvidenceRouteProps,
): Promise<Metadata> {
  return generatePublicCatalogEvidenceMetadata("breed", props);
}

export default function BreedEntriesPortionRoute(
  props: PublicCatalogEvidenceRouteProps,
) {
  return renderPublicCatalogEvidenceForRequest("breed", props);
}
