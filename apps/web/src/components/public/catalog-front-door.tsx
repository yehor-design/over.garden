import Link from "next/link";
import { Leaf } from "lucide-react";

import { buildPublicCatalogBrowseHref } from "@/lib/public-catalog-browse";
import { getPublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import type { PublicLocale } from "@/lib/public-localization";

/**
 * The way into the catalog from a page a reader already has open (OVE-431).
 *
 * The owner's decision of 2026-09-12: the catalog gets no menu item of its
 * own. It is reached from Knowledge and from Living objects, which is where a
 * reader is already asking what something is. Two entries rather than one
 * because those are two different questions — "what is this organism" and
 * "what is the thing in my garden" — and both end at the same catalog.
 *
 * A plain anchor, rendered on the server: it is the crawl path into 114 669
 * pages, and a link that needs hydration is not a crawl path (ADR-0024).
 */
export function CatalogFrontDoor({ locale }: { locale: PublicLocale }) {
  const copy = getPublicCatalogBrowseCopy(locale);

  return (
    <Link
      href={buildPublicCatalogBrowseHref(locale)}
      data-catalog-front-door="true"
      className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
    >
      <Leaf className="mt-0.5 size-5 shrink-0 text-primary" />
      <span className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">
          {copy.title}
        </span>
        <span className="text-sm text-muted-foreground">
          {copy.description}
        </span>
      </span>
    </Link>
  );
}
