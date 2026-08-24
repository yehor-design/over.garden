import type { InterfaceLocale } from "@/lib/interface-localization";

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
    href: "/garden/catalog/curation",
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
      catalog: "Курація каталогу",
      erasure: "Запити на видалення",
    },
  },
  bg: {
    sectionTitle: "Инструменти на собственика",
    links: {
      communities: "Модерация на общности",
      comments: "Модерация на коментари",
      catalog: "Куриране на каталога",
      erasure: "Заявки за изтриване",
    },
  },
  ru: {
    sectionTitle: "Инструменты владельца",
    links: {
      communities: "Модерация сообществ",
      comments: "Модерация комментариев",
      catalog: "Курация каталога",
      erasure: "Запросы на удаление",
    },
  },
};

export function getOperatorMenuCopy(locale: InterfaceLocale) {
  return COPY[locale];
}
