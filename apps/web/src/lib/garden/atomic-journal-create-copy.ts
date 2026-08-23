import type { PublicLocale } from "@/lib/public-localization";

export interface AtomicJournalCreateCopy {
  localOnly: string;
  waitingMedia: string;
  publishing: string;
  published: string;
  failed: string;
  cancelPublishing: string;
  publish: string;
  disclosure: string;
  disclosureLink: string;
  photoEmpty: string;
  photoPreparing: string;
  photoReady: string;
  photoFailed: string;
}

const COPY: Record<PublicLocale, AtomicJournalCreateCopy> = {
  uk: {
    localOnly:
      "До публікації текст і фото залишаються лише в цій вкладці. Оновлення або закриття сторінки відкине їх.",
    waitingMedia: "Готуємо вибрані фото до публікації…",
    publishing: "Публікуємо один завершений запис…",
    published: "Запис опубліковано.",
    failed:
      "Запис не опубліковано. Виправте позначене фото або спробуйте опублікувати ще раз.",
    cancelPublishing: "Скасувати публікацію",
    publish: "Опублікувати",
    disclosure:
      "Я розумію, що цей запис і вибрані фото одразу стануть публічними.",
    disclosureLink: "Що саме буде публічним",
    photoEmpty: "Необов’язково: JPEG, PNG, WebP, HEIC або HEIF до 50 МіБ.",
    photoPreparing: "Фото готується локально в цій вкладці…",
    photoReady: "Фінальний WebP готовий до публікації.",
    photoFailed: "Фото не вдалося підготувати. Замініть або приберіть його.",
  },
  bg: {
    localOnly:
      "До публикуването текстът и снимките остават само в този раздел. Обновяване или затваряне на страницата ще ги отхвърли.",
    waitingMedia: "Подготвяме избраните снимки за публикуване…",
    publishing: "Публикуваме един завършен запис…",
    published: "Записът е публикуван.",
    failed:
      "Записът не е публикуван. Поправете отбелязаната снимка или опитайте да публикувате отново.",
    cancelPublishing: "Откажи публикуването",
    publish: "Публикувай",
    disclosure:
      "Разбирам, че този запис и избраните снимки веднага ще станат публични.",
    disclosureLink: "Какво точно ще бъде публично",
    photoEmpty: "По избор: JPEG, PNG, WebP, HEIC или HEIF до 50 MiB.",
    photoPreparing: "Снимката се подготвя локално в този раздел…",
    photoReady: "Финалният WebP е готов за публикуване.",
    photoFailed: "Снимката не можа да бъде подготвена. Заменете или я премахнете.",
  },
  ru: {
    localOnly:
      "До публикации текст и фото остаются только в этой вкладке. Обновление или закрытие страницы отбросит их.",
    waitingMedia: "Готовим выбранные фото к публикации…",
    publishing: "Публикуем одну завершённую запись…",
    published: "Запись опубликована.",
    failed:
      "Запись не опубликована. Исправьте отмеченное фото или попробуйте опубликовать снова.",
    cancelPublishing: "Отменить публикацию",
    publish: "Опубликовать",
    disclosure:
      "Я понимаю, что эта запись и выбранные фото сразу станут публичными.",
    disclosureLink: "Что именно будет публичным",
    photoEmpty: "Необязательно: JPEG, PNG, WebP, HEIC или HEIF до 50 МиБ.",
    photoPreparing: "Фото готовится локально в этой вкладке…",
    photoReady: "Финальный WebP готов к публикации.",
    photoFailed: "Фото не удалось подготовить. Замените или уберите его.",
  },
};

export function getAtomicJournalCreateCopy(locale: PublicLocale) {
  return COPY[locale];
}
