import type { PublicLocale } from "@/lib/public-localization";

export interface AtomicJournalEditCopy {
  localOnly: string;
  /** The staging lease could not be renewed (`OVE-372`, `OVE-458` AC4). */
  leaseAtRisk: string;
  waitingMedia: string;
  publishing: string;
  published: string;
  failed: string;
  cancelPublishing: string;
  save: string;
  cancelEditing: string;
  discardTitle: string;
  discardBody: string;
  keepEditing: string;
  discardChanges: string;
  conflictTitle: string;
  conflictBody: string;
  reloadLatest: string;
  copyLocalChanges: string;
  localChangesCopied: string;
  closeConflict: string;
  /**
   * A save refused for an ended session (`OVE-488` criterion 3): the edit is
   * still here, in this tab only, and signing in happens in another tab so
   * this one is not navigated away from it.
   */
  sessionEnded: string;
  signInNewTab: string;
}

const COPY: Record<PublicLocale, AtomicJournalEditCopy> = {
  uk: {
    leaseAtRisk:
      "Не вдається продовжити зберігання завантажених фото. Збережіть зараз, щоб не втратити їх.",
    localOnly: "Зміни залишаються лише в цій вкладці, доки ви не збережете їх.",
    waitingMedia: "Готуємо змінені фото до збереження…",
    publishing: "Зберігаємо весь запис одним оновленням…",
    published: "Зміни збережено.",
    failed: "Зміни не збережено. Виправте позначене фото або спробуйте ще раз.",
    cancelPublishing: "Скасувати збереження",
    save: "Зберегти зміни",
    cancelEditing: "Скасувати редагування",
    discardTitle: "Відкинути локальні зміни?",
    discardBody:
      "Незбережений текст і зміни фото існують лише в цій вкладці та будуть втрачені.",
    keepEditing: "Продовжити редагування",
    discardChanges: "Відкинути зміни",
    conflictTitle: "Запис уже змінився",
    conflictBody:
      "Інша вкладка або пристрій зберегли новішу версію. Скопіюйте свої зміни за потреби, а потім завантажте актуальну версію.",
    reloadLatest: "Завантажити актуальну версію",
    copyLocalChanges: "Скопіювати мої зміни",
    localChangesCopied: "Ваші зміни скопійовано.",
    closeConflict: "Продовжити редагування",
    sessionEnded:
      "Сесія завершилася, і зміни не збережено. Вони залишаються лише в цій вкладці: увійдіть у новій вкладці й натисніть «Зберегти зміни» ще раз.",
    signInNewTab: "Увійти в новій вкладці",
  },
  bg: {
    leaseAtRisk:
      "Съхранението на качените снимки не може да бъде подновено. Запазете сега, за да не ги загубите.",
    localOnly: "Промените остават само в този раздел, докато не ги запазите.",
    waitingMedia: "Подготвяме променените снимки за запазване…",
    publishing: "Запазваме целия запис с една актуализация…",
    published: "Промените са запазени.",
    failed:
      "Промените не са запазени. Поправете отбелязаната снимка или опитайте отново.",
    cancelPublishing: "Откажи запазването",
    save: "Запази промените",
    cancelEditing: "Откажи редактирането",
    discardTitle: "Да се отхвърлят ли локалните промени?",
    discardBody:
      "Незапазеният текст и промените по снимките съществуват само в този раздел и ще бъдат загубени.",
    keepEditing: "Продължи редактирането",
    discardChanges: "Отхвърли промените",
    conflictTitle: "Записът вече е променен",
    conflictBody:
      "Друг раздел или устройство е запазил по-нова версия. При нужда копирайте промените си, след което заредете актуалната версия.",
    reloadLatest: "Зареди актуалната версия",
    copyLocalChanges: "Копирай моите промени",
    localChangesCopied: "Промените ви са копирани.",
    closeConflict: "Продължи редактирането",
    sessionEnded:
      "Сесията изтече и промените не са запазени. Те са само в този раздел: влезте в нов раздел и натиснете „Запази промените“ отново.",
    signInNewTab: "Вход в нов раздел",
  },
  ru: {
    leaseAtRisk:
      "Не удаётся продлить хранение загруженных фото. Сохраните сейчас, чтобы не потерять их.",
    localOnly:
      "Изменения остаются только в этой вкладке, пока вы их не сохраните.",
    waitingMedia: "Готовим изменённые фото к сохранению…",
    publishing: "Сохраняем всю запись одним обновлением…",
    published: "Изменения сохранены.",
    failed:
      "Изменения не сохранены. Исправьте отмеченное фото или попробуйте ещё раз.",
    cancelPublishing: "Отменить сохранение",
    save: "Сохранить изменения",
    cancelEditing: "Отменить редактирование",
    discardTitle: "Отменить локальные изменения?",
    discardBody:
      "Несохранённый текст и изменения фотографий существуют только в этой вкладке и будут потеряны.",
    keepEditing: "Продолжить редактирование",
    discardChanges: "Отменить изменения",
    conflictTitle: "Запись уже изменилась",
    conflictBody:
      "Другая вкладка или устройство сохранили более новую версию. При необходимости скопируйте свои изменения, затем загрузите актуальную версию.",
    reloadLatest: "Загрузить актуальную версию",
    copyLocalChanges: "Скопировать мои изменения",
    localChangesCopied: "Ваши изменения скопированы.",
    closeConflict: "Продолжить редактирование",
    sessionEnded:
      "Сессия завершилась, и изменения не сохранены. Они есть только в этой вкладке: войдите в новой вкладке и нажмите «Сохранить изменения» ещё раз.",
    signInNewTab: "Войти в новой вкладке",
  },
};

export function getAtomicJournalEditCopy(locale: PublicLocale) {
  return COPY[locale];
}
