import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * The owner's tools in the account menu (ADR-0022, D5). The Release Center,
 * extension packs and editions left this menu with ADR-0025; the `/health`
 * diagnostics page left it with ADR-0027, and the page itself is gone.
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
    key: "catalog-queue",
    href: "/garden/catalog/queue",
  },
  {
    key: "catalog-sources",
    href: "/garden/catalog/sources",
  },
  {
    key: "erasure",
    href: "/garden/privacy/erasure-requests",
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
      "catalog-queue": "Черга рішень каталогу",
      "catalog-sources": "Джерела каталогу",
      erasure: "Запити на видалення",
    },
  },
  bg: {
    sectionTitle: "Инструменти на собственика",
    links: {
      communities: "Модерация на общности",
      comments: "Модерация на коментари",
      "catalog-queue": "Опашка с решения за каталога",
      "catalog-sources": "Източници на каталога",
      erasure: "Заявки за изтриване",
    },
  },
  ru: {
    sectionTitle: "Инструменты владельца",
    links: {
      communities: "Модерация сообществ",
      comments: "Модерация комментариев",
      "catalog-queue": "Очередь решений каталога",
      "catalog-sources": "Источники каталога",
      erasure: "Запросы на удаление",
    },
  },
};

export function getOperatorMenuCopy(locale: InterfaceLocale) {
  return COPY[locale];
}
