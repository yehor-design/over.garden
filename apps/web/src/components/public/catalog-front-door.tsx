import Link from "next/link";
import { LeafIcon as Leaf } from "@/components/icons/Leaf";

import { buildPublicCatalogBrowseHref } from "@/lib/public-catalog-browse";
import { getPublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import type { PublicLocale } from "@/lib/public-localization";

/**
 * The way into the catalogue from a page a reader already has open.
 *
 * It is a contextual link, not a door: since `OVE-451` the catalogue has one
 * entrance, in the menu and in the footer, and this card sits where a reader
 * is already asking what something is — on Knowledge. Two surfaces used to
 * carry it and one of them *was* the catalogue, which is how a reader could
 * click "Каталог", land on a page titled "Живі об'єкти", and find a card
 * offering them the catalogue again.
 *
 * A plain anchor, rendered on the server: it is a crawl path into 114 669
 * pages, and a link that needs hydration is not a crawl path (ADR-0024).
 *
 * It says what the catalogue's door does (`OVE-496`) — find an organism by
 * the name the reader has — because that is where it leads, and a reader
 * asking what something is has a name, not a kingdom.
 */
export function CatalogFrontDoor({ locale }: { locale: PublicLocale }) {
  const copy = getPublicCatalogBrowseCopy(locale);

  return (
    <Link
      href={buildPublicCatalogBrowseHref(locale)}
      data-catalog-front-door="true"
      className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4 transition-colors duration-instant ease-out outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <Leaf
        className="mt-0.5 size-5 shrink-0 text-text-muted"
        aria-hidden="true"
      />
      <span className="flex flex-col gap-1">
        <span className="text-body-sm font-semibold text-text-heading">
          {copy.doorTitle}
        </span>
        <span className="text-body-sm text-text-muted">
          {copy.doorDescription}
        </span>
      </span>
    </Link>
  );
}
