import type { JournalCoverControlsCopy } from "@/components/garden/journal-cover-controls";
import type { PublicLocale } from "@/lib/public-localization";

const COPY: Record<PublicLocale, JournalCoverControlsCopy> = {
  uk: {
    sectionLabel: "Обкладинка",
    sectionHint:
      "Необовʼязково. Без вибору обкладинкою стане перше фото в історії.",
    automatic: "Автоматично",
    useAsCover: "Зробити обкладинкою",
    uploadSeparate: "Окреме фото обкладинки",
    replaceSeparate: "Замінити обкладинку",
    removeCover: "Повернути автоматичну",
    previewLabel: "Попередній перегляд",
    noCover: "Без обкладинки",
    uploading: "Завантаження обкладинки…",
    keepAsCover: "Залишити як обкладинку",
    removeEverywhere: "Прибрати всюди",
    cancelRemoval: "Скасувати",
    removeInlinePrompt:
      "Це фото зараз є обкладинкою. Залишити його лише як обкладинку чи прибрати всюди?",
    eligibleInlineEmpty: "Додайте фото в історію, щоб обрати його обкладинкою.",
  },
  bg: {
    sectionLabel: "Корица",
    sectionHint:
      "По избор. Без избор корицата е първата снимка в историята.",
    automatic: "Автоматично",
    useAsCover: "Направи корица",
    uploadSeparate: "Отделна снимка за корица",
    replaceSeparate: "Смени корицата",
    removeCover: "Върни автоматичната",
    previewLabel: "Преглед",
    noCover: "Без корица",
    uploading: "Качване на корица…",
    keepAsCover: "Запази само като корица",
    removeEverywhere: "Премахни навсякъде",
    cancelRemoval: "Отказ",
    removeInlinePrompt:
      "Тази снимка е корицата. Да я запазим само като корица или да я премахнем навсякъде?",
    eligibleInlineEmpty:
      "Добавете снимка в историята, за да я изберете за корица.",
  },
  ru: {
    sectionLabel: "Обложка",
    sectionHint:
      "Необязательно. Без выбора обложкой станет первое фото в истории.",
    automatic: "Автоматически",
    useAsCover: "Сделать обложкой",
    uploadSeparate: "Отдельное фото обложки",
    replaceSeparate: "Заменить обложку",
    removeCover: "Вернуть автоматическую",
    previewLabel: "Предпросмотр",
    noCover: "Без обложки",
    uploading: "Загрузка обложки…",
    keepAsCover: "Оставить только обложкой",
    removeEverywhere: "Убрать везде",
    cancelRemoval: "Отмена",
    removeInlinePrompt:
      "Это фото сейчас обложка. Оставить его только обложкой или убрать везде?",
    eligibleInlineEmpty:
      "Добавьте фото в историю, чтобы выбрать его обложкой.",
  },
};

export function getJournalCoverControlsCopy(
  locale: PublicLocale,
): JournalCoverControlsCopy {
  return COPY[locale];
}
