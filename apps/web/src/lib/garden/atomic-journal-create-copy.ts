import type { PublicLocale } from "@/lib/public-localization";

export interface AtomicJournalCreateCopy {
  localOnly: string;
  /**
   * The staging lease could not be renewed (`OVE-372`, `OVE-458` AC4). A
   * failed touch used to be swallowed, so a gardener kept writing over
   * photographs on their way out and found out when Publish failed.
   */
  leaseAtRisk: string;
  waitingMedia: string;
  publishing: string;
  published: string;
  failed: string;
  cancelPublishing: string;
  publish: string;
  /**
   * What pressing Publish does, beside the control that does it (`OVE-458`
   * AC3). The product has no drafts and no private entries: an entry is public
   * and indexable the moment it lands, and the reader is told so where the
   * decision is made rather than in a notice three sections away.
   */
  publishMeaning: string;
  disclosure: string;
  disclosureLink: string;
  photoEmpty: string;
  photoPreparing: string;
  photoReady: string;
  photoFailed: string;
  /**
   * Leaving with unpublished work (`OVE-458` AC5). Nothing is durable until an
   * acknowledged Publish, so the warning names what is lost rather than asking
   * "Are you sure?".
   */
  leaveTitle: string;
  leaveDescription: string;
  leaveConfirm: string;
  leaveCancel: string;
}

const COPY: Record<PublicLocale, AtomicJournalCreateCopy> = {
  uk: {
    leaseAtRisk:
      "Не вдається продовжити зберігання завантажених фото. Опублікуйте зараз, щоб не втратити їх.",
    localOnly:
      "До публікації текст і фото залишаються лише в цій вкладці. Оновлення або закриття сторінки відкине їх.",
    waitingMedia: "Готуємо вибрані фото до публікації…",
    publishing: "Публікуємо один завершений запис…",
    published: "Запис опубліковано.",
    failed:
      "Запис не опубліковано. Виправте позначене фото або спробуйте опублікувати ще раз.",
    cancelPublishing: "Скасувати публікацію",
    publishMeaning:
      "Запис одразу стає публічним і потрапляє в пошук. Чернеток немає.",
    publish: "Опублікувати",
    disclosure:
      "Я розумію, що цей запис і вибрані фото одразу стануть публічними.",
    disclosureLink: "Що саме буде публічним",
    photoEmpty: "Необов’язково: JPEG, PNG, WebP, HEIC або HEIF до 50 МіБ.",
    photoPreparing: "Фото готується локально в цій вкладці…",
    photoReady: "Фінальний WebP готовий до публікації.",
    photoFailed: "Фото не вдалося підготувати. Замініть або приберіть його.",
    leaveTitle: "Піти без публікації?",
    leaveDescription:
      "Цей запис і вибрані фото ще ніде не збережені. Якщо піти зараз, вони зникнуть — чернеток немає.",
    leaveConfirm: "Піти й відкинути",
    leaveCancel: "Залишитися",
  },
  bg: {
    leaseAtRisk:
      "Съхранението на качените снимки не може да бъде подновено. Публикувайте сега, за да не ги загубите.",
    localOnly:
      "До публикуването текстът и снимките остават само в този раздел. Обновяване или затваряне на страницата ще ги отхвърли.",
    waitingMedia: "Подготвяме избраните снимки за публикуване…",
    publishing: "Публикуваме един завършен запис…",
    published: "Записът е публикуван.",
    failed:
      "Записът не е публикуван. Поправете отбелязаната снимка или опитайте да публикувате отново.",
    cancelPublishing: "Откажи публикуването",
    publishMeaning:
      "Записът веднага става публичен и влиза в търсенето. Няма чернови.",
    publish: "Публикувай",
    disclosure:
      "Разбирам, че този запис и избраните снимки веднага ще станат публични.",
    disclosureLink: "Какво точно ще бъде публично",
    photoEmpty: "По избор: JPEG, PNG, WebP, HEIC или HEIF до 50 MiB.",
    photoPreparing: "Снимката се подготвя локално в този раздел…",
    photoReady: "Финалният WebP е готов за публикуване.",
    photoFailed: "Снимката не можа да бъде подготвена. Заменете или я премахнете.",
    leaveTitle: "Да излезете без публикуване?",
    leaveDescription:
      "Този запис и избраните снимки още не са запазени никъде. Ако излезете сега, те изчезват — чернови няма.",
    leaveConfirm: "Излез и отхвърли",
    leaveCancel: "Остани",
  },
  ru: {
    leaseAtRisk:
      "Не удаётся продлить хранение загруженных фото. Опубликуйте сейчас, чтобы не потерять их.",
    localOnly:
      "До публикации текст и фото остаются только в этой вкладке. Обновление или закрытие страницы отбросит их.",
    waitingMedia: "Готовим выбранные фото к публикации…",
    publishing: "Публикуем одну завершённую запись…",
    published: "Запись опубликована.",
    failed:
      "Запись не опубликована. Исправьте отмеченное фото или попробуйте опубликовать снова.",
    cancelPublishing: "Отменить публикацию",
    publishMeaning:
      "Запись сразу становится публичной и попадает в поиск. Черновиков нет.",
    publish: "Опубликовать",
    disclosure:
      "Я понимаю, что эта запись и выбранные фото сразу станут публичными.",
    disclosureLink: "Что именно будет публичным",
    photoEmpty: "Необязательно: JPEG, PNG, WebP, HEIC или HEIF до 50 МиБ.",
    photoPreparing: "Фото готовится локально в этой вкладке…",
    photoReady: "Финальный WebP готов к публикации.",
    photoFailed: "Фото не удалось подготовить. Замените или уберите его.",
    leaveTitle: "Уйти без публикации?",
    leaveDescription:
      "Эта запись и выбранные фото ещё нигде не сохранены. Если уйти сейчас, они исчезнут — черновиков нет.",
    leaveConfirm: "Уйти и отбросить",
    leaveCancel: "Остаться",
  },
};

export function getAtomicJournalCreateCopy(locale: PublicLocale) {
  return COPY[locale];
}
