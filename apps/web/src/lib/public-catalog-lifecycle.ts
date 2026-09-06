import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  renderPublicLifecycleDocument,
  type PublicLifecycleRequestLocation,
} from "@/lib/public-lifecycle-document";
import { localizedPath } from "@/lib/public-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";

/**
 * The raw 404 document the proxy answers for an organism address nothing
 * resolves (ADR-0026 D8): decided before any shell streams, so the status is
 * real. It mirrors the journal and passport documents.
 */
export function renderNotFoundPublicCatalogHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
) {
  const copy = getPublicSurfaceCopy(locale).organism;
  return renderPublicLifecycleDocument({
    locale,
    pathname: location?.pathname ?? localizedPath(locale, "/species/missing"),
    search: location?.search,
    title: copy.notFound,
    description: copy.notFoundDescription,
    actionHref: localizedPath(locale, "/objects"),
    actionLabel: copy.browseObjects,
  });
}
