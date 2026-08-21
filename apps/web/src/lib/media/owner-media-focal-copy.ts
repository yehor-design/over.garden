import type { OwnerMediaFocalPanelCopy } from "@/components/media/owner-media-focal-panel";
import type { PublicLocale } from "@/lib/public-localization";

const COPY: Record<PublicLocale, OwnerMediaFocalPanelCopy> = {
  uk: {
    label: "Точка фокусу",
    hint: "Натисніть на фото або рухайте стрілками, щоб залишити в кадрі головний обʼєкт.",
    coverPreview: "Картка (обрізка)",
    containPreview: "Повний кадр",
    save: "Зберегти фокус",
    saving: "Збереження…",
    saved: "Фокус збережено.",
    clamped:
      "Значення було поза межами, тому показано центр без зміни збереженого фокусу.",
    error: "Не вдалося зберегти фокус. Оновіть сторінку й спробуйте ще раз.",
  },
  bg: {
    label: "Точка на фокус",
    hint: "Докоснете снимката или ползвайте стрелките, за да оставите обекта в кадър.",
    coverPreview: "Карта (изрязване)",
    containPreview: "Пълен кадър",
    save: "Запази фокуса",
    saving: "Запазване…",
    saved: "Фокусът е запазен.",
    clamped:
      "Стойността беше извън границите, затова показваме центъра без промяна на запазения фокус.",
    error: "Не успяхме да запазим фокуса. Презаредете и опитайте отново.",
  },
  ru: {
    label: "Точка фокуса",
    hint: "Нажмите на фото или стрелкими оставьте главный объект в кадре.",
    coverPreview: "Карточка (обрезка)",
    containPreview: "Полный кадр",
    save: "Сохранить фокус",
    saving: "Сохранение…",
    saved: "Фокус сохранён.",
    clamped:
      "Значение было вне границ, поэтому показан центр без изменения сохранённого фокуса.",
    error: "Не удалось сохранить фокус. Обновите страницу и попробуйте снова.",
  },
};

export function getOwnerMediaFocalPanelCopy(
  locale: PublicLocale,
): OwnerMediaFocalPanelCopy {
  return COPY[locale];
}
