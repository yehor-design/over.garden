import { matchAddressPath } from "@/lib/address/match-address-path";
import { MISSING_ADDRESS_SLUG, publicTopicPath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  renderPublicLifecycleDocument,
  type PublicLifecycleRequestLocation,
} from "@/lib/public-lifecycle-document";
import { localizedPath } from "@/lib/public-localization";

/**
 * A topic that does not exist answers 404 (ADR-0029 D3).
 *
 * It answered `200` with a `noindex` body: `topics/[slug]/page.tsx` calls
 * `notFound()`, and under Cache Components the root loading boundary has
 * already streamed the shell by then. The community, profile, entry, passport
 * and catalog families were each given a bounded lookup in the proxy for
 * exactly this reason; topics were the family nobody came back for.
 */

const TOPIC_NOT_FOUND_COPY: Record<
  InterfaceLocale,
  { title: string; description: string; directory: string }
> = {
  uk: {
    title: "Тему не знайдено",
    description:
      "Такої теми немає. Перевірте адресу або подивіться, про що пишуть садівники.",
    directory: "До тем",
  },
  bg: {
    title: "Темата не е намерена",
    description:
      "Такава тема няма. Проверете адреса или вижте за какво пишат градинарите.",
    directory: "Към темите",
  },
  ru: {
    title: "Тема не найдена",
    description:
      "Такой темы нет. Проверьте адрес или посмотрите, о чём пишут садоводы.",
    directory: "К темам",
  },
};

export function matchPublicTopicPath(pathname: string) {
  return matchAddressPath("topic", pathname);
}

export function renderNotFoundPublicTopicHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
) {
  const copy = TOPIC_NOT_FOUND_COPY[locale];
  const directoryPath = localizedPath(locale, "/knowledge");

  return renderPublicLifecycleDocument({
    locale,
    pathname:
      location?.pathname ??
      localizedPath(locale, publicTopicPath(MISSING_ADDRESS_SLUG)),
    search: location?.search,
    title: copy.title,
    description: copy.description,
    actionHref: directoryPath,
    actionLabel: copy.directory,
  });
}
