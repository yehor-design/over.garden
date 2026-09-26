import type { ReactNode } from "react";

import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * «Показати ще» (DESIGN.md §5.26, ADR-0034 D13): every long list is read in
 * portions of twenty, with a visible link to the next portion at its end.
 *
 * The link is a real address — the next portion's own `?cursor=` or `?page=`
 * — so it works before and without JavaScript and a crawler follows it
 * (ADR-0024 D3, ADR-0032). With JavaScript the next portion is fetched when
 * the link comes within a screen of the viewport and appended in place; the
 * link then points to the portion after that.
 */
export const LIST_PORTION_SIZE = 20;

/**
 * Portions appended by scrolling alone before the link waits for a press, so
 * the page's footer — privacy, support, the publication disclosure — can
 * still be reached. A press lets the next few load by themselves again.
 */
export const SHOW_MORE_AUTO_PORTIONS = 3;

/** Where the list goes next: the address for the link, the token for the fetch. */
export interface ShowMoreNext {
  href: string;
  token: string;
}

/** One more portion, rendered on the server exactly as the page renders its first. */
export interface ShowMorePortion {
  items: ReactNode;
  next: ShowMoreNext | null;
}

/**
 * The list's own Server Function, bound on the server to the list's context
 * (its filters, its language). `null` means there is nothing past the token —
 * the link then navigates, and the address answers its own 404.
 */
export type ShowMoreLoader = (token: string) => Promise<ShowMorePortion | null>;

export interface ShowMoreCopy {
  more: string;
  loading: string;
  /** Said once, politely, when a portion is appended. */
  added: string;
  failed: string;
}

const COPY: Record<InterfaceLocale, ShowMoreCopy> = {
  uk: {
    more: "Показати ще",
    loading: "Завантажуємо…",
    added: "Список доповнено.",
    failed: "Не вдалося завантажити продовження. Натисніть «Показати ще».",
  },
  bg: {
    more: "Покажи още",
    loading: "Зареждаме…",
    added: "Списъкът е допълнен.",
    failed: "Продължението не се зареди. Натиснете „Покажи още“.",
  },
  ru: {
    more: "Показать ещё",
    loading: "Загружаем…",
    added: "Список дополнен.",
    failed: "Не удалось загрузить продолжение. Нажмите «Показать ещё».",
  },
};

export function getShowMoreCopy(locale: InterfaceLocale): ShowMoreCopy {
  return COPY[locale];
}
