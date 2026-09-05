import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * The owner's tools in the account menu (ADR-0022, D5). The Release Center,
 * extension packs and editions left this menu with ADR-0025; `/health` is the
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
      erasure: "Запити на видалення",
      health: "Стан системи",
    },
  },
  bg: {
    sectionTitle: "Инструменти на собственика",
    links: {
      communities: "Модерация на общности",
      comments: "Модерация на коментари",
      erasure: "Заявки за изтриване",
      health: "Състояние на системата",
    },
  },
  ru: {
    sectionTitle: "Инструменты владельца",
    links: {
      communities: "Модерация сообществ",
      comments: "Модерация комментариев",
      erasure: "Запросы на удаление",
      health: "Состояние системы",
    },
  },
};

export function getOperatorMenuCopy(locale: InterfaceLocale) {
  return COPY[locale];
}
