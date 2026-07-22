import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  renderPublicLifecycleDocument,
  type PublicLifecycleRequestLocation,
} from "@/lib/public-lifecycle-document";
import { localizedPath, stripLocalePrefix } from "@/lib/public-localization";

const PUBLIC_COMMUNITY_PATH = /^\/communities\/([a-z0-9][a-z0-9-]{1,63})\/?$/;

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
  const basePath = stripLocalePrefix(pathname).path;
  return PUBLIC_COMMUNITY_PATH.exec(basePath)?.[1] ?? null;
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
      location?.pathname ?? localizedPath(locale, "/communities/missing"),
    search: location?.search,
    title: copy.title,
    description: copy.description,
    actionHref: directoryPath,
    actionLabel: copy.directory,
  });
}
