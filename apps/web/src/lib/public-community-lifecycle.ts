import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  renderPublicLifecycleDocument,
  type PublicLifecycleRequestLocation,
} from "@/lib/public-lifecycle-document";
import { matchAddressPath } from "@/lib/address/match-address-path";
import { localizedPath } from "@/lib/public-localization";
import {
  MISSING_ADDRESS_SLUG,
  publicCommunityPath,
} from "@/lib/garden/public-paths";

const COMMUNITY_NOT_FOUND_COPY: Record<
  InterfaceLocale,
  { title: string; description: string; directory: string }
> = {
  uk: {
    title: "Спільноту не знайдено",
    description:
      "Ця спільнота недоступна. Перевірте адресу або поверніться до списку спільнот.",
    directory: "До спільнот",
  },
  bg: {
    title: "Общността не е намерена",
    description:
      "Тази общност не е достъпна. Проверете адреса или се върнете към списъка с общности.",
    directory: "Към общностите",
  },
  ru: {
    title: "Сообщество не найдено",
    description:
      "Это сообщество недоступно. Проверьте адрес или вернитесь к списку сообществ.",
    directory: "К сообществам",
  },
};

export function matchPublicCommunityPath(pathname: string) {
  return matchAddressPath("community", pathname);
}

export function renderNotFoundPublicCommunityHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
) {
  const copy = COMMUNITY_NOT_FOUND_COPY[locale];
  const directoryPath = localizedPath(locale, "/communities");

  return renderPublicLifecycleDocument({
    locale,
    pathname:
      location?.pathname ??
      localizedPath(locale, publicCommunityPath(MISSING_ADDRESS_SLUG)),
    search: location?.search,
    title: copy.title,
    description: copy.description,
    actionHref: directoryPath,
    actionLabel: copy.directory,
  });
}
