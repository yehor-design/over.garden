import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  renderPublicLifecycleDocument,
  type PublicLifecycleRequestLocation,
} from "@/lib/public-lifecycle-document";
import { localizedPath } from "@/lib/public-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";

const UNKNOWN_ROUTE_DESCRIPTION: Record<InterfaceLocale, string> = {
  uk: "Такої сторінки на OverGarden немає. Перевірте адресу або поверніться на головну.",
  bg: "Такава страница в OverGarden няма. Проверете адреса или се върнете към началото.",
  ru: "Такой страницы на OverGarden нет. Проверьте адрес или вернитесь на главную.",
};

/**
 * Raw 404 document for a path whose first segment no route can serve. It is
 * rendered by the proxy so the status code is a real 404; the App Router would
 * otherwise stream a 200 shell before `notFound()` could run.
 */
export function renderNotFoundUnknownRouteHtml(
  locale: InterfaceLocale,
  location: PublicLifecycleRequestLocation,
) {
  const copy = getPublicSurfaceCopy(locale).notFound;

  return renderPublicLifecycleDocument({
    locale,
    pathname: location.pathname,
    search: location.search,
    title: copy.title,
    description: UNKNOWN_ROUTE_DESCRIPTION[locale],
    actionHref: localizedPath(locale, "/"),
    actionLabel: copy.home,
  });
}
