import type { InterfaceLocale } from "@/lib/interface-localization";

/** The editor's names for its frame and its controls (DESIGN.md §5.25). */
export interface PhotoCropEditorCopy {
  frameLabel: string;
  frameHint: string;
  rotate: string;
  reset: string;
  zoom: string;
  cancel: string;
  done: string;
  preparing: string;
  unreadable: string;
}

/**
 * The words of the one photo a space or a plant or animal carries
 * (DESIGN.md §5.25): the same component in both steppers and both settings
 * pages, so one set of words. Upload states are words, and a failure says
 * what to do.
 */
export interface OwnedPhotoCopy {
  add: string;
  hint: string;
  uploading: string;
  replace: string;
  remove: string;
  retry: string;
  failed: string;
  /** The staged photo expired or was already used by the time it was saved. */
  unavailable: string;
  editor: PhotoCropEditorCopy;
}

const uk: OwnedPhotoCopy = {
  add: "Додати фото",
  hint: "З камери або з галереї.",
  uploading: "Завантажуємо фото…",
  replace: "Замінити",
  remove: "Прибрати",
  retry: "Спробувати ще раз",
  failed: "Фото не завантажилося. Спробуйте ще раз або виберіть інше.",
  unavailable: "Фото вже недоступне. Додайте його ще раз.",
  editor: {
    frameLabel: "Кадр фото",
    frameHint:
      "Перетягніть фото в кадрі. Стрілки зсувають його, + і − змінюють масштаб, R повертає.",
    rotate: "Повернути",
    reset: "Скинути",
    zoom: "Масштаб",
    cancel: "Скасувати",
    done: "Готово",
    preparing: "Готуємо фото…",
    unreadable: "Це фото не вдалося відкрити. Виберіть інше.",
  },
};

const bg: OwnedPhotoCopy = {
  add: "Добави снимка",
  hint: "От камерата или от галерията.",
  uploading: "Качваме снимката…",
  replace: "Замени",
  remove: "Премахни",
  retry: "Опитай отново",
  failed: "Снимката не се качи. Опитайте отново или изберете друга.",
  unavailable: "Снимката вече не е достъпна. Добавете я отново.",
  editor: {
    frameLabel: "Кадър на снимката",
    frameHint:
      "Плъзнете снимката в кадъра. Стрелките я местят, + и − променят мащаба, R я завърта.",
    rotate: "Завърти",
    reset: "Нулирай",
    zoom: "Мащаб",
    cancel: "Отказ",
    done: "Готово",
    preparing: "Подготвяме снимката…",
    unreadable: "Тази снимка не може да се отвори. Изберете друга.",
  },
};

const ru: OwnedPhotoCopy = {
  add: "Добавить фото",
  hint: "С камеры или из галереи.",
  uploading: "Загружаем фото…",
  replace: "Заменить",
  remove: "Убрать",
  retry: "Попробовать ещё раз",
  failed: "Фото не загрузилось. Попробуйте ещё раз или выберите другое.",
  unavailable: "Фото уже недоступно. Добавьте его ещё раз.",
  editor: {
    frameLabel: "Кадр фото",
    frameHint:
      "Перетащите фото в кадре. Стрелки сдвигают его, + и − меняют масштаб, R поворачивает.",
    rotate: "Повернуть",
    reset: "Сбросить",
    zoom: "Масштаб",
    cancel: "Отмена",
    done: "Готово",
    preparing: "Готовим фото…",
    unreadable: "Это фото не удалось открыть. Выберите другое.",
  },
};

const COPY: Record<InterfaceLocale, OwnedPhotoCopy> = { uk, bg, ru };

export function getOwnedPhotoCopy(locale: InterfaceLocale): OwnedPhotoCopy {
  return COPY[locale];
}
