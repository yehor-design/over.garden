import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  renderPublicLifecycleDocument,
  type PublicLifecycleRequestLocation,
} from "@/lib/public-lifecycle-document";
import { localizedPath, stripLocalePrefix } from "@/lib/public-localization";

const PUBLIC_PROFILE_PATH = /^\/@([a-z0-9][a-z0-9_]{2,29})\/?$/i;

const PROFILE_NOT_FOUND_COPY: Record<
  InterfaceLocale,
  { title: string; description: string; home: string }
> = {
  uk: {
    title: "Профіль не знайдено",
    description:
      "Ця сторінка недоступна. Перевірте адресу або поверніться до публічної стрічки.",
    home: "До публічної стрічки",
  },
  bg: {
    title: "Профилът не е намерен",
    description:
      "Тази страница не е достъпна. Проверете адреса или се върнете към публичния поток.",
    home: "Към публичния поток",
  },
  ru: {
    title: "Профиль не найден",
    description:
      "Эта страница недоступна. Проверьте адрес или вернитесь к публичной ленте.",
    home: "К публичной ленте",
  },
};

const PROFILE_GONE_COPY: typeof PROFILE_NOT_FOUND_COPY = {
  uk: {
    title: "Профіль більше недоступний",
    description:
      "Цю публічну сторінку видалено. Поверніться до публічної стрічки.",
    home: "До публічної стрічки",
  },
  bg: {
    title: "Профилът вече не е достъпен",
    description:
      "Тази публична страница е премахната. Върнете се към публичния поток.",
    home: "Към публичния поток",
  },
  ru: {
    title: "Профиль больше недоступен",
    description: "Эта публичная страница удалена. Вернитесь к публичной ленте.",
    home: "К публичной ленте",
  },
};

export function matchPublicProfilePath(pathname: string) {
  const basePath = stripLocalePrefix(pathname).path;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(basePath);
  } catch {
    return null;
  }
  return PUBLIC_PROFILE_PATH.exec(decodedPath)?.[1]?.toLowerCase() ?? null;
}

export function renderNotFoundPublicProfileHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
) {
  return renderPublicProfileLifecycleHtml(
    locale,
    PROFILE_NOT_FOUND_COPY[locale],
    location,
  );
}

export function renderGonePublicProfileHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
) {
  return renderPublicProfileLifecycleHtml(
    locale,
    PROFILE_GONE_COPY[locale],
    location,
  );
}

function renderPublicProfileLifecycleHtml(
  locale: InterfaceLocale,
  copy: { title: string; description: string; home: string },
  location?: PublicLifecycleRequestLocation,
) {
  const homePath = localizedPath(locale, "/");

  return renderPublicLifecycleDocument({
    locale,
    pathname: location?.pathname ?? localizedPath(locale, "/@missing"),
    search: location?.search,
    title: copy.title,
    description: copy.description,
    actionHref: homePath,
    actionLabel: copy.home,
  });
}
