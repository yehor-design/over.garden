import type { InterfaceLocale } from "@/lib/interface-localization";

type VisibleState =
  | "offered"
  | "transferring"
  | "verifying"
  | "deleting"
  | "completed"
  | "failed_retryable"
  | "conflict_blocked"
  | "another_account"
  | "foreign_or_orphan_retained"
  | "divergent_copy"
  | "bounded_inventory"
  | "deletion_blocked"
  | "session_changed";

interface Copy {
  ariaLabel: string;
  title: string;
  reason: string;
  windowEnds: string;
  counts(input: {
    drafts: number;
    mutations: number;
    mediaIntents: number;
  }): string;
  progress(verified: number, total: number): string;
  states: Record<VisibleState, string>;
  actions: {
    transfer: string;
    retry: string;
    cancel: string;
    signOut: string;
    discard: string;
    dismiss: string;
    keepDevice: string;
    keepServer: string;
  };
  discard: {
    title: string;
    firstDescription: string;
    secondDescription: string;
    cancel: string;
    firstAction: string;
    secondAction: string;
  };
}

const COPY: Record<InterfaceLocale, Omit<Copy, "counts" | "progress">> = {
  uk: {
    ariaLabel: "Дані цього пристрою",
    title: "Збережіть старі записи цього пристрою",
    reason:
      "OverGarden тепер зберігає чернетки й записи на сервері, а не в браузері.",
    windowEnds:
      "Перенесення доступне до наступного online-only оновлення (OVE-323 production). Якщо нічого не робити, дані залишаться лише на цьому пристрої до цього оновлення.",
    states: {
      offered: "Старі дані готові до перенесення.",
      transferring: "Переносимо один елемент. Ви можете продовжувати роботу.",
      verifying:
        "Перевіряємо збереження на сервері перед видаленням з пристрою.",
      deleting:
        "Видаляємо лише вже перевірені дані OverGarden з цього пристрою.",
      completed: "Перенесення й очищення цього пристрою підтверджено.",
      failed_retryable: "Перенесення не завершено. Дані на пристрої збережено.",
      conflict_blocked: "Знайдено конфлікт. Дані на пристрої не видалено.",
      another_account:
        "На пристрої є дані іншого облікового запису. Їхній вміст не відкривався.",
      foreign_or_orphan_retained:
        "На пристрої лишилися неприв’язані або чужі дані. Вони не відкривалися й не видалялися.",
      divergent_copy:
        "Версія на пристрої відрізняється від серверної. Виберіть, яку залишити.",
      bounded_inventory:
        "Даних більше за безпечну межу одного перегляду. Вони залишилися на пристрої.",
      deletion_blocked:
        "Браузер не підтвердив очищення. Дані не вважаються видаленими.",
      session_changed:
        "Обліковий запис або сесія змінилися. Перенесення зупинено без видалення.",
    },
    actions: {
      transfer: "Перенести",
      retry: "Спробувати ще раз",
      cancel: "Скасувати",
      signOut: "Вийти",
      discard: "Видалити",
      dismiss: "Сховати",
      keepDevice: "Залишити версію з пристрою",
      keepServer: "Залишити серверну версію",
    },
    discard: {
      title: "Видалити старі дані цього пристрою?",
      firstDescription:
        "Ця дія видалить лише показані чернетки, записи й фото OverGarden поточного облікового запису на цьому пристрої.",
      secondDescription:
        "Підтвердьте ще раз: після цього локальні дані неможливо буде відновити.",
      cancel: "Не видаляти",
      firstAction: "Підтвердити видалення",
      secondAction: "Видалити безповоротно",
    },
  },
  bg: {
    ariaLabel: "Данни на това устройство",
    title: "Запазете старите записи от това устройство",
    reason:
      "OverGarden вече пази черновите и записите на сървъра, а не в браузъра.",
    windowEnds:
      "Прехвърлянето е достъпно до следващото online-only обновяване (OVE-323 production). Ако не направите нищо, данните остават само на това устройство до обновяването.",
    states: {
      offered: "Старите данни са готови за прехвърляне.",
      transferring: "Прехвърляме един елемент. Можете да продължите работа.",
      verifying:
        "Проверяваме записа на сървъра преди изтриване от устройството.",
      deleting:
        "Изтриваме само вече проверените данни на OverGarden от това устройство.",
      completed: "Прехвърлянето и почистването на устройството са потвърдени.",
      failed_retryable:
        "Прехвърлянето не завърши. Данните на устройството са запазени.",
      conflict_blocked: "Има конфликт. Данните на устройството не са изтрити.",
      another_account:
        "На устройството има данни на друг акаунт. Съдържанието им не е отваряно.",
      foreign_or_orphan_retained:
        "Останаха непривързани или чужди данни. Те не са отваряни или изтривани.",
      divergent_copy:
        "Версията на устройството се различава от сървърната. Изберете коя да остане.",
      bounded_inventory:
        "Данните са над безопасната граница за един преглед. Те остават на устройството.",
      deletion_blocked:
        "Браузърът не потвърди почистването. Данните не се считат за изтрити.",
      session_changed:
        "Акаунтът или сесията се промениха. Прехвърлянето спря без изтриване.",
    },
    actions: {
      transfer: "Прехвърляне",
      retry: "Опитайте отново",
      cancel: "Отказ",
      signOut: "Изход",
      discard: "Изтриване",
      dismiss: "Скриване",
      keepDevice: "Запазване на версията от устройството",
      keepServer: "Запазване на сървърната версия",
    },
    discard: {
      title: "Да се изтрият ли старите данни на това устройство?",
      firstDescription:
        "Това изтрива само показаните чернови, записи и снимки на OverGarden за текущия акаунт на това устройство.",
      secondDescription:
        "Потвърдете още веднъж: локалните данни няма да могат да бъдат възстановени.",
      cancel: "Без изтриване",
      firstAction: "Потвърждаване на изтриването",
      secondAction: "Безвъзвратно изтриване",
    },
  },
  ru: {
    ariaLabel: "Данные этого устройства",
    title: "Сохраните старые записи с этого устройства",
    reason:
      "OverGarden теперь хранит черновики и записи на сервере, а не в браузере.",
    windowEnds:
      "Перенос доступен до следующего online-only обновления (OVE-323 production). Если ничего не делать, данные останутся только на этом устройстве до обновления.",
    states: {
      offered: "Старые данные готовы к переносу.",
      transferring: "Переносим один элемент. Можно продолжать работу.",
      verifying:
        "Проверяем сохранение на сервере перед удалением с устройства.",
      deleting:
        "Удаляем только уже проверенные данные OverGarden с этого устройства.",
      completed: "Перенос и очистка этого устройства подтверждены.",
      failed_retryable: "Перенос не завершён. Данные на устройстве сохранены.",
      conflict_blocked: "Обнаружен конфликт. Данные на устройстве не удалены.",
      another_account:
        "На устройстве есть данные другой учётной записи. Их содержимое не открывалось.",
      foreign_or_orphan_retained:
        "Остались непривязанные или чужие данные. Они не открывались и не удалялись.",
      divergent_copy:
        "Версия на устройстве отличается от серверной. Выберите, какую оставить.",
      bounded_inventory:
        "Объём данных превышает безопасный предел одного просмотра. Они оставлены на устройстве.",
      deletion_blocked:
        "Браузер не подтвердил очистку. Данные не считаются удалёнными.",
      session_changed:
        "Учётная запись или сессия изменились. Перенос остановлен без удаления.",
    },
    actions: {
      transfer: "Перенести",
      retry: "Повторить",
      cancel: "Отменить",
      signOut: "Выйти",
      discard: "Удалить",
      dismiss: "Скрыть",
      keepDevice: "Оставить версию с устройства",
      keepServer: "Оставить серверную версию",
    },
    discard: {
      title: "Удалить старые данные на этом устройстве?",
      firstDescription:
        "Будут удалены только показанные черновики, записи и фото OverGarden текущей учётной записи на этом устройстве.",
      secondDescription:
        "Подтвердите ещё раз: после этого локальные данные нельзя будет восстановить.",
      cancel: "Не удалять",
      firstAction: "Подтвердить удаление",
      secondAction: "Удалить безвозвратно",
    },
  },
};

export function getLegacyDeviceRetirementCopy(locale: InterfaceLocale): Copy {
  const copy = COPY[locale];
  const number = new Intl.NumberFormat(
    locale === "uk" ? "uk-UA" : locale === "bg" ? "bg-BG" : "ru-RU",
  );
  return {
    ...copy,
    counts: ({ drafts, mutations, mediaIntents }) =>
      locale === "uk"
        ? `Чернетки: ${number.format(drafts)}. Записи: ${number.format(mutations)}. Фото: ${number.format(mediaIntents)}.`
        : locale === "bg"
          ? `Чернови: ${number.format(drafts)}. Записи: ${number.format(mutations)}. Снимки: ${number.format(mediaIntents)}.`
          : `Черновики: ${number.format(drafts)}. Записи: ${number.format(mutations)}. Фото: ${number.format(mediaIntents)}.`,
    progress: (verified, total) =>
      locale === "uk"
        ? `Перевірено ${number.format(verified)} з ${number.format(total)}.`
        : locale === "bg"
          ? `Проверени ${number.format(verified)} от ${number.format(total)}.`
          : `Проверено ${number.format(verified)} из ${number.format(total)}.`,
  };
}
