import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * The words of an entry's own menu and its deletion (`OVE-488`). Deleting is
 * the one irreversible thing an owner does to an entry, so it lives behind the
 * menu rather than beside Save, and its confirmation names the entry and what
 * actually happens (ADR-0021): the entry leaves the owner's history and every
 * public page at once, its address answers that it was removed, its photos go,
 * and a cleaned technical record stays seven days to finish removing it from
 * search and storage.
 */
export interface EntryActionsCopy {
  /** The menu's name: "{title}" is the entry's. */
  menu: string;
  edit: string;
  openPublic: string;
  delete: string;
  deleteTitle: string;
  deleteBody: string;
  deleteConfirm: string;
  deleteCancel: string;
  deleting: string;
  deleted: string;
}

const uk: EntryActionsCopy = {
  menu: "Дії із записом «{title}»",
  edit: "Редагувати",
  openPublic: "Відкрити публічну сторінку",
  delete: "Видалити запис…",
  deleteTitle: "Видалити «{title}»?",
  deleteBody:
    "Запис одразу зникне з вашої історії, публічних сторінок і стрічки, а його адреса повідомлятиме, що запис видалено. Фото запису теж буде видалено. На 7 днів лишиться лише технічний очищений запис, щоб завершити видалення з пошуку й сховища. Скасувати видалення неможливо.",
  deleteConfirm: "Видалити назавжди",
  deleteCancel: "Скасувати",
  deleting: "Видаляємо…",
  deleted: "Запис «{title}» видалено.",
};

const bg: EntryActionsCopy = {
  menu: "Действия със записа „{title}“",
  edit: "Редактирай",
  openPublic: "Отвори публичната страница",
  delete: "Изтрий записа…",
  deleteTitle: "Да се изтрие ли „{title}“?",
  deleteBody:
    "Записът веднага изчезва от историята ви, публичните страници и потока, а адресът му ще съобщава, че е изтрит. Снимките на записа също се изтриват. За 7 дни остава само технически изчистен запис, за да завърши премахването от търсенето и хранилището. Изтриването не може да бъде отменено.",
  deleteConfirm: "Изтрий окончателно",
  deleteCancel: "Отказ",
  deleting: "Изтриваме…",
  deleted: "Записът „{title}“ е изтрит.",
};

const ru: EntryActionsCopy = {
  menu: "Действия с записью «{title}»",
  edit: "Редактировать",
  openPublic: "Открыть публичную страницу",
  delete: "Удалить запись…",
  deleteTitle: "Удалить «{title}»?",
  deleteBody:
    "Запись сразу исчезнет из вашей истории, публичных страниц и ленты, а её адрес будет сообщать, что запись удалена. Фото записи тоже будут удалены. На 7 дней останется только технический очищенный след, чтобы завершить удаление из поиска и хранилища. Отменить удаление нельзя.",
  deleteConfirm: "Удалить навсегда",
  deleteCancel: "Отмена",
  deleting: "Удаляем…",
  deleted: "Запись «{title}» удалена.",
};

const COPY: Record<InterfaceLocale, EntryActionsCopy> = { uk, bg, ru };

export function getEntryActionsCopy(locale: InterfaceLocale): EntryActionsCopy {
  return COPY[locale];
}

/** A template with the entry's own title in it. */
export function withEntryTitle(template: string, title: string): string {
  return template.replaceAll("{title}", title.trim() || "—");
}
