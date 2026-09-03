import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * The owner's tools in the account menu (ADR-0022, D5). The Release Center,
 * extension packs, and editions are product pages now; `/health` is the
 * owner-only diagnostics page.
 */
export const OPERATOR_MENU_LINKS = [
  {
    key: "communities",
    href: "/account/communities",
  },
  {
    key: "comments",
    href: "/account/moderation/comments",
  },
  {
    key: "catalog",
    href: "/garden/catalog/registry",
  },
  {
    key: "packs",
    href: "/garden/catalog/registry/extensions",
  },
  {
    key: "editions",
    href: "/garden/catalog/registry/editions",
  },
  {
    key: "erasure",
    href: "/garden/privacy/erasure-requests",
  },
  {
    key: "health",
    href: "/health",
  },
] as const;

type OperatorMenuLinkKey = (typeof OPERATOR_MENU_LINKS)[number]["key"];

type OperatorMenuCopy = {
  sectionTitle: string;
  links: Record<OperatorMenuLinkKey, string>;
};

const COPY: Record<InterfaceLocale, OperatorMenuCopy> = {
  uk: {
    sectionTitle: "Інструменти власника",
    links: {
      communities: "Модерація спільнот",
      comments: "Модерація коментарів",
      catalog: "Курація каталогу",
      packs: "Пакети сортів і порід",
      editions: "Видання каталогу",
      erasure: "Запити на видалення",
      health: "Стан системи",
    },
  },
  bg: {
    sectionTitle: "Инструменти на собственика",
    links: {
      communities: "Модерация на общности",
      comments: "Модерация на коментари",
      catalog: "Куриране на каталога",
      packs: "Пакети сортове и породи",
      editions: "Издания на каталога",
      erasure: "Заявки за изтриване",
      health: "Състояние на системата",
    },
  },
  ru: {
    sectionTitle: "Инструменты владельца",
    links: {
      communities: "Модерация сообществ",
      comments: "Модерация комментариев",
      catalog: "Курация каталога",
      packs: "Пакеты сортов и пород",
      editions: "Издания каталога",
      erasure: "Запросы на удаление",
      health: "Состояние системы",
    },
  },
};

export function getOperatorMenuCopy(locale: InterfaceLocale) {
  return COPY[locale];
}
