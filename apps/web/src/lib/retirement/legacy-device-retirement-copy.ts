import type { InterfaceLocale } from "@/lib/interface-localization";

interface Copy {
  ariaLabel: string;
  title: string;
  reason: string;
  states: {
    deleting: string;
    deletionBlocked: string;
    unresolved: string;
    cancelled: string;
  };
  actions: {
    retry: string;
    cancel: string;
    signOut: string;
    dismiss: string;
  };
}

const COPY: Record<InterfaceLocale, Copy> = {
  uk: {
    ariaLabel: "Очищення попередньої версії",
    title: "Очистіть дані попередньої версії",
    reason:
      "Попередній локальний режим OverGarden вимкнено. Цей браузер ще може містити його технічне сховище.",
    states: {
      deleting: "Перевіряємо та видаляємо лише відомі сховища OverGarden.",
      deletionBlocked:
        "Браузер не підтвердив безпечне очищення. Невизначені дані збережено без змін.",
      unresolved:
        "Не вдалося безпечно видалити сховище з невизначеною прив’язкою. Його збережено без змін, а сад залишається доступним.",
      cancelled: "Очищення скасовано. Відомі сховища залишено без змін.",
    },
    actions: {
      retry: "Спробувати ще раз",
      cancel: "Скасувати",
      signOut: "Вийти",
      dismiss: "Сховати",
    },
  },
  bg: {
    ariaLabel: "Почистване на предишната версия",
    title: "Почистете данните от предишната версия",
    reason:
      "Предишният локален режим на OverGarden е изключен. Този браузър все още може да съдържа техническото му хранилище.",
    states: {
      deleting: "Проверяваме и изтриваме само познати хранилища на OverGarden.",
      deletionBlocked:
        "Браузърът не потвърди безопасното почистване. Неопределените данни са запазени без промяна.",
      unresolved:
        "Хранилище с неопределена връзка не можа да бъде изтрито безопасно. То е запазено без промяна, а градината остава достъпна.",
      cancelled:
        "Почистването е отменено. Познатите хранилища са запазени без промяна.",
    },
    actions: {
      retry: "Опитайте отново",
      cancel: "Отказ",
      signOut: "Изход",
      dismiss: "Скриване",
    },
  },
  ru: {
    ariaLabel: "Очистка предыдущей версии",
    title: "Очистите данные предыдущей версии",
    reason:
      "Предыдущий локальный режим OverGarden отключён. Этот браузер всё ещё может содержать его техническое хранилище.",
    states: {
      deleting: "Проверяем и удаляем только известные хранилища OverGarden.",
      deletionBlocked:
        "Браузер не подтвердил безопасную очистку. Неопределённые данные сохранены без изменений.",
      unresolved:
        "Хранилище с неопределённой привязкой не удалось безопасно удалить. Оно сохранено без изменений, а сад остаётся доступным.",
      cancelled:
        "Очистка отменена. Известные хранилища сохранены без изменений.",
    },
    actions: {
      retry: "Повторить",
      cancel: "Отменить",
      signOut: "Выйти",
      dismiss: "Скрыть",
    },
  },
};

export function getLegacyDeviceRetirementCopy(locale: InterfaceLocale): Copy {
  return COPY[locale];
}
