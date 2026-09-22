import type { PublicLocale } from "@/lib/public-localization";

/**
 * The words the discovery bar says the same way on every listing
 * (DESIGN.md §5.1). A listing's own copy names its facets; these name the
 * bar's own controls, so "Close" never drifts into "Reset" on one page.
 */
export interface FilterBarChromeCopy {
  /** The panel's Close: discards the draft, keeps the committed view. */
  close: string;
  /** The panel's submit. */
  showResults: string;
  /** Removes the secondary filters and keeps the search. */
  clearFilters: string;
  /** Announced while a change is on its way. */
  pending: string;
  /** Under the panel's title: what applies and what does not. */
  panelDescription: string;
  /** Names the primary modes. */
  modes: string;
  /** "Фільтри (2)". */
  filtersWithCount: (count: number) => string;
}

const COPY: Record<PublicLocale, FilterBarChromeCopy> = {
  uk: {
    close: "Закрити",
    showResults: "Показати результати",
    clearFilters: "Очистити фільтри",
    pending: "Оновлюємо результати…",
    panelDescription:
      "Результати зміняться, коли ви натиснете «Показати результати». «Закрити» нічого не змінює.",
    modes: "Що показати",
    filtersWithCount: (count) => (count > 0 ? `Фільтри (${count})` : "Фільтри"),
  },
  bg: {
    close: "Затвори",
    showResults: "Покажи резултатите",
    clearFilters: "Изчисти филтрите",
    pending: "Обновяваме резултатите…",
    panelDescription:
      "Резултатите се променят, когато натиснете „Покажи резултатите“. „Затвори“ не променя нищо.",
    modes: "Какво да се покаже",
    filtersWithCount: (count) => (count > 0 ? `Филтри (${count})` : "Филтри"),
  },
  ru: {
    close: "Закрыть",
    showResults: "Показать результаты",
    clearFilters: "Очистить фильтры",
    pending: "Обновляем результаты…",
    panelDescription:
      "Результаты изменятся, когда вы нажмёте «Показать результаты». «Закрыть» ничего не меняет.",
    modes: "Что показать",
    filtersWithCount: (count) => (count > 0 ? `Фильтры (${count})` : "Фильтры"),
  },
};

export function getFilterBarChromeCopy(
  locale: PublicLocale,
): FilterBarChromeCopy {
  return COPY[locale];
}
